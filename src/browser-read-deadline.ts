/** A deadline for a single read primitive, never for activation or navigation.
 * The host may ignore its own timeout while setting up the DOM scope. A late
 * read may settle, but its result cannot resume the caller after this rejects.
 */
export class BrowserReadDeadline {
  #pending = false;
  constructor(readonly timeoutMs = 5000) {}
  async run<T>(operation: string, read: () => Promise<T>): Promise<T> {
    if (this.#pending) throw Error(`browser-read-pending:${operation}`);
    this.#pending = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = Promise.resolve().then(read);
    // Only the actual primitive settling releases this latch. Do not enqueue
    // more reads on the same stalled binding, or release any business claim here.
    pending.then(
      () => {
        this.#pending = false;
      },
      () => {
        this.#pending = false;
      },
    );
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Error(`browser-read-timeout:${operation}:${this.timeoutMs}ms`),
              ),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
