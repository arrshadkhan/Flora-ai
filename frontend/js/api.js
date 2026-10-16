// Single place for all backend communication. Flip USE_MOCK to false once FastAPI is running.
const API_BASE_URL = "http://localhost:8000";
const USE_MOCK = false;

async function request(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    signal,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;

  if (response.status !== 204) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }
  }

  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null
        ? payload.detail || payload.error?.message
        : payload;

    throw new Error(
      detail
        ? String(detail)
        : `Request failed with HTTP ${response.status}`
    );
  }

  return payload;
}

/* ---------- Mock data (static UI stage only) ---------- */
const md = (...lines) => lines.join("\n");
const delay = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });

const mockReply = md(
  "Here is a mock reply from **Flora AI**. The backend is not connected yet.",
  "",
  "- Lists and `inline code` render",
  "- [Links](https://example.com) open in a new tab",
  "",
  "| Feature | Status |",
  "|---|---|",
  "| Tables | Ready |",
  "| Code blocks | Ready |",
  "",
  "```python",
  "def greet(name):",
  "    # Say hello",
  "    return f\"Hello, {name}!\"",
  "```",
);

const mockDb = [
  { id: "c1", title: "Explaining neural networks", messages: [
    { role: "user", content: "Explain how neural networks learn." },
    { role: "assistant", content: md("A neural network learns by **adjusting weights** to reduce its error.", "", "1. Make a prediction", "2. Measure the error (loss)", "3. Update weights with gradient descent") },
  ] },
  { id: "c2", title: "Python list deduplication", messages: [
    { role: "user", content: "How do I remove duplicates from a list in Python?" },
    { role: "assistant", content: md("Use `dict.fromkeys` to keep the original order:", "", "```python", "def dedupe(items):", "    return list(dict.fromkeys(items))", "```") },
  ] },
  { id: "c3", title: "Final-year project ideas", messages: [] },
];

const mock = {
  async list() { return mockDb.map(({ id, title }) => ({ id, title })); },
  async get(id) { return structuredClone(mockDb.find((c) => c.id === id)); },
  async create(title) {
    const conv = { id: crypto.randomUUID(), title, messages: [] };
    mockDb.unshift(conv);
    return { id: conv.id, title };
  },
  async remove(id) { mockDb.splice(mockDb.findIndex((c) => c.id === id), 1); return null; },
  async rename(id, title) { mockDb.find((c) => c.id === id).title = title; return { id, title }; },
  async send({ conversationId, messages, signal }) {
    await delay(900, signal);
    const conv = mockDb.find((c) => c.id === conversationId);
    if (conv) conv.messages = [...messages, { role: "assistant", content: mockReply }];
    return { content: mockReply };
  },
};

/* ---------- Public API ---------- */
export const healthCheck = () => request("/health");
export const getConversations = () => (USE_MOCK ? mock.list() : request("/conversations"));
export const getConversation = (id) => (USE_MOCK ? mock.get(id) : request(`/conversations/${id}`));
export const createConversation = (title) =>
  USE_MOCK ? mock.create(title) : request("/conversations", { method: "POST", body: { title } });
export const deleteConversation = (id) =>
  USE_MOCK ? mock.remove(id) : request(`/conversations/${id}`, { method: "DELETE" });
export const renameConversation = (id, title) =>
  USE_MOCK ? mock.rename(id, title) : request(`/conversations/${id}`, { method: "PATCH", body: { title } });

/* ---------- Streaming message API ---------- */
export async function sendMessage({
  conversationId,
  messages,
  model,
  signal,
  onChunk,
}) {
  // Keep mock mode available for frontend development.
  if (USE_MOCK) {
    const result = await mock.send({
      conversationId,
      messages,
      signal,
    });

    if (result.content) {
      onChunk?.(result.content);
    }

    return result;
  }

  // Request a streaming response from FastAPI.
  const response = await fetch(
    `${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify({ messages, model }),
    }
  );

  // Handle HTTP errors before reading the stream.
  if (!response.ok) {
    const raw = await response.text();
    let payload = null;

    try {
      payload = JSON.parse(raw);
    } catch {
      // The response wasn't JSON.
    }

    const detail =
      typeof payload === "object" && payload !== null
        ? payload.detail || payload.message
        : payload;

    throw new Error(
      detail || `Request failed with HTTP ${response.status}`
    );
  }

  // Verify that FastAPI returned an SSE stream.
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/event-stream")) {
    throw new Error(
      "Expected a streaming response from FastAPI. Check the backend endpoint."
    );
  }

  if (!response.body) {
    throw new Error("Streaming is not supported by this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let content = "";
  let completed = false;

  // Process one complete Server-Sent Event.
  function processEvent(block) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");

    if (!data) return;

    let event;

    try {
      event = JSON.parse(data);
    } catch {
      throw new Error("Flora received an invalid streaming event.");
    }

    if (event.type === "chunk") {
      if (typeof event.text === "string" && event.text.length > 0) {
        content += event.text;
        onChunk?.(event.text);
      }
    } else if (event.type === "done") {
      completed = true;
    } else if (event.type === "error") {
      throw new Error(
        event.message || "Flora could not generate a response."
      );
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line.
      let match;

      while ((match = /\r?\n\r?\n/.exec(buffer)) !== null) {
        const block = buffer.slice(0, match.index);

        buffer = buffer.slice(
          match.index + match[0].length
        );

        processEvent(block);
      }
    }

    // Flush any remaining decoded text.
    buffer += decoder.decode();

    // Handle a final event if it has no trailing blank line.
    if (buffer.trim()) {
      processEvent(buffer);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (!completed) {
    throw new Error(
      "Flora's response stream ended unexpectedly."
    );
  }

  return { content };
}