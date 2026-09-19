import { useRef, useState } from "react";
import { StepRail, RawPanel, ReportPanel, CriticPanel } from "./components.jsx";
import { STEPS } from "./steps.js";

const blankSteps = () =>
  Object.fromEntries(
    STEPS.map((s) => [s.id, { status: "waiting", content: "", elapsed: null }])
  );

export default function App() {
  const [topic, setTopic] = useState("");
  const [steps, setSteps] = useState(blankSteps);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(null);
  const [activeTopic, setActiveTopic] = useState("");
  const abortRef = useRef(null);

  const started = running || Object.values(steps).some((s) => s.status !== "waiting");

  function applyEvent(name, data) {
    if (name === "step") {
      setSteps((prev) => ({
        ...prev,
        [data.id]: {
          status: data.status,
          content: data.content ?? prev[data.id].content,
          elapsed: data.elapsed ?? prev[data.id].elapsed,
        },
      }));
    } else if (name === "run_finished") {
      setTotal(data.elapsed);
    } else if (name === "run_failed") {
      setError(data.message);
      setSteps((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          if (next[id].status === "running") next[id] = { ...next[id], status: "failed" };
        }
        return next;
      });
    }
  }

  async function startRun(event) {
    event.preventDefault();
    if (!topic.trim() || running) return;

    setSteps(blankSteps());
    setError("");
    setTotal(null);
    setActiveTopic(topic.trim());
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // In dev, VITE_API_URL is unset and "" + "/api/research" hits the Vite
      // proxy. In production, VITE_API_URL is your deployed backend's URL,
      // set as an environment variable on the hosting platform.
      const apiBase = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${apiBase}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Backend replied ${response.status}. Is uvicorn running on port 8000?`);
      }

      // Read the Server-Sent Event stream by hand. EventSource cannot send a
      // POST body, so we parse the frames ourselves.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          let name = "message";
          let raw = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) name = line.slice(6).trim();
            else if (line.startsWith("data:")) raw += line.slice(5).trim();
          }
          if (!raw) continue;
          applyEvent(name, JSON.parse(raw));
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stopRun() {
    abortRef.current?.abort();
    setRunning(false);
    setSteps((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (next[id].status === "running") next[id] = { ...next[id], status: "waiting" };
      }
      return next;
    });
  }

  return (
    <div className="shell">
      <header className="masthead">
        <span className="mark" aria-hidden="true" />
        <span className="wordmark">Research Console</span>
        <span className="pipeline-note">four agents, one topic</span>
      </header>

      <section className={started ? "ask ask-compact" : "ask"}>
        <h1>What should we research?</h1>
        <form className="ask-form" onSubmit={startRun}>
          <input
            className="ask-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Solid state batteries in 2026"
            disabled={running}
            autoFocus
          />
          {running ? (
            <button type="button" className="btn btn-stop" onClick={stopRun}>
              Stop
            </button>
          ) : (
            <button type="submit" className="btn" disabled={!topic.trim()}>
              Start research
            </button>
          )}
        </form>
        {!started && (
          <p className="ask-hint">
            The agents search, read one source closely, write a report, then grade it.
          </p>
        )}
      </section>

      {error && (
        <div className="alert" role="alert">
          <strong>The run stopped.</strong> {error}
        </div>
      )}

      {started && (
        <main className="work">
          <StepRail steps={steps} total={total} topic={activeTopic} />

          <div className="outputs">
            <RawPanel
              title="Sources found"
              empty="The search agent has not reported back yet."
              state={steps.search}
            />
            <RawPanel
              title="Page contents"
              empty="The reader agent has not opened a page yet."
              state={steps.read}
            />
            <ReportPanel state={steps.write} topic={activeTopic} />
            <CriticPanel state={steps.critique} />
          </div>
        </main>
      )}
    </div>
  );
}
