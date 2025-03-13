/**
 * IMAP search example
 *
 * This example demonstrates how to search for messages in an IMAP mailbox.
 *
 * To run this example, create a .env file with the following variables:
 * IMAP_HOST=your_imap_server
 * IMAP_PORT=993
 * IMAP_USERNAME=your_username
 * IMAP_PASSWORD=your_password
 * IMAP_USE_TLS=true
 *
 * Then run with: deno run --allow-net --allow-env --env-file=.env examples/search.ts
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
  // Connect and authenticate
  await client.connect();
  await client.authenticate();
  console.log('Connected and authenticated');

  // Select the INBOX
  await client.selectMailbox('INBOX');
  console.log('Selected INBOX');

  // Search for unread messages
  console.log('\nSearching for unread messages...');
  const unreadMessages = await client.search({
    flags: {
      not: ['Seen'],
    },
  });
  console.log(`Found ${unreadMessages.length} unread messages`);

  // Search for messages from the last 7 days
  console.log('\nSearching for messages from the last 7 days...');
  const date = new Date();
  date.setDate(date.getDate() - 7);
  const recentMessages = await client.search({
    date: {
      internal: {
        since: date,
      },
    },
  });
  console.log(`Found ${recentMessages.length} messages from the last 7 days`);

  // Search for messages with a specific subject
  console.log("\nSearching for messages with 'Test' in the subject...");
  const testMessages = await client.search({
    header: [
      { field: 'subject', value: 'Test' },
    ],
  });
  console.log(`Found ${testMessages.length} messages with 'Test' in the subject`);

  // Search for messages with a specific text in the body
  console.log("\nSearching for messages containing 'hello'...");
  const helloMessages = await client.search({
    text: 'hello',
  });
  console.log(`Found ${helloMessages.length} messages containing 'hello'`);

  // Combine search criteria with AND
  console.log('\nSearching for unread messages from the last 7 days...');
  const unreadRecentMessages = await client.search({
    and: [
      {
        flags: {
          not: ['Seen'],
        },
      },
      {
        date: {
          internal: {
            since: date,
          },
        },
      },
    ],
  });
  console.log(`Found ${unreadRecentMessages.length} unread messages from the last 7 days`);
} catch (error: unknown) {
  console.error('Error:', error instanceof Error ? error.message : String(error));
} finally {
  // Disconnect from the server
  await client.disconnect();
  console.log('\nDisconnected from IMAP server');
}
