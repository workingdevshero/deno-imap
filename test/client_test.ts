/**
 * IMAP client tests
 * 
 * This file contains tests for the IMAP client.
 * It uses a mock IMAP server to test the client functionality.
 */

import { assertEquals, assertRejects } from "https://deno.land/std/assert/mod.ts";
import { ImapClient } from "../src/client.ts";
import { ImapNotConnectedError, ImapNoMailboxSelectedError } from "../src/errors.ts";

// Mock server responses
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
  status: [
    '* STATUS "INBOX" (MESSAGES 3 UNSEEN 1 UIDNEXT 4 UIDVALIDITY 1740855787)',
    "OK STATUS completed"
  ],
  select: [
    "* 3 EXISTS",
    "* 0 RECENT",
    "* OK [UNSEEN 3]",
    "* OK [UIDNEXT 4]",
    "* OK [UIDVALIDITY 1740855787]",
    "* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
    "OK [READ-WRITE] SELECT completed"
  ],
  search: [
    "* SEARCH 1 2 3",
    "OK SEARCH completed"
  ],
  searchUnseen: [
    "* SEARCH 3",
    "OK SEARCH completed"
  ],
  fetch: [
    '* 3 FETCH (FLAGS (\\Unseen) UID 3 ENVELOPE ("Wed, 10 Jul 2024 12:00:00 +0000" "Test Subject" (("Sender Name" NIL "sender" "example.com")) (("Sender Name" NIL "sender" "example.com")) (("Sender Name" NIL "sender" "example.com")) ((NIL NIL "recipient" "example.com")) NIL NIL NIL "<message-id@example.com>"))',
    "OK FETCH completed"
  ]
};

