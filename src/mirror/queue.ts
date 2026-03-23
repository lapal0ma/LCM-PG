/**
 * Async queue with bounded concurrency; failures are isolated per job.
 */
export class MirrorQueue {
  private readonly concurrency: number;
  private readonly pending: Array<() => Promise<void>> = [];
  private readonly flushWaiters = new Map<number, Array<() => void>>();
  private activeCount = 0;
  private submittedCount = 0;
  private completedCount = 0;

  constructor(options?: { concurrency?: number }) {
    const requested = options?.concurrency ?? 1;
    this.concurrency = Number.isFinite(requested)
      ? Math.max(1, Math.floor(requested))
      : 1;
  }

  enqueue(job: () => Promise<void>): void {
    this.submittedCount += 1;
    this.pending.push(job);
    this.pump();
  }

  private pump(): void {
    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) {
        return;
      }
      this.activeCount += 1;
      Promise.resolve()
        .then(() =>
          job().catch(() => {
            /* errors logged by job */
          }),
        )
        .finally(() => {
          this.activeCount -= 1;
          this.completedCount += 1;
          this.resolveFlushWaiters();
          this.pump();
        });
    }
  }

  private resolveFlushWaiters(): void {
    for (const [target, resolvers] of [...this.flushWaiters.entries()]) {
      if (this.completedCount < target) {
        continue;
      }
      this.flushWaiters.delete(target);
      for (const resolve of resolvers) {
        resolve();
      }
    }
  }

  /** Wait until queued work submitted so far has finished (best-effort). */
  async flush(): Promise<void> {
    const target = this.submittedCount;
    if (this.completedCount >= target) {
      return;
    }
    await new Promise<void>((resolve) => {
      const waiters = this.flushWaiters.get(target);
      if (waiters) {
        waiters.push(resolve);
      } else {
        this.flushWaiters.set(target, [resolve]);
      }
    });
  }
}
