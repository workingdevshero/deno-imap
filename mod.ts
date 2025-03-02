/**
 * @workingdevshero/deno-imap - A heroic IMAP client for Deno
 * 
 * This module provides a complete implementation of the IMAP protocol
 * (Internet Message Access Protocol) for Deno, allowing developers to
 * interact with email servers that support IMAP.
 * 
 * @module
 */

export { ImapClient } from "./src/client.ts";
export { ImapConnection } from "./src/connection.ts";
export { ImapError, ImapAuthError, ImapCommandError } from "./src/errors.ts";

// Export utility functions
export {
  fetchAllMessages,
  searchAndFetchMessages,
  fetchUnreadMessages,
  fetchMessagesFromSender,
  fetchMessagesWithSubject,
  fetchMessagesSince,
  fetchMessagesWithAttachments,
  markMessagesAsRead,
  markMessagesAsUnread,
  deleteMessages,
  moveMessages,
  createMailboxHierarchy,
  getMailboxHierarchy,
} from "./src/utils/mod.ts";

// Re-export types
export type {
  ImapOptions,
  ImapConnectionOptions,
  ImapAuthMechanism,
  ImapMailbox,
  ImapMessage,
  ImapMessagePart,
  ImapSearchCriteria,
  ImapFetchOptions,
  ImapCapability,
} from "./src/types/mod.ts"; 