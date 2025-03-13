/**
 * Tests for promise utilities
 */

import { assertEquals, assertRejects } from "https://deno.land/std/testing/asserts.ts";
import { createCancellablePromise } from "../../src/utils/promises.ts";
import { ImapTimeoutError } from "../../src/errors.ts";

Deno.test("createCancellablePromise - resolves with the result", async () => {
  const expected = "test result";
  const cancellable = createCancellablePromise(
    async () => expected,
    1000,
    "Test timeout"
  );
  
  try {
    const result = await cancellable.promise;
    assertEquals(result, expected);
  } finally {
    cancellable.disableTimeout();
  }
});

Deno.test("createCancellablePromise - rejects with the error from the promise", async () => {
  const expectedError = new Error("test error");
  const cancellable = createCancellablePromise<string>(
    async () => {
      throw expectedError;
    },
    1000,
    "Test timeout"
  );
  
  try {
    await assertRejects(
      () => cancellable.promise,
      Error,
      expectedError.message
    );
  } finally {
    cancellable.disableTimeout();
  }
});

Deno.test("createCancellablePromise - times out if promise takes too long", async () => {
  const timeoutMs = 100;
  let resolver: (() => void) | undefined;
  
  const cancellable = createCancellablePromise<string>(
    async () => {
      // Create a promise that we can resolve manually
      await new Promise<void>((resolve) => {
        resolver = resolve;
      });
      return "should not resolve";
    },
    timeoutMs,
    "Test timeout"
  );
  
  try {
    await assertRejects(
      () => cancellable.promise,
      ImapTimeoutError
    );
  } finally {
    // Resolve the inner promise to avoid leaking it
    if (resolver) resolver();
    cancellable.disableTimeout();
  }
});

Deno.test("createCancellablePromise - can be cancelled", async () => {
  let resolver: (() => void) | undefined;
  
  const cancellable = createCancellablePromise<string>(
    async () => {
      // Create a promise that we can resolve manually
      await new Promise<void>((resolve) => {
        resolver = resolve;
      });
      return "should not resolve";
    },
    2000,
    "Test timeout"
  );
  
  // Cancel the promise
  cancellable.cancel("Cancelled for testing");
  
  try {
    await assertRejects(
      () => cancellable.promise,
      Error,
      "Cancelled for testing"
    );
  } finally {
    // Resolve the inner promise to avoid leaking it
    if (resolver) resolver();
    cancellable.disableTimeout();
  }
});

Deno.test("createCancellablePromise - disableTimeout prevents timeout", async () => {
  const timeoutMs = 100;
  
  const cancellable = createCancellablePromise<string>(
    async () => {
      // Use a shorter delay to avoid test timeouts
      await new Promise((resolve) => setTimeout(resolve, 200));
      return "should resolve";
    },
    timeoutMs,
    "Test timeout"
  );
  
  // Clear the timeout
  cancellable.disableTimeout();
  
  try {
    const result = await cancellable.promise;
    assertEquals(result, "should resolve");
  } finally {
    cancellable.disableTimeout(); // Just to be safe
  }
}); 