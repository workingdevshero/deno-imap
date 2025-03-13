/**
 * Advanced IMAP client example
 *
 * This example demonstrates more advanced features of the IMAP client,
 * including searching, fetching message content, and manipulating messages.
 *
 * To run this example, create a .env file with the following variables:
 * IMAP_HOST=your_imap_server
 * IMAP_PORT=993
 * IMAP_USERNAME=your_username
 * IMAP_PASSWORD=your_password
 * IMAP_USE_TLS=true
 *
 * Then run with: deno run --allow-net --allow-env --env-file=.env examples/advanced.ts
 */

import { ImapClient } from '../mod.ts';
import {
  deleteMessages,
  fetchMessagesFromSender,
  fetchMessagesSince,
  fetchMessagesWithSubject,
  markMessagesAsRead,
  moveMessages,
} from '../src/utils/mod.ts';

// Validate required environment variables
const requiredVars = ['IMAP_HOST', 'IMAP_PORT', 'IMAP_USERNAME', 'IMAP_PASSWORD'];
const missingVars = requiredVars.filter((varName) => !Deno.env.get(varName));

if (missingVars.length > 0) {
  console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please set these variables in your .env file.');
  console.error('See .env.example for required variables.');
  console.error('Run with: deno run --allow-net --allow-env --env-file=.env examples/advanced.ts');
  Deno.exit(1);
}

// Create a new IMAP client with environment variables
const client = new ImapClient({
  host: Deno.env.get('IMAP_HOST')!,
  port: parseInt(Deno.env.get('IMAP_PORT')!),
  tls: Deno.env.get('IMAP_USE_TLS') !== 'false', // Default to true if not explicitly set to false
  username: Deno.env.get('IMAP_USERNAME')!,
  password: Deno.env.get('IMAP_PASSWORD')!,
  autoConnect: false, // Don't connect automatically
});

async function main() {
  try {
    // Connect and authenticate
    await client.connect();
    await client.authenticate();
    console.log('Connected and authenticated!');

    // Example 1: Search for messages from a specific sender
    console.log('\n--- Example 1: Search for messages from a specific sender ---');
    const fromMessages = await fetchMessagesFromSender(
      client,
      'INBOX',
      'sender@example.com',
    );
    console.log(`Found ${fromMessages.length} messages from sender@example.com`);

    // Example 2: Search for messages with a specific subject
    console.log('\n--- Example 2: Search for messages with a specific subject ---');
    const subjectMessages = await fetchMessagesWithSubject(
      client,
      'INBOX',
      'Important',
    );
    console.log(`Found ${subjectMessages.length} messages with subject containing "Important"`);

    // Example 3: Search for messages received in the last 7 days
    console.log('\n--- Example 3: Search for messages received in the last 7 days ---');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentMessages = await fetchMessagesSince(
      client,
      'INBOX',
      sevenDaysAgo,
    );
    console.log(`Found ${recentMessages.length} messages received in the last 7 days`);

    // Example 4: Fetch message content
    console.log('\n--- Example 4: Fetch message content ---');
    if (recentMessages.length > 0) {
      // Select the first message
      const message = recentMessages[0];
      console.log(`Fetching content for message #${message.seq}`);

      // Fetch the full message content
      const fullMessages = await client.fetch(
        message.seq.toString(),
        { full: true, markSeen: false },
      );

      if (fullMessages.length > 0) {
        const fullMessage = fullMessages[0];
        if (fullMessage.parts && fullMessage.parts[''] && fullMessage.parts[''].data) {
          // Convert the message data to a string
          const content = new TextDecoder().decode(fullMessage.parts[''].data);
          console.log('Message content preview:', content.substring(0, 200) + '...');
        }
      }
    }

    // Example 5: Create a new mailbox
    console.log('\n--- Example 5: Create a new mailbox ---');
    const newMailboxName = 'Temp_' + Date.now();
    await client.createMailbox(newMailboxName);
    console.log(`Created new mailbox: ${newMailboxName}`);

    // Example 6: Move messages to the new mailbox
    console.log('\n--- Example 6: Move messages to the new mailbox ---');
    if (subjectMessages.length > 0) {
      const messageIds = subjectMessages.map((msg) => msg.seq);
      await moveMessages(client, 'INBOX', newMailboxName, messageIds);
      console.log(`Moved ${messageIds.length} messages to ${newMailboxName}`);
    }

    // Example 7: Mark messages as read
    console.log('\n--- Example 7: Mark messages as read ---');
    if (fromMessages.length > 0) {
      const messageIds = fromMessages.map((msg) => msg.seq);
      await markMessagesAsRead(client, 'INBOX', messageIds);
      console.log(`Marked ${messageIds.length} messages as read`);
    }

    // Example 8: Delete messages
    console.log('\n--- Example 8: Delete messages ---');
    if (recentMessages.length > 0 && recentMessages.length > 2) {
      // Delete the last 2 messages
      const messagesToDelete = recentMessages.slice(-2);
      const messageIds = messagesToDelete.map((msg) => msg.seq);
      await deleteMessages(client, 'INBOX', messageIds);
      console.log(`Deleted ${messageIds.length} messages`);
    }

    // Example 9: Clean up - delete the temporary mailbox
    console.log('\n--- Example 9: Clean up - delete the temporary mailbox ---');
    await client.deleteMailbox(newMailboxName);
    console.log(`Deleted mailbox: ${newMailboxName}`);

    // Example 10: List all mailboxes with their status
    console.log('\n--- Example 10: List all mailboxes with their status ---');
    const mailboxes = await client.listMailboxes();
    for (const mailbox of mailboxes) {
      const status = await client.getMailboxStatus(mailbox.name);
      console.log(
        `- ${mailbox.name}: ${status.exists || 0} messages, ${status.unseen || 0} unread`,
      );
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Disconnect
    client.disconnect();
    console.log('\nDisconnected!');
  }
}

// Run the example
if (import.meta.main) {
  main();
}
