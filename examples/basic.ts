/**
 * Basic IMAP client example
 *
 * This example demonstrates how to use the IMAP client to connect to a server,
 * list mailboxes, and check the status of the INBOX.
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

import { ImapClient } from '../mod.ts';

// Validate required environment variables
const requiredEnvVars = ['IMAP_HOST', 'IMAP_PORT', 'IMAP_USERNAME', 'IMAP_PASSWORD'];
for (const envVar of requiredEnvVars) {
  if (!Deno.env.get(envVar)) {
    console.error(`Error: ${envVar} environment variable is required`);
    Deno.exit(1);
  }
}

// Get environment variables
const host = Deno.env.get('IMAP_HOST')!;
const port = parseInt(Deno.env.get('IMAP_PORT')!, 10);
const username = Deno.env.get('IMAP_USERNAME')!;
const password = Deno.env.get('IMAP_PASSWORD')!;
const tls = Deno.env.get('IMAP_USE_TLS') !== 'false'; // Default to true if not specified

// Create a new IMAP client
const client = new ImapClient({
  host,
  port,
  tls,
  username,
  password,
});

try {
  // Connect to the server
  await client.connect();
  console.log('Connected to IMAP server');

  // Authenticate
  await client.authenticate();
  console.log('Authenticated');

  // Get server capabilities
  console.log('Server capabilities:', client.capabilities);

  // Append a new message with multi-byte characters
  console.log('Appending a new message to INBOX...');
  await client.appendMessage(
    'INBOX',
    'Subject: Special Announcement\r\n' +
      'From: user@example.com\r\n' +
      'Date: Fri, 13 Mar 2024 12:00:00 +0000\r\n' +
      '\r\n' +
      'Hello! 🌟 Important announcement in English and Chinese (你好)!\r\n',
    ['\\Seen'], // Mark as read
    new Date(), // Use current date
  );
  console.log('Message appended successfully');

  // List available mailboxes
  const mailboxes = await client.listMailboxes();
  console.log('\nAvailable mailboxes:');
  for (const mailbox of mailboxes) {
    console.log(`- ${mailbox.name} (${mailbox.flags.join(', ')})`);
  }

  // Get status of INBOX using STATUS command
  const inboxStatus = await client.getMailboxStatus('INBOX');
  console.log(
    `\nINBOX status from getMailboxStatus: ${inboxStatus.exists} messages, ${inboxStatus.unseen} unseen`,
  );

  // Select the INBOX
  const inbox = await client.selectMailbox('INBOX');
  console.log(`INBOX status from selectMailbox: ${inbox.exists} messages, ${inbox.unseen} unseen`);
} catch (error: unknown) {
  console.error('Error:', error instanceof Error ? error.message : String(error));
} finally {
  try {
    // Try to disconnect gracefully
    await client.disconnect();
    console.log('\nDisconnected from IMAP server');
  } catch (error) {
    // If disconnect fails, force close
    console.error(
      'Error during disconnect:',
      error instanceof Error ? error.message : String(error),
    );
    client.close();
    console.log('\nForced close of IMAP client');
  }
}
