// The four stages, in the order pipeline.py runs them.
// Keep the ids identical to the ones api.py sends.
export const STEPS = [
  { id: "search", title: "Search the web", detail: "Search agent · Tavily" },
  { id: "read", title: "Read the best source", detail: "Reader agent · page scraper" },
  { id: "write", title: "Draft the report", detail: "Writer chain" },
  { id: "critique", title: "Review the draft", detail: "Critic chain" },
];
