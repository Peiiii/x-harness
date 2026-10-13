export function readComposer(): any {
  const visible = (el: any) =>
    el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]');
  const dialogs = Array.from<any>(
    document.querySelectorAll<HTMLElement>('[role="dialog"]'),
  ).filter(visible);
  const root =
    dialogs.length === 1
      ? dialogs[0]
      : dialogs.length === 0
        ? document.querySelector("main")
        : null;
  if (location.pathname.startsWith("/compose/post/unsent/")) {
    const text = root?.innerText ?? "";
    return {
      page: location.href,
      unsent: true,
      text: text.slice(0, 8000),
      truncated: text.length > 8000,
      controls: root
        ? Array.from<any>(root.querySelectorAll('button,a,[role="tab"]'))
            .filter(visible)
            .slice(0, 30)
            .map((el: any) => ({
              label: el.getAttribute("aria-label") || el.innerText,
              href: el.getAttribute("href"),
            }))
        : [],
      needsStateCheck: !root || text.length > 8000,
    };
  }
  const navigation = Array.from<any>(
    document.querySelectorAll<HTMLElement>(
      'a[href="/compose/post"],button[data-testid="SideNav_AccountSwitcher_Button"]',
    ),
  )
    .filter(visible)
    .map((el: any) => ({
      role: el.tagName === "A" ? "link" : "button",
      label: el.getAttribute("aria-label") || el.innerText,
    }));
  if (
    Array.from<any>(
      document.querySelectorAll<HTMLElement>(
        '[role="textbox"],textarea,[contenteditable="true"]',
      ),
    ).filter(visible).length !== 1
  )
    return {
      page: location.href,
      navigation,
      dialog:
        root &&
        (dialogs.length === 1 || location.pathname === "/compose/post/media")
          ? {
              buttons: Array.from<any>(
                root.querySelectorAll('button,[role="tab"]'),
              )
                .filter(visible)
                .map((el: any) => ({
                  role: el.getAttribute("role") || "button",
                  label: el.getAttribute("aria-label") || el.innerText,
                })),
              fields: Array.from<any>(root.querySelectorAll("textarea,input"))
                .filter(visible)
                .map((el: any) => ({
                  label: el.getAttribute("aria-label"),
                  placeholder: el.getAttribute("placeholder"),
                  value: el.value,
                })),
            }
          : null,
      needsStateCheck: true,
      missing: ["composer-editor-not-found"],
      editorCandidates: Array.from<any>(
        document.querySelectorAll<HTMLElement>(
          '[role="textbox"],textarea,[contenteditable="true"]',
        ),
      )
        .filter(visible)
        .map((el: any) => ({
          label: el.getAttribute("aria-label"),
          testId: el.getAttribute("data-testid"),
          tag: el.tagName,
        })),
    };
  const editors = Array.from<any>(
    document.querySelectorAll<HTMLElement>(
      '[role="textbox"],textarea,[contenteditable="true"]',
    ),
  ).filter(visible);
  let scope = editors[0];
  while (
    scope.parentElement &&
    !Array.from<any>(scope.querySelectorAll("button")).some(
      (el: any) =>
        visible(el) &&
        /^(发帖|回复|更新)$/.test(
          el.getAttribute("aria-label") || el.innerText,
        ),
    )
  )
    scope = scope.parentElement;
  if (scope === document.body || scope === document.documentElement)
    return {
      page: location.href,
      needsStateCheck: true,
      missing: ["composer-submit-scope-not-found"],
    };
  return {
    page: location.href,
    navigation,
    editors: editors.map((el: any) => ({
      label: el.getAttribute("aria-label"),
      testId: el.getAttribute("data-testid"),
      text: el.innerText,
    })),
    buttons: Array.from<any>(scope.querySelectorAll("button"))
      .filter(visible)
      .map((el: any) => ({
        label: el.getAttribute("aria-label") || el.innerText,
        disabled: el.disabled,
        testId: el.getAttribute("data-testid"),
        ariaDisabled: el.getAttribute("aria-disabled"),
        ariaBusy: el.getAttribute("aria-busy"),
      })),
    images: Array.from<any>(scope.querySelectorAll("img"))
      .filter(visible)
      .map((el: any) => ({ alt: el.alt })),
    videos: Array.from<any>(
      scope.querySelectorAll('[data-testid="videoPlayer"],video'),
    )
      .filter(visible)
      .map((el: any) => ({
        kind: "video",
        label: el.getAttribute("aria-label"),
      })),
    quoteContexts: Array.from<any>(
      scope.querySelectorAll('[data-testid="attachments"]'),
    )
      .filter(visible)
      .filter(
        (el) =>
          el.innerText.startsWith("引用") || el.innerText.startsWith("Quote"),
      )
      .map((el) => ({
        author: el
          .querySelector('[data-testid="User-Name"]')
          ?.innerText.match(/@([A-Za-z0-9_]{1,15})/)?.[1],
        body: el.querySelector('[data-testid="tweetText"]')?.innerText,
      })),
    needsStateCheck: false,
  };
}

export function readMediaEditor(): any {
  if (location.pathname !== "/compose/post/media")
    return { needsStateCheck: true, missing: ["media-route-not-found"] };
  const visible = (el: any) =>
    el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]');
  const controls = Array.from<any>(
    document.querySelectorAll<HTMLElement>('button,[role="tab"]'),
  )
    .filter(visible)
    .map((el: any) => ({
      role: el.getAttribute("role") || "button",
      label: el.getAttribute("aria-label") || el.innerText,
      disabled: el.disabled === true,
    }));
  const fields = Array.from<any>(
    document.querySelectorAll<HTMLElement>('textarea,input,[role="textbox"]'),
  )
    .filter(visible)
    .map((el: any) => ({
      label: el.getAttribute("aria-label"),
      placeholder: el.getAttribute("placeholder"),
      value: el.value ?? el.innerText,
    }));
  const ready =
    controls.some((c: any) => c.role === "button" && c.label === "保存") &&
    controls.some((c: any) => c.role === "tab" && c.label === "编辑图片描述");
  return {
    page: location.href,
    controls: controls.slice(0, 20),
    fields: fields.slice(0, 5),
    needsStateCheck: !ready || controls.length > 20 || fields.length > 5,
    missing: ready ? [] : ["media-editor-controls-not-ready"],
    alerts: Array.from<any>(
      document.querySelectorAll<HTMLElement>('[role="alert"]'),
    )
      .filter(visible)
      .map((el: any) => el.innerText),
  };
}