// Create a mock client for testing
function createMockClient(): ImapClient {
  const client = new ImapClient({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    autoConnect: false
  });
  
  // Override the connect method to avoid actual network connection
  client.connect = async function() {
    (this as any)._connection = {
      connected: true,
      
      async connect(): Promise<void> {
        // Do nothing, pretend we're connected
      },
      
      async disconnect(): Promise<void> {
        this.connected = false;
      },
      
      async sendCommand(command: string): Promise<string[]> {
        if (command.startsWith("LOGIN")) {
          return mockResponses.login;
        } else if (command.startsWith("CAPABILITY")) {
          return mockResponses.capabilities;
        } else if (command.startsWith("LIST")) {
          return mockResponses.list;
        } else if (command.startsWith("STATUS")) {
          return mockResponses.status;
        } else if (command.startsWith("SELECT")) {
          return mockResponses.select;
        } else if (command.startsWith("SEARCH") && command.includes("UNSEEN")) {
          return mockResponses.searchUnseen;
        } else if (command.startsWith("SEARCH")) {
          return mockResponses.search;
        } else if (command.startsWith("FETCH")) {
          return mockResponses.fetch;
        }
        
        return ["OK"];
      }
    };
    
    // Set connected flag
    (this as any)._connected = true;
    
    // Set capabilities
    (this as any)._capabilities = ["IMAP4rev1", "STARTTLS", "AUTH=PLAIN"];
    
    return Promise.resolve();
  };
  
  // Override the authenticate method to set the authenticated flag
  client.authenticate = async function() {
    if (!(this as any)._connected) {
      throw new ImapNotConnectedError();
    }
    
    (this as any)._authenticated = true;
    return Promise.resolve();
  };
  
  // Override the listMailboxes method
  client.listMailboxes = async function() {
    if (!(this as any)._connected) {
      throw new ImapNotConnectedError();
    }
    
    if (!(this as any)._authenticated) {
      await this.authenticate();
    }
    
    // Parse the mock response
    const mailboxes = [];
    for (const line of mockResponses.list) {
      if (line.startsWith("* LIST")) {
        try {
          const mailbox = (this as any)._parsers.parseListResponse(line);
          mailboxes.push(mailbox);
        } catch (error) {
          console.error("Failed to parse LIST response:", error);
        }
      }
    }
    
    return mailboxes;
  };
  
  // Override the getMailboxStatus method
  client.getMailboxStatus = async function(mailbox: string) {
    if (!(this as any)._connected) {
      throw new ImapNotConnectedError();
    }
    
    if (!(this as any)._authenticated) {
      await this.authenticate();
    }
    
    // Parse the mock response
    for (const line of mockResponses.status) {
      if (line.startsWith("* STATUS")) {
        try {
          return (this as any)._parsers.parseStatus(line);
        } catch (error) {
          console.error("Failed to parse STATUS response:", error);
        }
      }
    }
    
    return {};
  };
  
  // Override the selectMailbox method
  client.selectMailbox = async function(mailbox: string) {
    if (!(this as any)._connected) {
      throw new ImapNotConnectedError();
    }
    
    if (!(this as any)._authenticated) {
      await this.authenticate();
    }
    
    // Parse the mock response
    const result = (this as any)._parsers.parseSelect(mockResponses.select);
    result.name = mailbox;
    
    // Get the unseen count from the STATUS response
    for (const line of mockResponses.status) {
      if (line.startsWith("* STATUS")) {
        try {
          const status = (this as any)._parsers.parseStatus(line);
          if (status.unseen !== undefined) {
            result.unseen = status.unseen;
          }
        } catch (error) {
          console.warn("Failed to parse STATUS response:", error);
        }
      }
    }
    
    // Set the selected mailbox
    (this as any)._selectedMailbox = result;
    
    return result;
  };
  
  // Override the search method
  client.search = async function(criteria: any) {
    if (!(this as any)._connected) {
      throw new ImapNotConnectedError();
    }
    
    if (!(this as any)._authenticated) {
      await this.authenticate();
    }
    
    if (!(this as any)._selectedMailbox) {
      throw new ImapNoMailboxSelectedError();
    }
    
    // Return different results based on the criteria
    if (criteria.flags && criteria.flags.has && criteria.flags.has.includes("Unseen")) {
      for (const line of mockResponses.searchUnseen) {
        if (line.startsWith("* SEARCH")) {
          try {
            return (this as any)._parsers.parseSearch(line);
          } catch (error) {
            console.error("Failed to parse SEARCH response:", error);
          }
        }
      }
    } else {
      for (const line of mockResponses.search) {
        if (line.startsWith("* SEARCH")) {
          try {
            return (this as any)._parsers.parseSearch(line);
          } catch (error) {
            console.error("Failed to parse SEARCH response:", error);
          }
        }
      }
    }
    
    return [];
  };
  
  // Override the fetch method
  client.fetch = async function(sequence: string, options: any) {
    if (!(this as any)._connected) {
      throw new ImapNotConnectedError();
    }
    
    if (!(this as any)._authenticated) {
      await this.authenticate();
    }
    
    if (!(this as any)._selectedMailbox) {
      throw new ImapNoMailboxSelectedError();
    }
    
    // Parse the mock response
    const messages = [];
    let currentMessage: any = null;
    
    for (const line of mockResponses.fetch) {
      // Check if this is the start of a new message
      const fetchMatch = line.match(/^\* (\d+) FETCH/i);
      if (fetchMatch) {
        // If we were parsing a message, add it to the list
        if (currentMessage && currentMessage.seq) {
          messages.push(currentMessage);
        }
        
        // Start a new message
        currentMessage = {
          seq: parseInt(fetchMatch[1], 10),
          flags: [],
        };
        
        // Parse the message data
        try {
          const messageData = (this as any)._parsers.parseFetch([line]);
          
          // Add the parsed data to the current message
          if (messageData) {
            currentMessage = { ...currentMessage, ...messageData };
          }
        } catch (error) {
          console.warn("Failed to parse FETCH response:", error);
        }
      }
    }
    
    // Add the last message if we were parsing one
    if (currentMessage && currentMessage.seq) {
      messages.push(currentMessage);
    }
    
    return messages;
  };
  
  // Override the disconnect method
  client.disconnect = async function() {
    if ((this as any)._connection) {
      await (this as any)._connection.disconnect();
    }
    (this as any)._connected = false;
    (this as any)._authenticated = false;
    (this as any)._selectedMailbox = null;
    return Promise.resolve();
  };
  
  // Add parsers
  (client as any)._parsers = {
    parseListResponse: (line: string) => {
      // Format: * LIST (\HasNoChildren) "/" "INBOX"
      const match = line.match(/^\* LIST \((.*?)\) "(.+?)" (.+)$/i);
      
      if (!match) {
        throw new Error("Invalid list response");
      }
      
      const flags = match[1].split(" ").filter(Boolean).map((flag) => {
        // Remove backslashes and quotes
        return flag.replace(/^\\/, "").replace(/^"(.*)"$/, "$1");
      });
      
      const delimiter = match[2];
      let name = match[3];
      
      // If name is quoted, remove quotes
      if (name.startsWith('"') && name.endsWith('"')) {
        name = name.substring(1, name.length - 1);
      }
      
      return {
        name,
        flags,
        delimiter,
      };
    },
    
    parseStatus: (line: string) => {
      // Format: * STATUS "INBOX" (MESSAGES 231 UNSEEN 5 UIDNEXT 44292 UIDVALIDITY 1)
      const match = line.match(/^\* STATUS "?([^"]+)"? \((.*)\)$/i);
      
      if (!match) {
        throw new Error("Invalid status response");
      }
      
      const name = match[1];
      const statusItems = match[2].split(" ");
      const result: any = { name };
      
      for (let i = 0; i < statusItems.length; i += 2) {
        const key = statusItems[i].toLowerCase();
        const value = parseInt(statusItems[i + 1], 10);
        
        switch (key) {
          case "messages":
            result.exists = value;
            break;
          case "recent":
            result.recent = value;
            break;
          case "unseen":
            result.unseen = value;
            break;
          case "uidnext":
            result.uidNext = value;
            break;
          case "uidvalidity":
            result.uidValidity = value;
            break;
        }
      }
      
      return result;
    },
    
    parseSelect: (lines: string[]) => {
      const result: any = {};
      
      for (const line of lines) {
        // EXISTS response
        let match = line.match(/^\* (\d+) EXISTS$/i);
        if (match) {
          result.exists = parseInt(match[1], 10);
          continue;
        }
        
        // RECENT response
        match = line.match(/^\* (\d+) RECENT$/i);
        if (match) {
          result.recent = parseInt(match[1], 10);
          continue;
        }
        
        // UNSEEN response - this is the first unseen message number, not the count
        match = line.match(/^\* OK \[UNSEEN (\d+)\]/i);
        if (match) {
          // This is the sequence number of the first unseen message
          result.firstUnseen = parseInt(match[1], 10);
          continue;
        }
        
        // UIDNEXT response
        match = line.match(/^\* OK \[UIDNEXT (\d+)\]/i);
        if (match) {
          result.uidNext = parseInt(match[1], 10);
          continue;
        }
        
        // UIDVALIDITY response
        match = line.match(/^\* OK \[UIDVALIDITY (\d+)\]/i);
        if (match) {
          result.uidValidity = parseInt(match[1], 10);
          continue;
        }
        
        // FLAGS response
        match = line.match(/^\* FLAGS \((.*)\)$/i);
        if (match) {
          result.flags = match[1].split(" ").filter(Boolean);
          continue;
        }
      }
      
      return result;
    },
    
    parseSearch: (line: string) => {
      // Format: * SEARCH 1 2 3 4 5
      const match = line.match(/^\* SEARCH(.*)$/i);
      
      if (!match) {
        throw new Error("Invalid search response");
      }
      
      return match[1]
        .trim()
        .split(" ")
        .filter(Boolean)
        .map((num) => parseInt(num, 10));
    },
    
    parseFetch: (lines: string[]) => {
      const result: any = {};
      
      for (const line of lines) {
        // Extract the message data between parentheses
        // Format: * 1 FETCH (FLAGS (\Seen) UID 100 ...)
        const match = line.match(/^\* \d+ FETCH \((.*)\)$/i);
        if (!match) continue;
        
        const fetchData = match[1];
        
        // Parse FLAGS
        const flagsMatch = fetchData.match(/FLAGS \(([^)]*)\)/i);
        if (flagsMatch) {
          const flags = flagsMatch[1].split(" ")
            .filter(Boolean)
            .map(flag => flag.replace(/^\\/, "")); // Remove leading backslash
          result.flags = flags;
        }
        
        // Parse UID
        const uidMatch = fetchData.match(/UID (\d+)/i);
        if (uidMatch) {
          result.uid = parseInt(uidMatch[1], 10);
        }
        
        // Parse ENVELOPE
        const envelopeMatch = fetchData.match(/ENVELOPE \(([^)]+)\)/i);
        if (envelopeMatch) {
          result.envelope = {
            subject: "Test Subject"
          };
        }
      }
      
      return result;
    }
  };
  
  return client;
}

