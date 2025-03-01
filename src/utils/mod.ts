/**
 * IMAP Utilities
 * 
 * This module contains utility functions for working with IMAP.
 * @module
 */

import { ImapClient } from "../client.ts";
import { ImapFetchOptions, ImapMessage, ImapSearchCriteria } from "../types/mod.ts";

/**
 * Fetches all messages in a mailbox
 * @param client IMAP client
 * @param mailbox Mailbox name
 * @param options Fetch options
 * @returns Promise that resolves with the messages
 */
export async function fetchAllMessages(
  client: ImapClient,
  mailbox: string,
  options: ImapFetchOptions = { flags: true, envelope: true },
): Promise<ImapMessage[]> {
  // Select the mailbox
  await client.selectMailbox(mailbox);
  
  // Get the mailbox status
  const status = await client.getMailboxStatus(mailbox);
  
  if (!status.exists || status.exists === 0) {
    return [];
  }
  
  // Fetch all messages
  return await client.fetch(`1:${status.exists}`, options);
}

/**
 * Fetches messages matching search criteria
 * @param client IMAP client
 * @param mailbox Mailbox name
 * @param criteria Search criteria
 * @param options Fetch options
 * @returns Promise that resolves with the messages
 */
export async function searchAndFetchMessages(
  client: ImapClient,
  mailbox: string,
  criteria: ImapSearchCriteria,
  options: ImapFetchOptions = { flags: true, envelope: true },
): Promise<ImapMessage[]> {
  // Select the mailbox
  await client.selectMailbox(mailbox);
  
  // Search for messages
  const messageNumbers = await client.search(criteria);
  
  if (messageNumbers.length === 0) {
    return [];
  }
  
  // Fetch the messages
  return await client.fetch(messageNumbers.join(","), options);
}

/**
 * Fetches unread messages
 * @param client IMAP client
 * @param mailbox Mailbox name
 * @param options Fetch options
 * @returns Promise that resolves with the unread messages
 */
export async function fetchUnreadMessages(
  client: ImapClient,
  mailbox: string,
  options: ImapFetchOptions = { flags: true, envelope: true },
): Promise<ImapMessage[]> {
  // First, select the mailbox
  await client.selectMailbox(mailbox);
  
  // Search for unseen messages
  const unseenIds = await client.search({ flags: { has: ["Unseen"] } });
  
  if (unseenIds.length === 0) {
    return [];
  }
  
  // Fetch the messages
  return await client.fetch(unseenIds.join(","), options);
}

/**
 * Fetches messages from a specific sender
 * @param client IMAP client
 * @param mailbox Mailbox name
 * @param sender Sender email address
 * @param options Fetch options
 * @returns Promise that resolves with the messages
 */
export async function fetchMessagesFromSender(
  client: ImapClient,
  mailbox: string,
  sender: string,
  options: ImapFetchOptions = { flags: true, envelope: true },
): Promise<ImapMessage[]> {
  return await searchAndFetchMessages(
    client,
    mailbox,
    { header: [{ field: "FROM", value: sender }] },
    options,
  );
}

/**
 * Fetches messages with a specific subject
 * @param client IMAP client
 * @param mailbox Mailbox name
 * @param subject Subject to search for
 * @param options Fetch options
 * @returns Promise that resolves with the messages
 */
export async function fetchMessagesWithSubject(
  client: ImapClient,
  mailbox: string,
  subject: string,
  options: ImapFetchOptions = { flags: true, envelope: true },
): Promise<ImapMessage[]> {
  return await searchAndFetchMessages(
    client,
    mailbox,
    { header: [{ field: "SUBJECT", value: subject }] },
    options,
  );
}

/**
 * Fetches messages received since a specific date
 * @param client IMAP client
 * @param mailbox Mailbox name
 * @param since Date to search from
 * @param options Fetch options
 * @returns Promise that resolves with the messages
 */
export async function fetchMessagesSince(
  client: ImapClient,
  mailbox: string,
  since: Date,
  options: ImapFetchOptions = { flags: true, envelope: true },
): Promise<ImapMessage[]> {
  return await searchAndFetchMessages(
    client,
    mailbox,
    { date: { internal: { since } } },
    options,
  );
}

/**
 * Fetches messages with attachments
 * @param client IMAP client
 * @param mailbox Mailbox name
 * @param options Fetch options
 * @returns Promise that resolves with the messages
 */
export async function fetchMessagesWithAttachments(
  client: ImapClient,
  mailbox: string,
  options: ImapFetchOptions = { flags: true, envelope: true, bodyStructure: true },
): Promise<ImapMessage[]> {
  // First, fetch all messages with body structure
  const messages = await fetchAllMessages(client, mailbox, {
    ...options,
    bodyStructure: true,
  });
  
  // Filter messages with attachments
  return messages.filter((message) => {
    if (!message.bodyStructure) {
      return false;
    }
    
    // Check if the message has attachments
    // This is a simplified check, a real implementation would be more complex
    return hasAttachments(message.bodyStructure);
  });
}

