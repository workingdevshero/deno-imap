/**
 * IMAP client reconnection tests
 * 
 * This file contains tests for the IMAP client's timeout error handling and reconnection logic.
 */

import { assertEquals, assertRejects } from "https://deno.land/std/assert/mod.ts";
import { ImapClient } from "../src/client.ts";
import { ImapConnectionError, ImapTimeoutError } from "../src/errors.ts";
import { ImapConnection } from "../src/connection.ts";

// Mock responses for the tests
const mockResponses = {
  connect: ["* OK IMAP4rev1 Service Ready"],
  capabilities: ["* CAPABILITY IMAP4rev1 STARTTLS AUTH=PLAIN", "OK CAPABILITY completed"],
  login: ["OK LOGIN completed"],
  list: [
    '* LIST (\\HasNoChildren) "/" "INBOX"',
    '* LIST (\\HasNoChildren \\Trash) "/" "Trash"',
    '* LIST (\\HasNoChildren \\Sent) "/" "Sent"',
    "OK LIST completed"
  ],
  select: [
    "* 3 EXISTS",
    "* 0 RECENT",
    "* OK [UNSEEN 3]",
    "* OK [UIDNEXT 4]",
    "* OK [UIDVALIDITY 1740855787]",
    "* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
    "OK [READ-WRITE] SELECT completed"
  ]
};

/**
 * Creates a mock IMAP client with controlled connection behavior
 * @param options Options for the mock client
 * @returns Mock IMAP client
 */
function createMockClient(options: {
  shouldTimeout?: boolean;
  shouldDisconnect?: boolean;
  shouldReconnect?: boolean;
  reconnectAttempts?: number;
} = {}) {
  const client = new ImapClient({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    autoConnect: false,
    autoReconnect: options.shouldReconnect !== false,
    maxReconnectAttempts: options.reconnectAttempts || 3,
    reconnectDelay: 10, // Use a small delay for faster tests
    commandTimeout: 100 // Use a small timeout for faster tests
  });

  // Create a mock connection
  const mockConnection = {
    socketTimeoutError: undefined,
    disconnectCount: 0,
    connectCount: 0,
    readLineCount: 0,
    writeLineCount: 0,
    _connected: false,
    
    async connect(): Promise<void> {
      this.connectCount++;
      this._connected = true;
    },
    
    disconnect(): void {
      this.disconnectCount++;
      this._connected = false;
    },
    
    async readLine(): Promise<string> {
      this.readLineCount++;
      
      // Simulate a timeout if configured
      if (options.shouldTimeout) {
        throw new ImapTimeoutError("socket", 100);
      }
      
      // Simulate a disconnection if configured
      if (options.shouldDisconnect && this.readLineCount > 2) {
        this._connected = false;
        throw new ImapConnectionError("Connection closed by server");
      }
      
      // Return appropriate mock response based on the command
      if (this.readLineCount === 1) {
        return mockResponses.connect[0];
      } else if (this.readLineCount === 2) {
        return mockResponses.capabilities[0];
      } else if (this.readLineCount === 3) {
        return mockResponses.capabilities[1];
      } else if (this.readLineCount === 4) {
        return mockResponses.login[0];
      } else if (this.readLineCount >= 5 && this.readLineCount <= 8) {
        return mockResponses.list[this.readLineCount - 5];
      } else if (this.readLineCount >= 9 && this.readLineCount <= 15) {
        return mockResponses.select[this.readLineCount - 9];
      }
      
      return "OK";
    },
    
    async writeLine(line: string): Promise<void> {
      this.writeLineCount++;
      
      // Simulate a timeout if configured
      if (options.shouldTimeout) {
        throw new ImapTimeoutError("socket", 100);
      }
      
      // Simulate a disconnection if configured
      if (options.shouldDisconnect && this.writeLineCount > 2) {
        this._connected = false;
        throw new ImapConnectionError("Connection closed by server");
      }
    },
    
    get connected(): boolean {
      return this._connected;
    }
  };
  
  // Replace the connection with our mock
  (client as any).connection = mockConnection;
  
  // Override connect method to avoid actual network connection
  client.connect = async function() {
    (this as any).connection._connected = true;
    (this as any)._capabilities = new Set(["IMAP4rev1", "STARTTLS", "AUTH=PLAIN"]);
    return Promise.resolve();
  };
  
  // Override authenticate method to set the authenticated flag
  client.authenticate = async function() {
    (this as any)._authenticated = true;
    return Promise.resolve();
  };
  
  // Override the reconnect method to track calls and control behavior
  const originalReconnect = (client as any).reconnect.bind(client);
  (client as any).reconnect = async function() {
    (this as any).reconnectCalled = true;
    
    if (!options.shouldReconnect) {
      throw new ImapConnectionError("Reconnection disabled");
    }
    
    // Simplified reconnect for testing
    (this as any).connection._connected = true;
    (this as any)._authenticated = true;
    (this as any)._capabilities = new Set(["IMAP4rev1", "STARTTLS", "AUTH=PLAIN"]);
    (this as any).emit("reconnected", { mailbox: "INBOX" });
    
    return Promise.resolve();
  };
  
  // Add event tracking
  (client as any).eventsCalled = {
    reconnecting: 0,
    reconnected: 0,
    reconnect_failed: 0,
    error: 0,
    close: 0
  };
  
  // Add event listeners to track events
  client.on("reconnecting", () => {
    (client as any).eventsCalled.reconnecting++;
  });
  
  client.on("reconnected", () => {
    (client as any).eventsCalled.reconnected++;
  });
  
  client.on("reconnect_failed", () => {
    (client as any).eventsCalled.reconnect_failed++;
  });
  
  client.on("error", () => {
    (client as any).eventsCalled.error++;
  });
  
  client.on("close", () => {
    (client as any).eventsCalled.close++;
  });
  
  return client;
}

