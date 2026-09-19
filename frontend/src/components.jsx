import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { STEPS } from "./steps.js";

/* ------------------------------------------------------------------ */
/* Left rail: the run as a vertical timeline                           */
/* ------------------------------------------------------------------ */

export function StepRail({ steps, total, topic }) {
  const doneCount = STEPS.filter((s) => steps[s.id].status === "done").length;
  const progress = (doneCount / STEPS.length) * 100;

  return (
    <aside className="rail">
      <p className="rail-topic">{topic}</p>

      <ol className="rail-list">
        <span className="rail-line" aria-hidden="true">
          <span className="rail-line-fill" style={{ height: `${progress}%` }} />
        </span>

        {STEPS.map((step, index) => {
          const { status, elapsed } = steps[step.id];
          return (
            <li key={step.id} className={`rail-item is-${status}`}>
              <span className="rail-dot">{index + 1}</span>
              <span className="rail-body">
                <span className="rail-title">{step.title}</span>
                <span className="rail-detail">{step.detail}</span>
                {status === "running" && <span className="rail-status">working…</span>}
                {status === "done" && elapsed != null && (
                  <span className="rail-status">{elapsed}s in</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {total != null && <p className="rail-total">Finished in {total} seconds</p>}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Collapsible panel for the two raw agent outputs                     */
/* ------------------------------------------------------------------ */

export function RawPanel({ title, empty, state }) {
  const [open, setOpen] = useState(false);
  const ready = state.status === "done" && state.content;

  return (
    <section className="panel">
      <button
        className="panel-head"
        onClick={() => ready && setOpen(!open)}
        aria-expanded={open}
        disabled={!ready}
      >
        <h2>{title}</h2>
        <span className="panel-action">
          {ready ? (open ? "Hide" : "Show") : <Pulse status={state.status} />}
        </span>
      </button>

      {ready && open && <pre className="raw">{state.content}</pre>}
      {!ready && state.status !== "running" && <p className="panel-empty">{empty}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The report itself: the one piece of the page that gets full weight  */
/* ------------------------------------------------------------------ */

export function ReportPanel({ state, topic }) {
  if (state.status === "waiting") {
    return (
      <section className="panel">
        <div className="panel-head static">
          <h2>Report</h2>
        </div>
        <p className="panel-empty">The writer starts once both agents have reported back.</p>
      </section>
    );
  }

  if (state.status === "running" || !state.content) {
    return (
      <section className="panel">
        <div className="panel-head static">
          <h2>Report</h2>
          <span className="panel-action">
            <Pulse status="running" />
          </span>
        </div>
        <div className="skeleton">
          <span style={{ width: "72%" }} />
          <span style={{ width: "94%" }} />
          <span style={{ width: "88%" }} />
          <span style={{ width: "40%" }} />
        </div>
      </section>
    );
  }

  function download() {
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) || "report";
    const blob = new Blob([`# ${topic}\n\n${state.content}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel panel-report">
      <div className="panel-head static">
        <h2>Report</h2>
        <button className="link-btn" onClick={download}>
          Save as Markdown
        </button>
      </div>
      <article className="prose">
        <Markdown remarkPlugins={[remarkGfm]}>{state.content}</Markdown>
      </article>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Critic panel, with the score pulled out of the model's text         */
/* ------------------------------------------------------------------ */

export function CriticPanel({ state }) {
  if (state.status !== "done" || !state.content) {
    return (
      <section className="panel">
        <div className="panel-head static">
          <h2>Review</h2>
          {state.status === "running" && (
            <span className="panel-action">
              <Pulse status="running" />
            </span>
          )}
        </div>
        <p className="panel-empty">The critic grades the report last.</p>
      </section>
    );
  }

  const match = state.content.match(/Score:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  const score = match ? Number(match[1]) : null;

  return (
    <section className="panel panel-critic">
      <div className="panel-head static">
        <h2>Review</h2>
      </div>

      {score != null && (
        <div className="score">
          <span className="score-value">
            {score}
            <span className="score-max">/10</span>
          </span>
          <span className="score-bar">
            <span className="score-fill" style={{ width: `${score * 10}%` }} />
          </span>
        </div>
      )}

      <article className="prose prose-tight">
        <Markdown remarkPlugins={[remarkGfm]}>{state.content}</Markdown>
      </article>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Pulse({ status }) {
  if (status === "running") return <span className="pulse">running</span>;
  if (status === "failed") return <span className="pulse pulse-failed">stopped</span>;
  return <span className="pulse pulse-idle">queued</span>;
}
