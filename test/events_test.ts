/**
 * IMAP client events tests
 * 
 * This file contains tests for the IMAP client's event emitter functionality.
 */

import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { ImapClient } from "../src/client.ts";
import { ImapConnectionError } from "../src/errors.ts";

Deno.test("ImapClient - Event emitter functionality", () => {
  const client = new ImapClient({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    autoConnect: false
  });
  
  // Track event calls
  const eventCalls = {
    reconnecting: 0,
    reconnected: 0,
    reconnect_failed: 0,
    error: 0,
    close: 0
  };
  
  // Add event listeners
  client.on("reconnecting", () => {
    eventCalls.reconnecting++;
  });
  
  client.on("reconnected", () => {
    eventCalls.reconnected++;
  });
  
  client.on("reconnect_failed", () => {
    eventCalls.reconnect_failed++;
  });
  
  client.on("error", () => {
    eventCalls.error++;
  });
  
  client.on("close", () => {
    eventCalls.close++;
  });
  
  // Emit events
  (client as any).emit("reconnecting");
  (client as any).emit("reconnected", { mailbox: "INBOX" });
  (client as any).emit("reconnect_failed", new ImapConnectionError("Failed to reconnect"));
  (client as any).emit("error", new Error("Test error"));
  (client as any).emit("close");
  
  // Verify events were called
  assertEquals(eventCalls.reconnecting, 1);
  assertEquals(eventCalls.reconnected, 1);
  assertEquals(eventCalls.reconnect_failed, 1);
  assertEquals(eventCalls.error, 1);
  assertEquals(eventCalls.close, 1);
});

Deno.test("ImapClient - Event listener removal", () => {
  const client = new ImapClient({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    autoConnect: false
  });
  
  // Track event calls
  let eventCalled = 0;
  
  // Create a listener
  const listener = () => {
    eventCalled++;
  };
  
  // Add the listener
  client.on("error", listener);
  
  // Emit an event
  (client as any).emit("error", new Error("Test error"));
  
  // Verify the listener was called
  assertEquals(eventCalled, 1);
  
  // Remove the listener
  client.off("error", listener);
  
  // Emit another event
  (client as any).emit("error", new Error("Test error"));
  
  // Verify the listener was not called again
  assertEquals(eventCalled, 1);
});

Deno.test("ImapClient - Multiple event listeners", () => {
  const client = new ImapClient({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    autoConnect: false
  });
  
  // Track event calls
  let listener1Called = 0;
  let listener2Called = 0;
  
  // Create listeners
  const listener1 = () => {
    listener1Called++;
  };
  
  const listener2 = () => {
    listener2Called++;
  };
  
  // Add the listeners
  client.on("error", listener1);
  client.on("error", listener2);
  
  // Emit an event
  (client as any).emit("error", new Error("Test error"));
  
  // Verify both listeners were called
  assertEquals(listener1Called, 1);
  assertEquals(listener2Called, 1);
  
  // Remove one listener
  client.off("error", listener1);
  
  // Emit another event
  (client as any).emit("error", new Error("Test error"));
  
  // Verify only the second listener was called
  assertEquals(listener1Called, 1);
  assertEquals(listener2Called, 2);
});

Deno.test("ImapClient - Error handling in event listeners", () => {
  const client = new ImapClient({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    autoConnect: false
  });
  
  // Create a listener that throws an error
  const listener = () => {
    throw new Error("Listener error");
  };
  
  // Add the listener
  client.on("error", listener);
  
  // Emit an event - this should not throw
  (client as any).emit("error", new Error("Test error"));
  
  // If we got here, the test passed
  assertEquals(true, true);
}); 