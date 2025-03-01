/**
 * IMAP mailbox management example
 * 
 * This example demonstrates how to manage mailboxes in an IMAP server.
 * 
 * To run this example, create a .env file with the following variables:
 * IMAP_HOST=your_imap_server
 * IMAP_PORT=993
 * IMAP_USERNAME=your_username
 * IMAP_PASSWORD=your_password
 * IMAP_USE_TLS=true
 * 
 * Then run with: deno run --allow-net --allow-env --env-file=.env examples/mailboxes.ts
 */

import { ImapClient } from "../mod.ts";

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
const tls = Deno.env.get("IMAP_USE_TLS") !== "false"; // Default to true if not specified

// Create a new IMAP client
const client = new ImapClient({
  host,
  port,
  tls,
  username,
  password,
});

// Main function to handle the IMAP operations
async function main() {
  try {
    // Connect and authenticate
    await client.connect();
    await client.authenticate();
    console.log("Connected and authenticated");

    // List all mailboxes
    console.log("\nListing all mailboxes:");
    const mailboxes = await client.listMailboxes();
    for (const mailbox of mailboxes) {
      console.log(`- ${mailbox.name} (${mailbox.flags.join(", ")})`);
    }

    // Get status of INBOX
    console.log("\nGetting status of INBOX:");
    const inboxStatus = await client.getMailboxStatus("INBOX");
    console.log(`INBOX: ${inboxStatus.exists} messages, ${inboxStatus.unseen} unseen`);

    // Create a new test mailbox
    const testMailboxName = `Test-${Date.now()}`;
    console.log(`\nCreating new mailbox: ${testMailboxName}`);
    await client.createMailbox(testMailboxName);
    console.log("Mailbox created");

    // List mailboxes again to confirm creation
    console.log("\nListing mailboxes after creation:");
    const updatedMailboxes = await client.listMailboxes();
    for (const mailbox of updatedMailboxes) {
      console.log(`- ${mailbox.name} (${mailbox.flags.join(", ")})`);
    }

    // Select the new mailbox
    console.log(`\nSelecting mailbox: ${testMailboxName}`);
    const testMailbox = await client.selectMailbox(testMailboxName);
    console.log(`Selected ${testMailboxName}: ${testMailbox.exists} messages`);

    // Rename the mailbox
    const renamedMailboxName = `${testMailboxName}-Renamed`;
    console.log(`\nRenaming mailbox from ${testMailboxName} to ${renamedMailboxName}`);
    await client.renameMailbox(testMailboxName, renamedMailboxName);
    console.log("Mailbox renamed");

    // List mailboxes again to confirm rename
    console.log("\nListing mailboxes after rename:");
    const renamedMailboxes = await client.listMailboxes();
    for (const mailbox of renamedMailboxes) {
      console.log(`- ${mailbox.name} (${mailbox.flags.join(", ")})`);
    }

    // Delete the test mailbox
    console.log(`\nDeleting mailbox: ${renamedMailboxName}`);
    await client.deleteMailbox(renamedMailboxName);
    console.log("Mailbox deleted");

    // List mailboxes one final time to confirm deletion
    console.log("\nListing mailboxes after deletion:");
    const finalMailboxes = await client.listMailboxes();
    for (const mailbox of finalMailboxes) {
      console.log(`- ${mailbox.name} (${mailbox.flags.join(", ")})`);
    }

  } catch (error: unknown) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
  } finally {
    // Disconnect from the server
    await client.disconnect();
    console.log("\nDisconnected from IMAP server");
  }
}

// Run the main function
await main(); 