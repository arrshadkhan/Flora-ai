const STORAGE_KEY = "flora-sidebar-collapsed";
const isMobile = matchMedia("(max-width: 768px)");

export function initSidebar({ app, onNew, onSelect, onDelete }) {
  const $ = (id) => document.getElementById(id);
  const list = $("conv-list");
  const search = $("chat-search");
  let conversations = [];
  let activeId = null;

  // Desktop: collapsed state is persisted. Mobile: drawer is always closed on load.
  app.classList.toggle("collapsed", localStorage.getItem(STORAGE_KEY) === "1");

  function setCollapsed(collapsed) {
    if (isMobile.matches) {
      app.classList.toggle("drawer-open", !collapsed);
    } else {
      app.classList.toggle("collapsed", collapsed);
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    }
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const visible = conversations.filter((c) => c.title.toLowerCase().includes(query));
    list.innerHTML = visible.length ? "" : '<li class="conv-empty">No chats found</li>';

    for (const conv of visible) {
      const row = document.createElement("li");
      row.className = "conv-row";
      row.innerHTML = '<button type="button" class="conv-item"></button><button type="button" class="conv-delete">&times;</button>';
      const [item, remove] = row.children;
      item.textContent = conv.title;
      if (conv.id === activeId) item.setAttribute("aria-current", "page");
      remove.setAttribute("aria-label", `Delete ${conv.title}`);
      item.addEventListener("click", () => { onSelect(conv.id); if (isMobile.matches) setCollapsed(true); });
      remove.addEventListener("click", () => onDelete(conv.id));
      list.append(row);
    }
  }

  $("collapse-btn").addEventListener("click", () => setCollapsed(true));
  $("open-sidebar").addEventListener("click", () => setCollapsed(false));
  $("backdrop").addEventListener("click", () => setCollapsed(true));
  $("new-chat").addEventListener("click", () => { onNew(); if (isMobile.matches) setCollapsed(true); });
  search.addEventListener("input", render);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMobile.matches && app.classList.contains("drawer-open")) setCollapsed(true);
  });

  return {
    setConversations(next) { conversations = next; render(); },
    setActive(id) { activeId = id; render(); },
  };
}
