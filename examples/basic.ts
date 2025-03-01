/**
 * Basic IMAP client example
 * 
 * This example demonstrates how to use the IMAP client to connect to a server,
 * list mailboxes, and fetch messages.
 * 
 * To run this example, create a .env file with the following variables:
 * IMAP_HOST=your_imap_server
 * IMAP_PORT=993
 * IMAP_USERNAME=your_username
 * IMAP_PASSWORD=your_password
 * IMAP_USE_TLS=true
 * 
 * Then run with: deno run --allow-net --allow-env --env-file=.env examples/basic.ts
 */

import { ImapClient } from "../mod.ts";
import { fetchUnreadMessages } from "../src/utils/mod.ts";

// Validate required environment variables
const requiredEnvVars = ["IMAP_HOST", "IMAP_PORT", "IMAP_USERNAME", "IMAP_PASSWORD"];
for (const envVar of requiredEnvVars) {
  if (!Deno.env.get(envVar)) {
    console.error(`Error: ${envVar} environment variable is required`);
    Deno.exit(1);
  }
}

// Get environment variables
const host = Deno.env.get("IMAP_HOST")!;
const port = parseInt(Deno.env.get("IMAP_PORT")!, 10);
const username = Deno.env.get("IMAP_USERNAME")!;
const password = Deno.env.get("IMAP_PASSWORD")!;
const tls = Deno.env.get("IMAP_USE_TLS") === "true";

// Create IMAP client
const client = new ImapClient({
  host,
  port,
  username,
  password,
  tls,
});

try {
  console.log("Connecting to IMAP server...");
  await client.connect();
  console.log("Connected!");

  console.log("Authenticating...");
  await client.authenticate();
  console.log("Authenticated!");

  // Get server capabilities
  console.log("Server capabilities:", client.capabilities);

  // List mailboxes
  console.log("Listing mailboxes...");
  const mailboxes = await client.listMailboxes();
  console.log("Available mailboxes:");
  for (const mailbox of mailboxes) {
    console.log(`- ${mailbox.name} (flags: ${mailbox.flags.join(", ")})`);
  }
  console.log();

  // Get INBOX status
  console.log("Getting INBOX status...");
  const status = await client.getMailboxStatus("INBOX");
  console.log("INBOX status:", status);
  console.log();

  // Select INBOX
  console.log("Selecting INBOX...");
  const inbox = await client.selectMailbox("INBOX");
  console.log(`Selected INBOX with ${inbox.exists} messages`);
  console.log();

  // Debug: Search with different criteria
  console.log("Debug: Searching with different criteria...");
  
  console.log("1. Search for ALL messages:");
  const allMessages = await client.search({});
  console.log(`Found ${allMessages.length} messages with ALL criteria`);
  
  console.log("2. Search for UNSEEN messages (using 'Unseen' flag):");
  const unseenMessages1 = await client.search({ flags: { has: ["Unseen"] } });
  console.log(`Found ${unseenMessages1.length} messages with 'Unseen' flag`);
  
  console.log("3. Search for UNSEEN messages (using '\\Unseen' flag):");
  const unseenMessages2 = await client.search({ flags: { has: ["\\Unseen"] } });
  console.log(`Found ${unseenMessages2.length} messages with '\\Unseen' flag`);
  
  console.log("4. Search for NEW messages:");
  const newMessages = await client.search({ flags: { has: ["New"] } });
  console.log(`Found ${newMessages.length} messages with 'New' flag`);
  
  console.log("5. Search for RECENT messages:");
  const recentMessages = await client.search({ flags: { has: ["Recent"] } });
  console.log(`Found ${recentMessages.length} messages with 'Recent' flag`);
  console.log();

  // Fetch unread messages
  console.log("Fetching unread messages...");
  
  // Manual implementation
  console.log("Manual implementation:");
  console.log("1. Searching for unseen messages...");
  const unseenIds = await client.search({ flags: { has: ["Unseen"] } });
  console.log(`Found ${unseenIds.length} unseen message IDs:`, unseenIds);
  
  console.log("2. Fetching messages...");
  const messages = await client.fetch(unseenIds.join(","), { envelope: true, flags: true });
  console.log(`Fetched ${messages.length} messages`);
  console.log();
  
  // Display message details
  for (const message of messages) {
    console.log(`Message # ${message.seq}`);
    console.log(`Raw message data:`, JSON.stringify(message, null, 2));
    
    const envelope = message.envelope as any;
    const from = envelope?.from?.[0] || {};
    const fromAddress = from.mailbox && from.host ? `${from.mailbox}@${from.host}` : "undefined@undefined";
    
    console.log(`From: ${fromAddress}`);
    console.log(`Subject: ${envelope?.subject || "undefined"}`);
    console.log(`Date: ${envelope?.date || "undefined"}`);
    console.log();
  }
  
  // Using utility function
  console.log("Using utility function:");
  const unreadMessages = await fetchUnreadMessages(client, "INBOX");
  console.log(`Found ${unreadMessages.length} unread messages`);
  console.log();
  
  // Display message details
  for (const message of unreadMessages) {
    console.log(`Message # ${message.seq}`);
    console.log(`Raw message data:`, JSON.stringify(message, null, 2));
    
    const envelope = message.envelope as any;
    const from = envelope?.from?.[0] || {};
    const fromAddress = from.mailbox && from.host ? `${from.mailbox}@${from.host}` : "undefined@undefined";
    
    console.log(`From: ${fromAddress}`);
    console.log(`Subject: ${envelope?.subject || "undefined"}`);
    console.log(`Date: ${envelope?.date || "undefined"}`);
    console.log();
  }
} catch (error) {
  console.error("Error:", error);
} finally {
  console.log("Disconnecting...");
  await client.disconnect();
  console.log("Disconnected!");
} 