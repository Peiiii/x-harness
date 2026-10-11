for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-copy]",
)) {
  button.addEventListener("click", async () => {
    const text = button.dataset.copy;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "已复制 ✓";
      button.setAttribute("aria-label", "命令已复制");
      window.setTimeout(() => {
        button.textContent = "复制";
        button.setAttribute("aria-label", "复制命令");
      }, 2400);
    } catch {
      button.textContent = "请选中命令复制";
      document.querySelector<HTMLElement>("#copy-status")!.textContent =
        "浏览器未允许剪贴板访问，请选中旁边的完整命令复制。";
    }
  });
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-mode]",
)) {
  button.addEventListener("click", () => {
    const selected = button.dataset.mode;
    for (const tab of document.querySelectorAll("[data-mode]"))
      tab.setAttribute("aria-selected", String(tab === button));
    for (const panel of document.querySelectorAll<HTMLElement>("[data-panel]"))
      panel.hidden = panel.dataset.panel !== selected;
  });
}
