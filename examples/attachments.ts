#!/usr/bin/env -S deno run --allow-net --allow-env --env-file=.env --allow-write --allow-read

/**
 * Example: Finding and fetching attachments
 *
 * This example demonstrates how to:
 * 1. Find messages with attachments in a mailbox
 * 2. Extract attachment information (filename, type, size, etc.)
 * 3. Fetch attachment content
 * 4. Save attachments to a local folder
 */

import { ensureDir } from 'https://deno.land/std/fs/mod.ts';
import { join } from 'https://deno.land/std/path/mod.ts';
import { decodeAttachment, findAttachments, hasAttachments, ImapClient } from '../mod.ts';

// Create a client using environment variables
const client = new ImapClient({
  host: Deno.env.get('IMAP_HOST')!,
  port: parseInt(Deno.env.get('IMAP_PORT')!),
  tls: Deno.env.get('IMAP_USE_TLS') !== 'false',
  username: Deno.env.get('IMAP_USERNAME')!,
  password: Deno.env.get('IMAP_PASSWORD')!,
});

// Define the attachments folder path
const ATTACHMENTS_FOLDER = join(Deno.cwd(), 'attachments');

try {
  // Create the attachments folder if it doesn't exist
  await ensureDir(ATTACHMENTS_FOLDER);
  console.log(`Attachments will be saved to: ${ATTACHMENTS_FOLDER}`);

  // Connect and authenticate
  await client.connect();
  await client.authenticate();
  console.log('Connected and authenticated successfully');

  // Select the INBOX
  const inbox = await client.selectMailbox('INBOX');
  console.log(`INBOX has ${inbox.exists} messages`);

  // Determine how many messages to fetch (up to 20)
  const messageCount = inbox.exists || 0;
  const fetchCount = Math.min(messageCount, 20);

  if (fetchCount === 0) {
    console.log('No messages in INBOX');
    client.disconnect();
    Deno.exit(0);
  }

  // Fetch the most recent messages with their body structure
  const fetchRange = `${
    Math.max(
      1,
      messageCount - fetchCount + 1,
    )
  }:${messageCount}`;
  console.log(`Fetching ${fetchCount} most recent messages (${fetchRange})...`);

  const messages = await client.fetch(fetchRange, {
    envelope: true,
    bodyStructure: true,
  });

  console.log(`Fetched ${messages.length} messages`);

  // Find messages with attachments
  const messagesWithAttachments = messages.filter(
    (msg) => msg.bodyStructure && hasAttachments(msg.bodyStructure),
  );

  console.log(
    `\nFound ${messagesWithAttachments.length} messages with attachments:`,
  );

  // Process each message with attachments
  for (const message of messagesWithAttachments) {
    console.log(
      `\nMessage #${message.seq} - ${message.envelope?.subject || 'No subject'}`,
    );
    console.log(
      `From: ${message.envelope?.from?.[0]?.mailbox}@${message.envelope?.from?.[0]?.host}`,
    );
    console.log(`Date: ${message.envelope?.date}`);

    // Find attachment details using the findAttachments function
    if (message.bodyStructure) {
      const attachmentInfo = findAttachments(message.bodyStructure);
      console.log('Attachments:');

      for (const attachment of attachmentInfo) {
        console.log(
          `- ${attachment.filename} (${attachment.type}/${attachment.subtype}, ${attachment.size} bytes)`,
        );
        console.log(
          `  Section: ${attachment.section}, Encoding: ${attachment.encoding}`,
        );
      }

      // Process each attachment
      for (const attachment of attachmentInfo) {
        console.log(`\nProcessing attachment "${attachment.filename}"...`);

        try {
          // Fetch the attachment using the client's fetch method with bodyParts
          const fetchResult = await client.fetch(`${message.seq}`, {
            bodyParts: [attachment.section],
          });

          if (
            fetchResult.length > 0 &&
            fetchResult[0].parts &&
            fetchResult[0].parts[attachment.section]
          ) {
            const attachmentData = fetchResult[0].parts[attachment.section];
            console.log(
              `Successfully fetched attachment (${attachmentData.size} bytes)`,
            );
            console.log(`Encoding: ${attachment.encoding}`);

            // Decode the attachment data based on its encoding
            const decodedData = decodeAttachment(
              attachmentData.data as Uint8Array,
              attachment.encoding,
            );

            console.log(`Decoded data size: ${decodedData.length} bytes`);

            // Save the attachment to the attachments folder
            const filePath = join(ATTACHMENTS_FOLDER, attachment.filename);
            await Deno.writeFile(filePath, decodedData);
            console.log(`Saved attachment to: ${filePath}`);

            // For text-based attachments, show a preview
            if (
              attachment.type === 'TEXT' ||
              (attachment.type === 'APPLICATION' &&
                (attachment.subtype === 'JSON' ||
                  attachment.subtype === 'XML' ||
                  attachment.subtype === 'JAVASCRIPT'))
            ) {
              const decoder = new TextDecoder();
              const content = decoder.decode(decodedData);
              console.log('\nPreview of attachment content:');
              console.log(
                content.substring(0, 200) + (content.length > 200 ? '...' : ''),
              );
            } else {
              console.log(
                `Binary attachment of type ${attachment.type}/${attachment.subtype} saved successfully.`,
              );
            }
          } else {
            console.log(
              'Failed to fetch attachment data. The attachment might be empty or inaccessible.',
            );
          }
        } catch (error) {
          console.error(
            'Error fetching attachment:',
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
  }

  // If no messages with attachments were found
  if (messagesWithAttachments.length === 0) {
    console.log('\nNo messages with attachments found in the fetched range.');
    console.log(
      'Try sending yourself an email with an attachment to test this example.',
    );
  }
} catch (error: unknown) {
  console.error(
    'Error:',
    error instanceof Error ? error.message : String(error),
  );
} finally {
  // Always disconnect
  await client.disconnect();
  console.log('Disconnected');
}