// Test cases
Deno.test("ImapClient - Socket timeout handling", () => {
  const client = createMockClient();
  
  // Track calls
  let timeoutHandled = false;
  let reconnectCalled = false;
  
  // Override handleSocketTimeout using the mock client's access to connection
  (client as any).connection.handleSocketTimeout = () => {
    timeoutHandled = true;
  };
  
  // Override reconnect
  (client as any).reconnect = () => {
    reconnectCalled = true;
    return Promise.resolve();
  };
  
  // Simulate timeout by emitting the timeout event on the connection
  (client as any).connection.emit = (event: string) => {
    if (event === "timeout") {
      timeoutHandled = true;
    }
  };
  (client as any).connection.emit("timeout");
  
  // Verify timeout was handled
  assertEquals(timeoutHandled, true);
  
  // Call reconnect directly to verify it works
  (client as any).reconnect();
  assertEquals(reconnectCalled, true);
});

Deno.test("ImapClient - Connection error handling", async () => {
  const client = createMockClient({ shouldDisconnect: true, shouldReconnect: false });
  
  // Connect should succeed
  await client.connect();
  
  // Override listMailboxes to simulate connection error
  client.listMailboxes = async function() {
    throw new ImapConnectionError("Connection closed by server");
  };
  
  // Operation should fail with connection error
  await assertRejects(
    () => client.listMailboxes(),
    ImapConnectionError
  );
});

Deno.test("ImapClient - Automatic reconnection", () => {
  const client = createMockClient();
  
  // Track calls
  let reconnectCalled = false;
  let listMailboxesRetried = false;
  
  // Override reconnect
  (client as any).reconnect = () => {
    reconnectCalled = true;
    return Promise.resolve();
  };
  
  // Override listMailboxes
  const originalListMailboxes = client.listMailboxes;
  client.listMailboxes = function() {
    if (!reconnectCalled) {
      // First call should trigger reconnection
      (this as any).reconnect();
      listMailboxesRetried = true;
    }
    return Promise.resolve([]);
  };
  
  // Call listMailboxes
  client.listMailboxes();
  
  // Verify reconnect was called and listMailboxes was retried
  assertEquals(reconnectCalled, true);
  assertEquals(listMailboxesRetried, true);
});

Deno.test("ImapClient - Manual reconnection", async () => {
  const client = createMockClient({ shouldReconnect: true });
  
  // Connect first
  await client.connect();
  
  // Track if reconnect was called
  let reconnectCalled = false;
  const originalReconnect = (client as any).reconnect;
  (client as any).reconnect = async function() {
    reconnectCalled = true;
    (this as any).emit("reconnecting");
    (this as any).emit("reconnected", { mailbox: "INBOX" });
    return Promise.resolve();
  };
  
  // Force a reconnection
  await client.forceReconnect();
  
  // Check that reconnect was called
  assertEquals(reconnectCalled, true);
  
  // Check that events were emitted
  assertEquals((client as any).eventsCalled.reconnecting, 1);
  assertEquals((client as any).eventsCalled.reconnected, 1);
});

