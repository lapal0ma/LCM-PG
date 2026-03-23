import { describe, expect, it, vi } from "vitest";
import { MirrorQueue } from "../src/mirror/queue.js";

describe("MirrorQueue", () => {
  it("runs up to the configured concurrency in parallel", async () => {
    const queue = new MirrorQueue({ concurrency: 2 });
    const started: number[] = [];
    const finished: number[] = [];

    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    let resolveThird!: () => void;

    const first = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          started.push(1);
          resolveFirst = () => {
            finished.push(1);
            resolve();
          };
        }),
    );
    const second = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          started.push(2);
          resolveSecond = () => {
            finished.push(2);
            resolve();
          };
        }),
    );
    const third = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          started.push(3);
          resolveThird = () => {
            finished.push(3);
            resolve();
          };
        }),
    );

    queue.enqueue(first);
    queue.enqueue(second);
    queue.enqueue(third);

    await vi.waitFor(() => {
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });
    expect(third).not.toHaveBeenCalled();

    resolveFirst();
    await vi.waitFor(() => {
      expect(third).toHaveBeenCalledTimes(1);
    });

    resolveSecond();
    resolveThird();
    await queue.flush();

    expect(started).toEqual([1, 2, 3]);
    expect(finished).toEqual([1, 2, 3]);
  });

  it("flush waits only for jobs submitted before the flush call", async () => {
    const queue = new MirrorQueue({ concurrency: 1 });
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const firstStarted = vi.fn();
    const secondStarted = vi.fn();

    queue.enqueue(
      () =>
        new Promise<void>((resolve) => {
          firstStarted();
          resolveFirst = resolve;
        }),
    );

    await vi.waitFor(() => {
      expect(firstStarted).toHaveBeenCalledTimes(1);
    });

    const flushPromise = queue.flush();
    queue.enqueue(
      () =>
        new Promise<void>((resolve) => {
          secondStarted();
          resolveSecond = resolve;
        }),
    );

    resolveFirst();
    await flushPromise;

    expect(secondStarted).toHaveBeenCalledTimes(1);

    resolveSecond();
    await queue.flush();
  });
});
