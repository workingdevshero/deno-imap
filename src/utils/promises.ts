/**
 * Promise utilities
 * @module
 */

import { ImapTimeoutError } from '../errors.ts';

/**
 * Creates a cancellable promise with a timeout
 *
 * CAUTION:
 * 1. Resource Management: Always call `disableTimeout()` in a finally block to prevent memory leaks,
 *    especially when the promise might be rejected or cancelled.
 *
 * 2. Error Handling: The inner promise's rejection will be propagated through the returned promise.
 *    Make sure to handle these rejections appropriately.
 *
 * 3. Timeout Behavior: When a timeout occurs, the inner promise continues to execute even though
 *    the returned promise has already rejected. This can lead to "ghost" operations continuing
 *    in the background. Consider implementing cleanup logic in your promise function.
 *
 * 4. Cancellation: The `cancel()` method only affects the returned promise, not the underlying
 *    operation. If you need to cancel the actual operation, you must implement that logic in
 *    your promise function.
 *
 * 5. Connection State: After a timeout, the connection may be in an inconsistent state. It's often
 *    best to disconnect and reconnect to ensure a clean slate.
 *
 * @param promiseFn Function that returns a promise to make cancellable
 * @param timeoutMs Timeout in milliseconds
 * @param timeoutMessage Message for the timeout error
 * @returns An object with the promise and functions to cancel or disable the timeout
 */
export function createCancellablePromise<T>(
  promiseFn: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): {
  promise: Promise<T>;
  cancel: (reason?: string) => void;
  disableTimeout: () => void;
} {
  let timeoutId: number | undefined;
  let rejectFn: ((reason: Error) => void) | undefined;
  let isSettled = false;

  const clearTimer = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const promise = new Promise<T>((resolve, reject) => {
    rejectFn = reject;

    // Execute the promise function first
    const innerPromise = promiseFn();

    // Set timeout after promise creation to avoid sync errors
    timeoutId = setTimeout(() => {
      if (!isSettled) {
        reject(new ImapTimeoutError(timeoutMessage, timeoutMs));
        isSettled = true;
        clearTimer();
      }
    }, timeoutMs);

    // Handle settlement
    innerPromise
      .then((value) => {
        if (!isSettled) {
          resolve(value);
          isSettled = true;
        }
      })
      .catch((error) => {
        if (!isSettled) {
          reject(error);
          isSettled = true;
        }
      })
      .finally(clearTimer);
  });

  return {
    promise,
    cancel: (reason?: string) => {
      if (!isSettled && rejectFn) {
        rejectFn(new Error(reason || 'Promise cancelled'));
        isSettled = true;
        clearTimer();
      }
    },
    disableTimeout: () => {
      clearTimer();
    },
  };
}