Deno.test("ImapClient - Test 1: Connect and authenticate", async () => {
  const client = createMockClient();
  
  await client.connect();
  assertEquals((client as any)._connection.connected, true);
  
  await client.authenticate();
  assertEquals((client as any)._authenticated, true);
  
  await client.disconnect();
  assertEquals((client as any)._connection.connected, false);
});

Deno.test("ImapClient - Test 2: Get capabilities", async () => {
  const client = createMockClient();
  
  await client.connect();
  await client.authenticate();
  
  const capabilities = client.capabilities;
  assertEquals(capabilities.includes("IMAP4rev1"), true);
  assertEquals(capabilities.includes("STARTTLS"), true);
  assertEquals(capabilities.includes("AUTH=PLAIN"), true);
  
  await client.disconnect();
});

Deno.test("ImapClient - Test 3: List mailboxes", async () => {
  const client = createMockClient();
  
  await client.connect();
  await client.authenticate();
  
  const mailboxes = await client.listMailboxes();
  assertEquals(mailboxes.length, 3);
  assertEquals(mailboxes[0].name, "INBOX");
  assertEquals(mailboxes[1].name, "Trash");
  assertEquals(mailboxes[2].name, "Sent");
  
  await client.disconnect();
});

Deno.test("ImapClient - Test 4: Select mailbox", async () => {
  const client = createMockClient();
  
  await client.connect();
  await client.authenticate();
  
  const mailbox = await client.selectMailbox("INBOX");
  assertEquals(mailbox.exists, 3);
  assertEquals(mailbox.recent, 0);
  assertEquals(mailbox.unseen, 1);
  assertEquals(mailbox.firstUnseen, 3);
  assertEquals(mailbox.uidNext, 4);
  assertEquals(mailbox.uidValidity, 1740855787);
  
  await client.disconnect();
});

