const STORAGE_KEY = "flora-theme";
const root = document.documentElement;

export function initTheme(toggleButton) {
  const preferred = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(localStorage.getItem(STORAGE_KEY) ?? preferred, toggleButton);

  toggleButton.addEventListener("click", () => {
    root.classList.add("theme-transition");
    applyTheme(root.classList.contains("dark") ? "light" : "dark", toggleButton);
    setTimeout(() => root.classList.remove("theme-transition"), 400);
  });
}

function applyTheme(theme, button) {
  const isDark = theme === "dark";
  root.classList.toggle("dark", isDark);
  localStorage.setItem(STORAGE_KEY, theme);
  button.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} theme`);
  button.querySelector("use").setAttribute("href", isDark ? "#i-sun" : "#i-moon");
}
