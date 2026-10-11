export const plain = (label: any) =>
  label.replace(/^(?:按钮|link|文本输入区域|文本输入区|文本区域|文本栏) /, "");
export const valueOf = (label: any) =>
  label.match(/, Value: ([\s\S]*)$/)?.[1] ?? null;
export const missingMethods = (object: any, names: any) =>
  names.filter((name: any) => typeof object?.[name] !== "function");

/** One instance owns one browser session and its concurrency boundary. */
export class SerializedBrowser {
  #busy = false;
  readonly #port: any;
  collectCreator?: (args: unknown) => Promise<any>;

  constructor(port: any) {
    this.#port = port;
    Object.assign(this, port);
    this.observe = SerializedBrowser.prototype.observe.bind(this);
    this.act = SerializedBrowser.prototype.act.bind(this);
    this.screenshot = SerializedBrowser.prototype.screenshot.bind(this);
    if (port.collectCreator) this.collectCreator = this.collect.bind(this);
  }

  private async run(fn: () => Promise<any>): Promise<any> {
    if (this.#busy) throw new Error("浏览器harness操作进行中，禁止并发");
    this.#busy = true;
    try {
      return await fn();
    } finally {
      this.#busy = false;
    }
  }

  public observe(query: any): Promise<any> {
    return this.run(() => this.#port.observe(query));
  }
  public act(command: any): Promise<any> {
    return this.run(() => this.#port.act(command));
  }
  public screenshot(): Promise<any> {
    return this.run(() => this.#port.screenshot());
  }
  private collect(args: unknown): Promise<any> {
    return this.run(() => this.#port.collectCreator(args));
  }
}
export function serialized(port: any): any {
  return new SerializedBrowser(port);
}
// AX indices never cross this port. Only semantic commands reach the platform layer.