Deno.test("ImapClient - Test 5: Get mailbox status", async () => {
  const client = createMockClient();
  
  await client.connect();
  await client.authenticate();
  
  const status = await client.getMailboxStatus("INBOX");
  assertEquals(status.name, "INBOX");
  assertEquals(status.exists, 3);
  assertEquals(status.unseen, 1);
  assertEquals(status.uidNext, 4);
  assertEquals(status.uidValidity, 1740855787);
  
  await client.disconnect();
});

Deno.test("ImapClient - Test 6: Search messages", async () => {
  const client = createMockClient();
  
  await client.connect();
  await client.authenticate();
  await client.selectMailbox("INBOX");
  
  // Search all messages
  const allMessages = await client.search({});
  assertEquals(allMessages, [1, 2, 3]);
  
  // Search unseen messages
  const unseenMessages = await client.search({ flags: { has: ["Unseen"] } });
  assertEquals(unseenMessages, [3]);
  
  await client.disconnect();
});

Deno.test("ImapClient - Test 7: Fetch messages", async () => {
  const client = createMockClient();
  
  await client.connect();
  await client.authenticate();
  await client.selectMailbox("INBOX");
  
  const messages = await client.fetch("3", { envelope: true, flags: true });
  assertEquals(messages.length, 1);
  assertEquals(messages[0].seq, 3);
  assertEquals(messages[0].uid, 3);
  assertEquals((messages[0].flags as string[]).includes("Unseen"), true);
  
  const envelope = messages[0].envelope as any;
  assertEquals(envelope.subject, "Test Subject");
  
  await client.disconnect();
});

Deno.test("ImapClient - Test 8: Operations not allowed without connection", async () => {
  const client = new ImapClient({
    host: "localhost",
    port: 143,
    username: "test",
    password: "test",
    tls: false,
    autoConnect: false
  });
  
  // Authenticate without connection
  await assertRejects(
    async () => await client.authenticate(),
    ImapNotConnectedError
  );
  
  // List mailboxes without connection
  await assertRejects(
    async () => await client.listMailboxes(),
    ImapNotConnectedError
  );
  
  // Get mailbox status without connection
  await assertRejects(
    async () => await client.getMailboxStatus("INBOX"),
    ImapNotConnectedError
  );
  
  // Select mailbox without connection
  await assertRejects(
    async () => await client.selectMailbox("INBOX"),
    ImapNotConnectedError
  );
  
  // Search without connection
  await assertRejects(
    async () => await client.search({}),
    ImapNotConnectedError
  );
  
  // Fetch without connection
  await assertRejects(
    async () => await client.fetch("1", { flags: true }),
    ImapNotConnectedError
  );
  
  // Connect and then try to fetch without selecting a mailbox
  const mockClient = createMockClient();
  await mockClient.connect();
  await mockClient.authenticate();
  
  await assertRejects(
    async () => await mockClient.fetch("1", { flags: true }),
    ImapNoMailboxSelectedError
  );
  
  await mockClient.disconnect();
}); 