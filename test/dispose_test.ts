import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { spy } from "https://deno.land/std/testing/mock.ts";
import { ImapClient } from "../src/client.ts";

// Create a test-specific ImapClient subclass that doesn't actually connect
class TestImapClient extends ImapClient {
  constructor() {
    super({
      host: "localhost",
      port: 143,
      username: "test",
      password: "test",
      tls: false,
      autoConnect: false, // Disable auto-connect to avoid actual connection attempts
    });
  }

  // Override connect to avoid actual connection
  override connect(): Promise<void> {
    return Promise.resolve();
  }
}

Deno.test("ImapClient - Symbol.dispose releases resources", () => {
  // Create a client
  const client = new TestImapClient();
  
  // Spy on the disconnect method
  const disconnectSpy = spy(client, "disconnect");
  
  // Use the client with the 'using' statement (simulated here)
  {
    // In actual code with TypeScript 5.2+, this would be:
    // using client = new TestImapClient();
    
    // Simulate end of scope - call Symbol.dispose manually
    client[Symbol.dispose]();
  }
  
  // Verify disconnect was called
  assertEquals(disconnectSpy.calls.length, 1);
});

Deno.test("ImapClient - Symbol.asyncDispose releases resources", async () => {
  // Create a client
  const client = new TestImapClient();
  
  // Spy on the disconnect method
  const disconnectSpy = spy(client, "disconnect");
  
  // Use the client with the 'await using' statement (simulated here)
  {
    // In actual code with TypeScript 5.2+, this would be:
    // await using client = new TestImapClient();
    
    // Simulate end of scope - call Symbol.asyncDispose manually
    await client[Symbol.asyncDispose]();
  }
  
  // Verify disconnect was called
  assertEquals(disconnectSpy.calls.length, 1);
}); 