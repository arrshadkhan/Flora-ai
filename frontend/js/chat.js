/* ---------- Minimal Markdown renderer + syntax highlighter (no dependencies) ---------- */
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TOKEN_RE = /(\/\/.*|#.*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(def|class|return|if|elif|else|for|while|import|from|as|const|let|var|function|async|await|in|not|and|or|new|try|except|catch|None|True|False|true|false|null)\b|\b(\d+(?:\.\d+)?)\b/g;

function highlight(code) {
  let out = "";
  let last = 0;
  for (const match of code.matchAll(TOKEN_RE)) {
    const type = ["cmt", "str", "kw", "num"][match.slice(1).findIndex(Boolean)];
    out += `${escapeHtml(code.slice(last, match.index))}<span class="tok-${type}">${escapeHtml(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return out + escapeHtml(code.slice(last));
}

// Text is escaped first, so only the tags generated here can reach the DOM.
function renderInline(text) {
  return escapeHtml(text)
    .split(/(`[^`]+`)/)
    .map((part, i) => i % 2
      ? `<code>${part.slice(1, -1)}</code>`
      : part
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/\*([^*\s][^*]*)\*/g, "<em>$1</em>")
          .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'))
    .join("");
}

const LIST_RE = /^\s*([-*]|\d+\.)\s+/;
const splitRow = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function renderMarkdown(source) {
  const fences = [];
  const text = source.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    fences.push({ lang, code: code.replace(/\n$/, "") });
    return `\u0000${fences.length - 1}\u0000`;
  });
  const lines = text.split("\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let m;
    if ((m = line.match(/^\u0000(\d+)\u0000$/))) {
      const { lang, code } = fences[m[1]];
      html += `<div class="code-block"><div class="code-header"><span>${escapeHtml(lang || "text")}</span><button type="button" class="copy-code" aria-label="Copy code">Copy</button></div><pre><code>${highlight(code)}</code></pre></div>`;
      i++;
    } else if ((m = line.match(/^(#{1,4})\s+(.*)/))) {
      html += `<h${m[1].length}>${renderInline(m[2])}</h${m[1].length}>`;
      i++;
    } else if (LIST_RE.test(line)) {
      const tag = /^\s*\d+\./.test(line) ? "ol" : "ul";
      let items = "";
      while (i < lines.length && LIST_RE.test(lines[i])) items += `<li>${renderInline(lines[i++].replace(LIST_RE, ""))}</li>`;
      html += `<${tag}>${items}</${tag}>`;
    } else if (line.trim().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      const head = splitRow(line).map((c) => `<th>${renderInline(c)}</th>`).join("");
      i += 2;
      let rows = "";
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows += `<tr>${splitRow(lines[i++]).map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`;
      }
      html += `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    } else if (line.startsWith("> ")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith("> ")) quote.push(lines[i++].slice(2));
      html += `<blockquote>${renderInline(quote.join(" "))}</blockquote>`;
    } else if (!line.trim()) {
      i++;
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|> |\u0000)/.test(lines[i]) && !LIST_RE.test(lines[i])) para.push(lines[i++]);
      if (!para.length) para.push(lines[i++]);
      html += `<p>${renderInline(para.join(" "))}</p>`;
    }
  }
  return html;
}

/* ---------- Chat view + composer ---------- */
const icon = (name, extra = "") => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function initChat({ onSubmit, onStop, onRegenerate }) {
  const $ = (id) => document.getElementById(id);
  const messages = $("messages");
  const thread = $("thread");
  const form = $("composer");
  const input = $("prompt");
  const sendBtn = $("send-btn");
  const fileInput = $("file-input");
  const chip = $("attachment-chip");

  const scrollToBottom = (force = false) => {
    const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 160;
    if (force || nearBottom) messages.scrollTop = messages.scrollHeight;
  };

  function autosize() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
    sendBtn.disabled = !input.value.trim();
  }

  async function copyText(text, button) {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    const isCode = button.classList.contains("copy-code");
    const label = button.textContent;
    if (isCode) button.textContent = "Copied";
    button.classList.add("copied");
    setTimeout(() => { button.classList.remove("copied"); if (isCode) button.textContent = label; }, 1500);
  }

  function createAssistantElement() {
    const el = document.createElement("article");
    el.className = "message assistant";
    el.raw = "";
    el.innerHTML = `
      <img class="avatar" src="assets/logo/flora.svg" alt="" width="28" height="28">
      <div class="msg-main">
        <div class="markdown"></div>
        <div class="typing" role="status" aria-label="Flora AI is thinking"><span></span><span></span><span></span></div>
        <div class="msg-actions" role="group" aria-label="Message actions" hidden>
          <button type="button" class="icon-btn" data-action="copy" aria-label="Copy response" title="Copy">${icon("copy")}</button>
          <button type="button" class="icon-btn" data-action="like" aria-label="Good response" aria-pressed="false" title="Good response">${icon("up")}</button>
          <button type="button" class="icon-btn" data-action="dislike" aria-label="Bad response" aria-pressed="false" title="Bad response">${icon("up", "flip")}</button>
          <button type="button" class="icon-btn" data-action="regenerate" aria-label="Regenerate response" title="Regenerate">${icon("refresh")}</button>
        </div>
      </div>`;
    thread.append(el);
    return el;
  }

  function addAssistantMessage() {
    const el = createAssistantElement();
    const body = el.querySelector(".markdown");
    const typing = el.querySelector(".typing");
    scrollToBottom(true);
    return {
      setContent(text) {
        typing.remove();
        el.raw = text;
        const unclosedFence = (text.match(/```/g) || []).length % 2;
        body.innerHTML = renderMarkdown(unclosedFence ? `${text}\n\`\`\`` : text);
      },
      finish() {
        typing.remove();
        if (!el.raw) return el.remove();
        el.querySelector(".msg-actions").hidden = false;
      },
      fail(message) {
        typing.remove();
        body.innerHTML = '<p class="error-text" role="alert"></p>';
        body.firstChild.textContent = message;
      },
    };
  }

  function addUserMessage(text) {
    const el = document.createElement("article");
    el.className = "message user";
    el.textContent = text;
    thread.append(el);
    messages.classList.add("has-messages");
    scrollToBottom(true);
  }

  function renderConversation(items) {
    thread.innerHTML = "";
    messages.classList.toggle("has-messages", items.length > 0);
    for (const { role, content } of items) {
      if (role === "user") addUserMessage(content);
      else { const handle = addAssistantMessage(); handle.setContent(content); handle.finish(); }
    }
    scrollToBottom(true);
  }

  // Reveals text progressively; resolves with whatever was shown if aborted.
  async function streamText(handle, text, signal) {
    let shown = 0;
    while (shown < text.length && !signal.aborted) {
      shown = Math.min(text.length, shown + 4);
      handle.setContent(text.slice(0, shown));
      scrollToBottom();
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    return text.slice(0, shown);
  }

  function setState(state) {
    form.dataset.state = state;
    thread.setAttribute("aria-busy", String(state !== "idle"));
    if (state === "idle") input.focus();
  }

  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || form.dataset.state !== "idle") return;
    input.value = "";
    autosize();
    onSubmit(text);
  });
  $("stop-btn").addEventListener("click", onStop);

  $("attach-btn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    chip.hidden = !file;
    chip.querySelector("span").textContent = file ? file.name : "";
  });
  $("remove-attachment").addEventListener("click", () => { fileInput.value = ""; chip.hidden = true; });

  document.querySelector(".suggestions").addEventListener("click", (e) => {
    const card = e.target.closest(".suggestion");
    if (!card) return;
    input.value = card.dataset.prompt;
    autosize();
    input.focus();
  });

  thread.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const message = button.closest(".message");
    if (button.classList.contains("copy-code")) {
      copyText(button.closest(".code-block").querySelector("code").textContent, button);
      return;
    }
    switch (button.dataset.action) {
      case "copy": copyText(message.raw, button); break;
      case "regenerate": onRegenerate(); break;
      case "like":
      case "dislike": {
        const wasOn = button.getAttribute("aria-pressed") === "true";
        message.querySelectorAll("[data-action=like], [data-action=dislike]").forEach((b) => b.setAttribute("aria-pressed", "false"));
        button.setAttribute("aria-pressed", String(!wasOn));
        break;
      }
    }
  });

  return { renderConversation, addUserMessage, addAssistantMessage, streamText, setState };
}
