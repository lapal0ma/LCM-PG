/**
 * Single-lane async queue: jobs run sequentially per chain; failures are isolated.
 */
export class MirrorQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue(job: () => Promise<void>): void {
    this.tail = this.tail.then(() =>
      job().catch(() => {
        /* errors logged by job */
      }),
    );
  }

  /** Wait until queued work submitted so far has finished (best-effort). */
  async flush(): Promise<void> {
    await this.tail;
  }
}
