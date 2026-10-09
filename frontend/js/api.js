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
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.status === 204 ? null : response.json();
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
export const sendMessage = ({ conversationId, messages, model, signal }) =>
  USE_MOCK
? mock.send({ conversationId, messages, signal })
: request(`/conversations/${conversationId}/messages`, { method: "POST", body: { messages, model }, signal });
