/**
 * IMAP list recent messages example
 *
 * This example demonstrates how to list the most recent message from each non-standard mailbox.
 *
 * To run this example, create a .env file with the following variables:
 * IMAP_HOST=your_imap_server
 * IMAP_PORT=993
 * IMAP_USERNAME=your_username
 * IMAP_PASSWORD=your_password
 * IMAP_USE_TLS=true
 *
 * Then run with: deno run --allow-net --allow-env --env-file=.env examples/list_recent.ts
 */

import { ImapClient } from "../mod.ts";
import { decodeBody, parseMultipartMessage } from "./utils/body.ts";
import { getContentInfo } from "./utils/headers.ts";

// Helper function to decode Uint8Array to string
function decodeUint8Array(data: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(data);
}

// Validate required environment variables
const requiredEnvVars = [
  "IMAP_HOST",
  "IMAP_PORT",
  "IMAP_USERNAME",
  "IMAP_PASSWORD",
];
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
const tls = Deno.env.get("IMAP_USE_TLS") !== "false"; // Default to true if not specified

// Create a new IMAP client
const client = new ImapClient({
  host,
  port,
  tls,
  username,
  password,
});

// Set of standard mailboxes to exclude
const standardMailboxes = new Set([
  "INBOX",
  "Trash",
  "Spam",
  "Sent",
  "Drafts",
  "Junk",
]);

async function processMailbox(mailboxName: string) {
  console.log(`\nProcessing mailbox: ${mailboxName}`);

  // Select the mailbox
  const mailbox = await client.selectMailbox(mailboxName);
  console.log(`Selected ${mailboxName} with ${mailbox.exists} messages`);

  if (!mailbox.exists || mailbox.exists === 0) {
    console.log("No messages in mailbox");
    return;
  }

  // Fetch the most recent message
  const messageNumber = mailbox.exists;
  console.log(`Fetching most recent message (#${messageNumber})...`);

  const messages = await client.fetch(messageNumber.toString(), {
    envelope: true,
    flags: true,
    bodyParts: ["HEADER", "TEXT"],
    full: true,
  });

  if (messages.length === 0) {
    console.log("No message details available");
    return;
  }

  const message = messages[0];

  // Display message envelope information
  if (message.envelope) {
    const from = message.envelope.from?.[0] || {
      name: "Unknown",
      mailbox: "unknown",
      host: "unknown",
    };
    const to = message.envelope.to?.[0] || {
      name: "Unknown",
      mailbox: "unknown",
      host: "unknown",
    };

    console.log("\nMessage details:");
    console.log(`From: ${from.name || from.mailbox + "@" + from.host}`);
    console.log(`To: ${to.name || to.mailbox + "@" + to.host}`);
    console.log(`Subject: ${message.envelope.subject || "No subject"}`);

    if (message.envelope.date) {
      try {
        const date = new Date(message.envelope.date);
        console.log(`Date: ${date.toLocaleString()}`);
      } catch {
        console.log(`Date: ${message.envelope.date} (unparsed)`);
      }
    }
  }

  // Get content info from headers
  let contentInfo: {
    contentType: string;
    encoding: string;
    boundary?: string;
  } = {
    contentType: "text/plain",
    encoding: "7bit",
  };
  if (message.headers) {
    contentInfo = getContentInfo(message.headers);
  }

  // Display message body with proper decoding
  console.log("\n=== MESSAGE CONTENT ===");

  if (message.parts && message.parts.TEXT) {
    const rawBodyText = decodeUint8Array(message.parts.TEXT.data);

    if (
      contentInfo.contentType.startsWith("multipart/") &&
      contentInfo.boundary
    ) {
      const parsedContent = parseMultipartMessage(
        rawBodyText,
        contentInfo.boundary
      );
      console.log(parsedContent);
    } else {
      const decodedBody = decodeBody(rawBodyText, contentInfo.encoding);

      if (contentInfo.contentType.includes("html")) {
        const plainText = decodedBody
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        console.log(plainText);
      } else {
        console.log(decodedBody);
      }
    }
  } else {
    console.log("No message body available");
  }
}

// Main function to handle the IMAP operations
async function main() {
  try {
    // Connect and authenticate
    await client.connect();
    await client.authenticate();
    console.log("Connected and authenticated");

    // List all mailboxes
    const mailboxes = await client.listMailboxes();
    console.log("\nProcessing non-standard mailboxes:");

    // Process each non-standard mailbox
    for (const mailbox of mailboxes) {
      const name = mailbox.name;

      // Skip standard mailboxes
      if (standardMailboxes.has(name)) {
        continue;
      }

      await processMailbox(name);
    }
  } catch (error: unknown) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    // Disconnect from the server
    await client.disconnect();
    console.log("\nDisconnected from IMAP server");
  }
}

// Run the main function
await main();
