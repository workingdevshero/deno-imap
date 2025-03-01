/**
 * deno_imap - A modern IMAP client for Deno
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