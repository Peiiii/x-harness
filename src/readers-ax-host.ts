import { readAX } from "./readers-ax-parser.js";

// Native operations share one observation boundary. No raw AX leaves this session.
// Browser Tab input takes (index, value), while native App input takes (value).
export function createAXTabHarness(tab: any): any {
  return createAXHarness({
    getAXState: (options: any) => tab.getAXState(options),
    click: (index: any) => tab.click(index),
    pressKey: (key: any) => tab.pressKey(null, key),
    paste: (value: any) => tab.paste(null, value),
    scroll: (...args: any[]) => tab.scroll(...args),
    getScreenshot: (options: any) => tab.getScreenshot(options),
  });
}

export class AXHarness {
  readonly #app!: any;
  #controls!: Map<any, any>;
  #readable!: boolean;
  #busy!: boolean;
  constructor(app: any) {
    this.screenshot = this.screenshot.bind(this);
    this.act = this.act.bind(this);
    this.observe = this.observe.bind(this);
    this.#app = app;
    this.#controls = new Map();
    this.#readable = false;
    this.#busy = false;
  }
  private requireMethods(methods: any) {
    const missing = methods.filter(
      (name: any) => typeof this.#app?.[name] !== "function",
    );
    if (missing.length) {
      this.#controls.clear();
      this.#readable = false;
      throw new Error(
        `harness能力不足：${missing.join("/")}；先补原入口并验证，未执行操作`,
      );
    }
  }
  private indexes(value: any) {
    if (!value || typeof value !== "object") return;
    if (Number.isInteger(value.index) && typeof value.label === "string")
      this.#controls.set(value.index, value.label);
    for (const child of Object.values(value)) this.indexes(child);
  }
  private async handleObserve(options: any = {}) {
    this.#controls.clear();
    this.#readable = false;
    readAX("", options);
    this.requireMethods(["getAXState"]);
    const result = readAX(
      await this.#app.getAXState({ emit: false, disableDiffing: true }),
      options,
    );
    this.indexes(result);
    this.#readable = true;
    return result;
  }
  public async observe(options: any = {}): Promise<any> {
    if (this.#busy) throw new Error("AX操作进行中，禁止并发读取");
    this.#busy = true;
    try {
      return await this.handleObserve(options);
    } finally {
      this.#busy = false;
    }
  }
  public async act({
    index,
    operation = "click",
    value,
    read = {},
  }: any = {}): Promise<any> {
    if (this.#busy) throw new Error("AX操作进行中，禁止并发写入");
    if (!this.#readable || !this.#controls.has(index))
      throw new Error("必须先observe；index须来自最新定向证据");
    if (
      !["click", "fill", "paste", "pressKey", "scroll", "secondary"].includes(
        operation,
      )
    )
      throw new Error("未封装的AX操作，先补能力并验证");
    // Validate before any side effect; a malformed follow-up read must never submit.
    readAX("", read);
    if (
      ["fill", "paste", "pressKey", "secondary"].includes(operation) &&
      typeof value !== "string"
    )
      throw new Error("AX操作value须为字符串");
    if (
      ["fill", "paste", "pressKey"].includes(operation) &&
      !/^(?:文本输入区(?:域)?|文本区域|文本栏|组合框) /.test(
        this.#controls.get(index),
      )
    )
      throw new Error("键盘操作须定位最新证据中的编辑控件");
    if (
      operation === "secondary" &&
      !this.#controls.get(index).includes(`Secondary Actions: ${value}`)
    )
      throw new Error("未观察到该辅助动作");
    if (
      operation === "scroll" &&
      !["up", "down", "left", "right"].includes(value)
    )
      throw new Error("无效滚动方向");
    const methods =
      operation === "fill"
        ? ["click", "pressKey", "paste"]
        : ["paste", "pressKey"].includes(operation)
          ? ["click", operation]
          : [operation === "secondary" ? "performSecondaryAction" : operation];
    this.requireMethods([...methods, "getAXState"]);
    this.#busy = true;
    this.#controls.clear();
    this.#readable = false;
    try {
      if (operation === "click") await this.#app.click(index);
      else if (["fill", "paste", "pressKey"].includes(operation)) {
        await this.#app.click(index);
        if (operation === "fill") {
          await this.#app.pressKey("super+a");
          await this.#app.paste(value);
        } else await this.#app[operation](value);
      } else if (operation === "scroll")
        await this.#app.scroll(index, value, 1);
      else await this.#app.performSecondaryAction(index, value);
      return await this.handleObserve(read);
    } finally {
      this.#busy = false;
    }
  }
  public async screenshot(): Promise<any> {
    if (this.#busy) throw new Error("AX操作进行中，禁止并发截图");
    this.requireMethods(["getScreenshot"]);
    this.#busy = true;
    this.#controls.clear();
    this.#readable = false;
    try {
      return await this.#app.getScreenshot({ emit: false });
    } finally {
      this.#busy = false;
    }
  }
}
export function createAXHarness(
  ...args: ConstructorParameters<typeof AXHarness>
): any {
  return new AXHarness(...args);
}
