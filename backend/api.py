"""
FastAPI bridge between the research pipeline and the React UI.

Why this file exists:
  pipeline.py runs everything and prints to the terminal. The browser cannot read
  prints, and a full run takes 30-90 seconds, so a single JSON response would
  leave the user staring at a spinner. This file runs the same four steps but
  pushes each one to the browser the moment it finishes, using Server-Sent Events.

Run it with:
  uvicorn api:app --reload --port 8000
"""

import json
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents import build_search_agent, build_reader_agent, writer_chain, critic_chain

app = FastAPI(title="Multi-Agent Research System")

# The Vite dev server runs on a different port, so the browser needs permission
# to call this one. Add your deployed frontend URL here later.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResearchRequest(BaseModel):
    topic: str


def sse(event: str, payload: dict) -> str:
    """Format one Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def research_events(topic: str):
    """
    Generator that yields one SSE frame per pipeline stage.

    This is a normal (sync) generator, so FastAPI runs it in a worker thread.
    That means the blocking .invoke() calls are safe here.
    """
    state = {}
    started = time.time()

    def elapsed():
        return round(time.time() - started, 1)

    try:
        yield sse("run_started", {"topic": topic})

        # ---------- Step 1: search agent ----------
        yield sse("step", {"id": "search", "status": "running"})

        search_agent = build_search_agent()
        search_result = search_agent.invoke({
            "messages": [
                ("user", f"Find recent, reliable and detailed information about: {topic}")
            ]
        })
        state["search_results"] = search_result["messages"][-1].content

        yield sse("step", {
            "id": "search",
            "status": "done",
            "content": state["search_results"],
            "elapsed": elapsed(),
        })

        # ---------- Step 2: reader agent ----------
        yield sse("step", {"id": "read", "status": "running"})

        reader_agent = build_reader_agent()
        reader_result = reader_agent.invoke({
            "messages": [(
                "user",
                f"Based on the following search results about '{topic}', "
                f"pick the most relevant URL and scrape it for deeper content.\n\n"
                f"Search Results:\n{state['search_results'][:800]}"
            )]
        })
        state["scraped_content"] = reader_result["messages"][-1].content

        yield sse("step", {
            "id": "read",
            "status": "done",
            "content": state["scraped_content"],
            "elapsed": elapsed(),
        })

        # ---------- Step 3: writer chain ----------
        yield sse("step", {"id": "write", "status": "running"})

        research_combined = (
            f"SEARCH RESULTS:\n{state['search_results']}\n\n"
            f"DETAILED SCRAPED CONTENT:\n{state['scraped_content']}"
        )
        state["report"] = writer_chain.invoke({
            "topic": topic,
            "research": research_combined,
        })

        yield sse("step", {
            "id": "write",
            "status": "done",
            "content": state["report"],
            "elapsed": elapsed(),
        })

        # ---------- Step 4: critic chain ----------
        yield sse("step", {"id": "critique", "status": "running"})

        state["feedback"] = critic_chain.invoke({"report": state["report"]})

        yield sse("step", {
            "id": "critique",
            "status": "done",
            "content": state["feedback"],
            "elapsed": elapsed(),
        })

        yield sse("run_finished", {"elapsed": elapsed()})

    except Exception as exc:  # surface the real reason in the UI
        yield sse("run_failed", {
            "message": f"{type(exc).__name__}: {exc}",
        })


@app.post("/api/research")
def research(request: ResearchRequest):
    topic = request.topic.strip()
    if not topic:
        return StreamingResponse(
            iter([sse("run_failed", {"message": "Topic is empty."})]),
            media_type="text/event-stream",
        )

    return StreamingResponse(
        research_events(topic),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # stops nginx from buffering the stream
        },
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}
