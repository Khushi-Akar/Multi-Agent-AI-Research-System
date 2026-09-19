# Multi-Agent Research System

Give it a topic. Four agents search the web, read the most useful page, write a
structured report, and then grade that report out of ten. You can run it in the
terminal, in the browser, or try the live hosted version below.

Built with LangChain agents on Groq, Tavily for search, FastAPI for the API, and
React for the interface.

---

## 🚀 Live Demo

**Frontend:** [https://multi-agent-ai-research-system-kappa.vercel.app/](https://multi-agent-ai-research-system-kappa.vercel.app/)
**Backend API:** [https://multi-agent-ai-research-system-3hwc.onrender.com/](https://multi-agent-ai-research-system-3hwc.onrender.com/)

Just open the frontend link, type a topic, and press **Start research** — nothing to install.

> Note: the backend is hosted on Render's free tier, which spins down after inactivity. The first request after a period of no traffic can take 30–60 seconds to wake up; after that it responds normally.

---

## How it works

```
topic
  │
  ├─ 1. Search agent   →  web_search (Tavily)     → titles, URLs, snippets
  ├─ 2. Reader agent   →  scrape_url (BeautifulSoup) → clean page text
  ├─ 3. Writer chain   →  prompt | llm | parser   → the report
  └─ 4. Critic chain   →  prompt | llm | parser   → score + feedback
```

Steps 1 and 2 are tool-calling agents: the model decides when to call the tool
and what to pass it. Steps 3 and 4 are plain LCEL chains, because writing and
reviewing need no tools.

Every step writes into a single `state` dictionary, and each step reads what the
previous one produced.

---

## Project structure

```
multi-agent-system/
├── tools.py             web_search and scrape_url, the two LangChain tools
├── agents.py            agent builders, writer chain, critic chain
├── pipeline.py          runs all four steps in the terminal
├── api.py               FastAPI wrapper that streams each step to the browser
├── requirements.txt
├── .env.example         template for your keys
├── .gitignore
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx        mounts React
        ├── App.jsx         state, the SSE reader, page layout
        ├── components.jsx  step rail, output panels, report, review
        ├── steps.js        the four step definitions
        └── styles.css      all styling
```

---

## Option 1: Use the Hosted App

Open the frontend link above and start researching — no setup required. See the Live Demo section for details and the cold-start note.

## Option 2: Run It Locally

You need Python 3.10+, Node 18+, and two free API keys:

- Groq: https://console.groq.com/keys
- Tavily: https://app.tavily.com

### 1. Backend

```bash
git clone https://github.com/<your-username>/multi-agent-system.git
cd multi-agent-system

python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r backend/requirements.txt
```

Create your `.env`:

```bash
cp .env.example .env     # Windows: copy .env.example .env
```

Then open `.env` and paste in your two keys.

### 2. Frontend

```bash
cd frontend
npm install
cd ..
```

---

## Running it locally

### Terminal only

```bash
python pipeline.py
```

It asks for a topic and prints each stage as it completes.

### With the interface

Two terminals, both with the virtual environment active in the first.

Terminal 1, the API:

```bash
uvicorn api:app --reload --port 8000
```

Terminal 2, the interface:

```bash
cd frontend
npm run dev
```

Open http://localhost:5173, type a topic, and press **Start research**.

The frontend calls `/api/research`, and Vite forwards that to
`http://127.0.0.1:8000` using the proxy in `vite.config.js`. Both servers must be
running at the same time.

A full run takes roughly 30 to 90 seconds depending on the topic and how big the
scraped page is.

---

## Deployment

The live demo runs on:

- **Frontend** — deployed on [Vercel](https://vercel.com), built from the `frontend/` folder.
- **Backend** — deployed on [Render](https://render.com) as a web service running `uvicorn api:app`.

The deployed frontend points at the Render backend URL instead of `localhost:8000` (set via an environment variable / API base URL in the frontend config, rather than the Vite dev proxy used for local development). Both `GROQ_API_KEY` and `TAVILY_API_KEY` are set as environment variables on the Render service rather than via a `.env` file.

---

## API

**POST** `/api/research`

```json
{ "topic": "solid state batteries in 2026" }
```

Responds with a `text/event-stream`, not JSON. Frames arrive as each step
finishes:

| Event          | Payload                                         |
| -------------- | ----------------------------------------------- |
| `run_started`  | `{ topic }`                                     |
| `step`         | `{ id, status, content?, elapsed? }`            |
| `run_finished` | `{ elapsed }`                                   |
| `run_failed`   | `{ message }`                                   |

`id` is one of `search`, `read`, `write`, `critique`. `status` is `running` or
`done`.

**GET** `/api/health` returns `{"status": "ok"}`. On the hosted backend:
https://multi-agent-ai-research-system-3hwc.onrender.com/api/health

---

## When things break

**`TAVILY_API_KEY` errors or a 401 from Groq**
`.env` is missing, misspelled, or in the wrong folder. It belongs next to
`api.py`, and the keys need no quotes around them. On Render, check the
environment variables in the service settings instead.

**The UI says the backend replied 404 or nothing happens**
Locally: Uvicorn is not running — check http://127.0.0.1:8000/api/health in a browser tab.
On the hosted version: the Render backend may still be waking up from a cold start (see Live Demo note above) — wait a minute and retry.

**`Could not scrape URL`**
Normal. Plenty of sites block automated requests. The report still gets written
from the search results, just with less depth.

**Rate limit from Groq**
The free tier is generous but not unlimited. Wait a minute, or switch the model
in `agents.py`.

**Report is thin**
Raise `max_results` in `tools.py`, or the `3000` character cut in `scrape_url`.

---

## Ideas to build next

- Loop the critic back into the writer so low scores trigger a rewrite
- Save every run to SQLite and add a history sidebar
- Export to PDF alongside the Markdown download
- Swap the four hard-coded steps for a LangGraph state machine