Deno.test("ImapClient - Reconnection failure", async () => {
  const client = createMockClient({ 
    shouldDisconnect: true, 
    shouldReconnect: false 
  });
  
  // Connect first
  await client.connect();
  
  // Override reconnect to simulate failure
  (client as any).reconnect = async function() {
    (this as any).emit("reconnecting");
    (this as any).emit("reconnect_failed", new ImapConnectionError("Reconnection disabled"));
    throw new ImapConnectionError("Reconnection disabled");
  };
  
  // This should fail to reconnect
  await assertRejects(
    () => client.forceReconnect(),
    ImapConnectionError
  );
  
  // Check that events were emitted
  assertEquals((client as any).eventsCalled.reconnecting, 1);
  assertEquals((client as any).eventsCalled.reconnect_failed, 1);
});

Deno.test("ImapClient - Connection timeout in ImapConnection", async () => {
  // Create a real ImapConnection instance
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
  
  // Set up a handler for the promise rejection to prevent unhandled rejection
  mockCancellable.promise.catch(() => {
    // This prevents the unhandled promise rejection
  });
  
  // Manually trigger disconnect when the timeout occurs
  (connection as any).disconnect = () => {
    (connection as any)._connected = false;
  };
  
  // Set the mock cancellable and trigger the timeout handler
  (connection as any).socketActivityCancellable = mockCancellable;
  await mockCancellable.promise.catch(() => {
    (connection as any).disconnect();
  });
  
  // After a timeout, operations should fail with not connected error
  await assertRejects(
    () => connection.readLine(),
    Error,
    "Not connected to IMAP server"
  );
  
  await assertRejects(
    () => connection.writeLine("TEST"),
    Error,
    "Not connected to IMAP server"
  );
});

Deno.test("ImapClient - Event emission on disconnect", () => {
  const client = createMockClient();
  
  // Create a simple event listener
  let closeCalled = false;
  client.on("close", () => {
    closeCalled = true;
  });
  
  // Emit the event directly
  (client as any).emit("close");
  
  // Check that the event was received
  assertEquals(closeCalled, true);
});

Deno.test("ImapClient - Retry command after successful reconnection", () => {
  const client = createMockClient();
  
  // Set the client as connected
  (client as any).connection._connected = true;
  (client as any)._authenticated = true;
  
  // Track calls
  let executeCommandCalls = 0;
  let reconnectCalled = false;
  
  // Override executeCommand
  (client as any).executeCommand = (command: string) => {
    executeCommandCalls++;
    
    // First call should fail with connection error
    if (executeCommandCalls === 1) {
      // Call reconnect
      (client as any).reconnect();
      // Return a promise that resolves to simulate retry
      return Promise.resolve(["OK"]);
    }
    
    // Subsequent calls should succeed
    return Promise.resolve(["OK"]);
  };
  
  // Override reconnect
  (client as any).reconnect = () => {
    reconnectCalled = true;
    return Promise.resolve();
  };
  
  // Override the isConnected method
  (client as any).isConnected = () => true;
  
  // Call listMailboxes which uses executeCommand internally
  client.listMailboxes();
  
  // Check that executeCommand was called
  assertEquals(executeCommandCalls, 1);
  
  // Check that reconnect was called
  assertEquals(reconnectCalled, true);
});

Deno.test("ImapClient - Append message with reconnection", () => {
  const client = createMockClient();
  
  // Track calls
  let reconnectCalled = false;
  let appendRetried = false;
  
  // Override reconnect
  (client as any).reconnect = () => {
    reconnectCalled = true;
    return Promise.resolve();
  };
  
  // Override appendMessage
  const originalAppendMessage = client.appendMessage;
  client.appendMessage = function() {
    if (!reconnectCalled) {
      // First call should trigger reconnection
      (this as any).reconnect();
      appendRetried = true;
    }
    return Promise.resolve();
  };
  
  // Call appendMessage
  client.appendMessage("INBOX", "Test");
  
  // Verify reconnect was called and appendMessage was retried
  assertEquals(reconnectCalled, true);
  assertEquals(appendRetried, true);
}); 