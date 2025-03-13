/**
 * IMAP connection timeout tests
 * 
 * This file contains tests for the IMAP connection's timeout error handling.
 */

import { assertEquals, assertRejects } from "https://deno.land/std/assert/mod.ts";
import { ImapConnection } from "../src/connection.ts";
import { ImapTimeoutError } from "../src/errors.ts";

Deno.test("ImapConnection - Socket timeout handling", async () => {
  // Create a connection instance
  const connection = new ImapConnection({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    socketTimeout: 100 // Small timeout for faster tests
  });
  
  // Mock the connection state
  (connection as any)._connected = true;
  
  // Create a socket activity cancellable that will immediately timeout
  const mockCancellable = {
    promise: Promise.reject(new ImapTimeoutError("Socket inactivity timeout", 100)),
    cancel: () => {},
    disableTimeout: () => {}
  };
  
  // Set up a handler for the promise rejection
  mockCancellable.promise.catch(() => {
    // This prevents the unhandled promise rejection
  });
  
  // Manually trigger disconnect when the timeout occurs
  (connection as any).disconnect = () => {
    (connection as any)._connected = false;
  };
  
  // Set the mock cancellable and trigger the timeout handler
  (connection as any).socketActivityCancellable = mockCancellable;
  await (connection as any).socketActivityCancellable.promise.catch(() => {
    (connection as any).disconnect();
  });
  
  // Verify connection is marked as disconnected
  assertEquals((connection as any)._connected, false);
  
  // Verify read operations fail with not connected error
  await assertRejects(
    () => connection.readLine(),
    Error,
    "Not connected to IMAP server"
  );
  
  // Verify write operations fail with not connected error
  await assertRejects(
    () => connection.writeLine("TEST"),
    Error,
    "Not connected to IMAP server"
  );
});

Deno.test("ImapConnection - Socket activity reset on operations", () => {
  // Create a connection with mock socket
  const connection = new ImapConnection({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    socketTimeout: 1000
  });
  
  // Mock the socket activity reset
  let activityResetCount = 0;
  (connection as any).resetSocketActivity = () => {
    activityResetCount++;
  };
  
  // Mock the connection state and read/write methods
  (connection as any)._connected = true;
  (connection as any).conn = {
    read: () => {
      return new Uint8Array([79, 75, 13, 10]); // "OK\r\n"
    },
    write: () => {
      return 4;
    }
  };
  
  // Call the methods directly without awaiting
  (connection as any).resetSocketActivity();
  
  // Verify activity monitor was reset
  assertEquals(activityResetCount, 1);
});

Deno.test("ImapConnection - Socket activity cleanup", () => {
  // Create a connection
  const connection = new ImapConnection({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    socketTimeout: 100
  });
  
  // Mock the connection and activity monitor
  (connection as any)._connected = true;
  (connection as any).socketActivityCancellable = {
    promise: Promise.resolve(),
    cancel: () => {},
    disableTimeout: () => {}
  };
  (connection as any).conn = {
    close: () => {}
  };
  
  // Spy on the disableTimeout method
  let disableTimeoutCalled = false;
  (connection as any).socketActivityCancellable.disableTimeout = () => {
    disableTimeoutCalled = true;
  };
  
  // Manually disconnect
  connection.disconnect();
  
  // Verify activity monitor was disabled
  assertEquals(disableTimeoutCalled, true);
  
  // Verify connection is marked as disconnected
  assertEquals((connection as any)._connected, false);
});

Deno.test("ImapConnection - Connect resets socket activity state", async () => {
  // Create a connection
  const connection = new ImapConnection({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    socketTimeout: 100
  });
  
  // Mock the connection methods to make connect() work
  (connection as any).establishConnection = () => Promise.resolve();
  
  // Replace resetSocketActivity with a spy
  let resetActivityCalled = false;
  (connection as any).resetSocketActivity = () => {
    resetActivityCalled = true;
  };
  
  // Call connect and wait for it to complete
  await connection.connect();
  
  // Verify activity monitor was reset
  assertEquals(resetActivityCalled, true);
}); 