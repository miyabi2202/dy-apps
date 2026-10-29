/**
 * Runs tasks one at a time, in the order they were added: a task starts when the one before it
 * has finished, whether that succeeded or failed. A failure goes only to its own caller.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => {});
    return result;
  }
}
