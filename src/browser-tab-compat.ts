/** Adapt the official nested AX interface without changing the supplied tab. */
export function compatibleTab(tab: any): any {
  const ax = tab?.ax;
  if (!ax || typeof ax !== "object") return tab;

  const fallback: Record<string, unknown> = {};
  if (typeof ax.get === "function") {
    fallback.getAXState = (options?: { disableDiffing?: boolean }) =>
      ax.get("state", { disableDiffing: options?.disableDiffing });
  }
  for (const method of [
    "scroll",
    "click",
    "pressKey",
    "typeText",
    "paste",
    "selectText",
    "performSecondaryAction",
  ]) {
    if (typeof ax[method] === "function")
      fallback[method] = ax[method].bind(ax);
  }
  return new Proxy(tab, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (
        descriptor &&
        !descriptor.configurable &&
        (("value" in descriptor && !descriptor.writable) ||
          (!("value" in descriptor) && !descriptor.get))
      )
        return value;
      if (typeof value === "function") return value.bind(target);
      if (typeof key === "string" && typeof fallback[key] === "function")
        return fallback[key];
      return value;
    },
  });
}
