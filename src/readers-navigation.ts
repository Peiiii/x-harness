export function readMenu(): any {
  const visible = (el: any) => el.getClientRects().length > 0;
  const roots = Array.from<any>(
    document.querySelectorAll<HTMLElement>(
      '[role="menu"],[role="dialog"],[data-testid="Dropdown"]',
    ),
  ).filter(visible);
  const items = [
    ...new Set(
      roots.flatMap((root: any) =>
        Array.from<any>(
          root.querySelectorAll('a[href],button,[role="menuitem"]'),
        ),
      ),
    ),
  ].filter(visible);
  return {
    items: items.map((el: any) => ({
      role: el.getAttribute("role") || (el.tagName === "A" ? "link" : "button"),
      label: el.getAttribute("aria-label") || el.innerText,
      href: el.getAttribute("href"),
    })),
    needsStateCheck: !items.length,
    missing: items.length ? [] : ["menu-not-found"],
  };
}

// Bounded visible navigation only. Never include article links as navigation controls.
export function readNavigation({
  targetLabel,
  bookmarkNavigation = false,
  timelineNavigation = false,
}: any = {}): any {
  const visible = (el: any) =>
    el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]');
  const primary =
    document.querySelector('[data-testid="primaryColumn"]') ??
    document.querySelector("main");
  // Feed cards outside articles are content, not navigation evidence.
  const scopedNavigation =
    bookmarkNavigation ||
    timelineNavigation ||
    /^\/(?:home|explore)\/?$/.test(new URL(location.href).pathname);
  const nodes = [
    ...new Set([
      ...Array.from<any>(
        document.querySelectorAll<HTMLElement>("nav a[href],nav button"),
      ).filter((el: any) => !el.closest("main")),
      ...Array.from<any>(
        primary?.querySelectorAll(
          'a[href],button,[role="button"],[role="tab"]',
        ) ?? [],
      ),
      ...Array.from<any>(
        document.querySelectorAll<HTMLElement>(
          '[role="menu"] a[href], [role="menu"] button, [data-testid="Dropdown"] a[href], [data-testid="Dropdown"] button, [data-testid="Dropdown"] [role="menuitemradio"]',
        ),
      ),
    ]),
  ].filter(
    (el: any) =>
      visible(el) &&
      !el.closest("article") &&
      (!scopedNavigation ||
        (el.closest("nav") && !el.closest("main")) ||
        el.getAttribute("role") === "tab" ||
        el.closest('[role="menu"],[role="dialog"],[data-testid="Dropdown"]')),
  );

  const controls: any[] = nodes.map((el: any) => ({
    role: el.getAttribute("role") || (el.tagName === "A" ? "link" : "button"),
    label: el.getAttribute("aria-label") || el.innerText.trim(),
    href: el.getAttribute("href"),
    selected: el.getAttribute("aria-selected") === "true",
    disabled: el.disabled === true,
  }));
  // Some folder cards are plain clickable text, with no ARIA role or href.
  // Only the explicitly requested, visible exact label can be promoted to a semantic control.
  if (
    targetLabel &&
    !controls.some((c: any) => c.label.split("\n")[0] === targetLabel)
  ) {
    const labels = Array.from<any>(
      document.querySelectorAll<HTMLElement>("span,div"),
    ).filter(
      (el: any) =>
        visible(el) &&
        !el.closest("article") &&
        el.innerText.trim() === targetLabel &&
        !Array.from<any>(el.children).some(
          (child: any) => child.innerText?.trim() === targetLabel,
        ),
    );
    controls.push(
      ...labels.map((el: any) => ({
        role: "text",
        label: el.innerText.trim(),
        href: null,
        disabled: false,
        source: "exact-visible-folder-label",
      })),
    );
  }
  // Folder names exist as plain text cards in the history tab dropdown.
  // Only a visible bookmark-specific menu can supply names, never articles
  // or unrelated menus. "All bookmarks" remains an option, not a folder.
  const bookmarkFolders = [
    ...new Set(
      Array.from<any>(
        document.querySelectorAll(
          '[role="menu"],[role="dialog"],[data-testid="Dropdown"]',
        ),
      )
        .filter(
          (root: any) =>
            visible(root) && /所有书签|All bookmarks/i.test(root.innerText),
        )
        .flatMap((root: any) => Array.from<any>(root.querySelectorAll("span")))
        .filter(
          (el: any) =>
            visible(el) && !el.closest("article") && !el.querySelector("span"),
        )
        .map((el: any) => el.innerText.trim())
        .filter(
          (name: string) =>
            name && !/^(书签|Bookmarks|所有书签|All bookmarks)$/i.test(name),
        ),
    ),
  ];
  return {
    bookmarkFolders,
    page: location.href,
    controls: controls.slice(0, 40),
    headings: Array.from<any>(
      primary?.querySelectorAll('h1,h2,[role="heading"]') ?? [],
    )
      .filter(visible)
      .map((el: any) => el.innerText.trim())
      .slice(0, 10),
    needsStateCheck: !controls.length || controls.length > 40,
    missing:
      controls.length > 40
        ? ["navigation-window-overflow"]
        : controls.length
          ? []
          : ["navigation-not-found"],
  };
}