/**
 * Checks if a body structure has attachments
 * @param bodyStructure Body structure to check
 * @returns Whether the body structure has attachments
 */
function hasAttachments(bodyStructure: any): boolean {
  // This is a placeholder for a complex function
  // A real implementation would check for attachment parts
  return false;
}

/**
 * Marks messages as read
 * @param client IMAP client
 * @param mailbox Mailbox name
 * @param messageIds Message IDs to mark as read
 * @param useUid Whether to use UIDs
 * @returns Promise that resolves when the messages are marked as read
 */
export async function markMessagesAsRead(
  client: ImapClient,
  mailbox: string,
  messageIds: number[],
  useUid = false,
): Promise<void> {
  if (messageIds.length === 0) {
    return;
  }
  
  // Select the mailbox
  await client.selectMailbox(mailbox);
  
  // Set the \Seen flag
  await client.setFlags(messageIds.join(","), ["\\Seen"], "add", useUid);
}

/**
 * Marks messages as unread
 * @param client IMAP client
 * @param mailbox Mailbox name
 * @param messageIds Message IDs to mark as unread
 * @param useUid Whether to use UIDs
 * @returns Promise that resolves when the messages are marked as unread
 */
export async function markMessagesAsUnread(
  client: ImapClient,
  mailbox: string,
  messageIds: number[],
  useUid = false,
): Promise<void> {
  if (messageIds.length === 0) {
    return;
  }
  
  // Select the mailbox
  await client.selectMailbox(mailbox);
  
  // Remove the \Seen flag
  await client.setFlags(messageIds.join(","), ["\\Seen"], "remove", useUid);
}

/**
 * Deletes messages
 * @param client IMAP client
 * @param mailbox Mailbox name
 * @param messageIds Message IDs to delete
 * @param useUid Whether to use UIDs
 * @returns Promise that resolves when the messages are deleted
 */
export async function deleteMessages(
  client: ImapClient,
  mailbox: string,
  messageIds: number[],
  useUid = false,
): Promise<void> {
  if (messageIds.length === 0) {
    return;
  }
  
  // Select the mailbox
  await client.selectMailbox(mailbox);
  
  // Set the \Deleted flag
  await client.setFlags(messageIds.join(","), ["\\Deleted"], "add", useUid);
  
  // Expunge the messages
  await client.expunge();
}

/**
 * Moves messages to another mailbox
 * @param client IMAP client
 * @param sourceMailbox Source mailbox name
 * @param targetMailbox Target mailbox name
 * @param messageIds Message IDs to move
 * @param useUid Whether to use UIDs
 * @returns Promise that resolves when the messages are moved
 */
export async function moveMessages(
  client: ImapClient,
  sourceMailbox: string,
  targetMailbox: string,
  messageIds: number[],
  useUid = false,
): Promise<void> {
  if (messageIds.length === 0) {
    return;
  }
  
  // Select the source mailbox
  await client.selectMailbox(sourceMailbox);
  
  // Move the messages
  await client.moveMessages(messageIds.join(","), targetMailbox, useUid);
}

/**
 * Creates a mailbox hierarchy
 * @param client IMAP client
 * @param path Mailbox path
 * @param delimiter Delimiter to use
 * @returns Promise that resolves when the mailbox hierarchy is created
 */
export async function createMailboxHierarchy(
  client: ImapClient,
  path: string,
  delimiter = "/",
): Promise<void> {
  const parts = path.split(delimiter);
  let currentPath = "";
  
  for (const part of parts) {
    if (currentPath) {
      currentPath += delimiter;
    }
    
    currentPath += part;
    
    try {
      await client.createMailbox(currentPath);
    } catch (error: unknown) {
      // Ignore errors if the mailbox already exists
      if (error instanceof Error && !error.message.includes("ALREADYEXISTS")) {
        throw error;
      }
    }
  }
}

/**
 * Gets all mailboxes in a hierarchy
 * @param client IMAP client
 * @param reference Reference name (usually empty string)
 * @param pattern Mailbox name pattern
 * @returns Promise that resolves with the mailboxes
 */
export async function getMailboxHierarchy(
  client: ImapClient,
  reference = "",
  pattern = "*",
): Promise<Map<string, string[]>> {
  const mailboxes = await client.listMailboxes(reference, pattern);
  const hierarchy = new Map<string, string[]>();
  
  for (const mailbox of mailboxes) {
    const parts = mailbox.name.split(mailbox.delimiter);
    let parent = "";
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (parent) {
        parent += mailbox.delimiter;
      }
      
      parent += parts[i];
    }
    
    if (!hierarchy.has(parent)) {
      hierarchy.set(parent, []);
    }
    
    hierarchy.get(parent)?.push(mailbox.name);
  }
  
  return hierarchy;
} 