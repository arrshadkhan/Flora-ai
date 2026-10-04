import * as api from "./api.js";
import { initTheme } from "./theme.js";
import { initSidebar } from "./sidebar.js";
import { initChat } from "./chat.js";

const state = { conversations: [], activeId: null, messages: [], controller: null };

const chat = initChat({ onSubmit: handleSubmit, onStop: stopGeneration, onRegenerate: regenerate });
const sidebar = initSidebar({
  app: document.getElementById("app"),
  onNew: newChat,
  onSelect: openConversation,
  onDelete: removeConversation,
});
initTheme(document.getElementById("theme-toggle"));

async function init() {
  state.conversations = await api.getConversations();
  sidebar.setConversations(state.conversations);
}

function stopGeneration() {
  state.controller?.abort();
}

function newChat() {
  stopGeneration();
  state.activeId = null;
  state.messages = [];
  sidebar.setActive(null);
  chat.renderConversation([]);
}

async function openConversation(id) {
  stopGeneration();
  const conversation = await api.getConversation(id);
  state.activeId = conversation.id;
  state.messages = conversation.messages;
  sidebar.setActive(id);
  chat.renderConversation(state.messages);
}

async function removeConversation(id) {
  await api.deleteConversation(id);
  state.conversations = state.conversations.filter((c) => c.id !== id);
  sidebar.setConversations(state.conversations);
  if (id === state.activeId) newChat();
}

async function handleSubmit(text) {
  if (!state.activeId) {
    const title = text.length > 40 ? `${text.slice(0, 40)}…` : text;
    const conversation = await api.createConversation(title);
    state.activeId = conversation.id;
    state.conversations.unshift(conversation);
    sidebar.setConversations(state.conversations);
    sidebar.setActive(conversation.id);
  }
  state.messages.push({ role: "user", content: text });
  chat.addUserMessage(text);
  await generate();
}

function regenerate() {
  if (state.controller) return;
  if (state.messages.at(-1)?.role === "assistant") state.messages.pop();
  chat.renderConversation(state.messages);
  generate();
}

async function generate() {
  const history = state.messages; // captured so a mid-flight chat switch can't corrupt the new chat
  const handle = chat.addAssistantMessage();
  const controller = new AbortController();
  state.controller = controller;
  chat.setState("loading");

  try {
    const { content } = await api.sendMessage({
      conversationId: state.activeId,
      messages: history,
      model: document.getElementById("model-select").value,
      signal: controller.signal,
    });
    chat.setState("generating");
    const shown = await chat.streamText(handle, content, controller.signal);
    if (shown) history.push({ role: "assistant", content: shown });
    handle.finish();
  } catch (error) {
    if (error.name === "AbortError") handle.finish();
    else handle.fail("Flora AI couldn't reach the server. Check your connection and try again.");
  } finally {
    if (state.controller === controller) state.controller = null;
    chat.setState("idle");
  }
}

init();
