/**
 * @workingdevshero/deno-imap - A heroic IMAP client for Deno
 *
 * This module provides a complete implementation of the IMAP protocol
 * (Internet Message Access Protocol) for Deno, allowing developers to
 * interact with email servers that support IMAP.
 *
 * @module
 */

export { ImapClient } from './src/client.ts';
export { ImapConnection } from './src/connection.ts';
export { ImapAuthError, ImapCommandError, ImapError } from './src/errors.ts';

// Export parsers
export {
  findAttachments,
  hasAttachments,
  parseBodyStructure,
  parseCapabilities,
  parseEnvelope,
  parseFetch,
  parseListResponse,
  parseSearch,
  parseSelect,
  parseStatus,
} from './src/parsers/mod.ts';

// Export utility functions
export {
  createMailboxHierarchy,
  decodeAttachment,
  deleteMessages,
  fetchAllMessages,
  fetchMessagesFromSender,
  fetchMessagesSince,
  fetchMessagesWithAttachments,
  fetchMessagesWithSubject,
  fetchUnreadMessages,
  getMailboxHierarchy,
  markMessagesAsRead,
  markMessagesAsUnread,
  moveMessages,
  searchAndFetchMessages,
} from './src/utils/mod.ts';

// Re-export types
export type {
  ImapAuthMechanism,
  ImapCapability,
  ImapConnectionOptions,
  ImapFetchOptions,
  ImapMailbox,
  ImapMessage,
  ImapMessagePart,
  ImapOptions,
  ImapSearchCriteria,
} from './src/types/mod.ts';
