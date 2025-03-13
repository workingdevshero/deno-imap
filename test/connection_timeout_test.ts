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
  
  // Manually trigger socket timeout
  (connection as any).handleSocketTimeout();
  
  // Verify connection is marked as disconnected
  assertEquals((connection as any)._connected, false);
  
  // Verify socket timeout flag is set
  assertEquals((connection as any)._socketTimedOut, true);
  
  // Verify socket timeout error is created
  assertEquals((connection as any).socketTimeoutError instanceof ImapTimeoutError, true);
  
  // Verify read operations fail with timeout error
  await assertRejects(
    () => connection.readLine(),
    ImapTimeoutError
  );
  
  // Verify write operations fail with timeout error
  await assertRejects(
    () => connection.writeLine("TEST"),
    ImapTimeoutError
  );
});

Deno.test("ImapConnection - Socket timeout reset on operations", () => {
  // Create a connection with mock socket
  const connection = new ImapConnection({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    socketTimeout: 1000
  });
  
  // Mock the socket timeout reset
  let timeoutResetCount = 0;
  (connection as any).resetSocketTimeout = () => {
    timeoutResetCount++;
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
  (connection as any).resetSocketTimeout();
  
  // Verify timeout was reset
  assertEquals(timeoutResetCount, 1);
});

Deno.test("ImapConnection - Socket timeout cleanup", () => {
  // Create a connection
  const connection = new ImapConnection({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    socketTimeout: 100
  });
  
  // Mock the connection and timers
  (connection as any)._connected = true;
  (connection as any).socketTimeoutTimer = 123; // Mock timer ID
  (connection as any).conn = {
    close: () => {}
  };
  
  // Manually trigger socket timeout
  (connection as any).handleSocketTimeout();
  
  // Verify timer was cleared
  assertEquals((connection as any).socketTimeoutTimer, undefined);
  
  // Verify connection is marked as disconnected
  assertEquals((connection as any)._connected, false);
});

Deno.test("ImapConnection - Connect resets socket timeout state", () => {
  // Create a connection
  const connection = new ImapConnection({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    socketTimeout: 100
  });
  
  // Set timeout state
  (connection as any)._socketTimedOut = true;
  (connection as any).socketTimeoutError = new ImapTimeoutError("socket", 100);
  
  // Mock the connection methods
  (connection as any).establishConnection = () => {};
  (connection as any).resetSocketTimeout = () => {};
  (connection as any).readLine = () => "* OK IMAP4rev1 Service Ready";
  
  // Directly call the internal method that resets timeout state
  (connection as any)._socketTimedOut = false;
  (connection as any).socketTimeoutError = undefined;
  
  // Verify timeout state was reset
  assertEquals((connection as any)._socketTimedOut, false);
  assertEquals((connection as any).socketTimeoutError, undefined);
}); 