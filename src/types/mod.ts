/**
 * Type definitions for the IMAP client
 * @module
 */

/**
 * Options for configuring the IMAP client
 */
export interface ImapOptions extends ImapConnectionOptions {
  /** Whether to automatically connect on client creation */
  autoConnect?: boolean;
  /** Whether to automatically reconnect on connection loss */
  autoReconnect?: boolean;
  /** Maximum number of reconnection attempts */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts in milliseconds */
  reconnectDelay?: number;
  /** Timeout for commands in milliseconds */
  commandTimeout?: number;
}

/**
 * Options for configuring the IMAP connection
 */
export interface ImapConnectionOptions {
  /** IMAP server hostname */
  host: string;
  /** IMAP server port */
  port: number;
  /** Whether to use TLS */
  tls: boolean;
  /** Username for authentication */
  username: string;
  /** Password for authentication */
  password: string;
  /** Authentication mechanism to use */
  authMechanism?: ImapAuthMechanism;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Socket timeout in milliseconds */
  socketTimeout?: number;
  /** TLS options */
  tlsOptions?: Deno.ConnectTlsOptions;
}

/**
 * Authentication mechanisms supported by the IMAP client
 */
export type ImapAuthMechanism = 'PLAIN' | 'LOGIN' | 'OAUTH2' | 'XOAUTH2';

/**
 * Represents an IMAP mailbox (folder)
 */
export interface ImapMailbox {
  /** Name of the mailbox */
  name: string;
  /** Flags for the mailbox */
  flags: string[];
  /** Delimiter used in the mailbox hierarchy */
  delimiter: string;
  /** Number of messages in the mailbox */
  exists?: number;
  /** Number of recent messages */
  recent?: number;
  /** Number of unseen messages */
  unseen?: number;
  /** Next UID to be assigned */
  uidNext?: number;
  /** UID validity value */
  uidValidity?: number;
}

/**
 * Represents an IMAP message
 */
export interface ImapMessage {
  /** Message sequence number */
  seq: number;
  /** Message UID */
  uid?: number;
  /** Message flags */
  flags?: string[];
  /** Message size in bytes */
  size?: number;
  /** Message internal date */
  internalDate?: Date;
  /** Message envelope information */
  envelope?: ImapEnvelope;
  /** Message body structure */
  bodyStructure?: ImapBodyStructure;
  /** Message headers */
  headers?: Record<string, string | string[]>;
  /** Message body parts */
  parts?: Record<string, ImapMessagePart>;
  /** Raw message content */
  raw?: Uint8Array;
}

/**
 * Represents a part of an IMAP message
 */
export interface ImapMessagePart {
  /** Part data */
  data: Uint8Array;
  /** Part size */
  size: number;
  /** Part content type */
  type?: string;
  /** Part encoding */
  encoding?: string;
}

/**
 * Represents an IMAP message envelope
 */
export interface ImapEnvelope {
  /** Message date */
  date?: string;
  /** Message subject */
  subject?: string;
  /** Message from addresses */
  from?: ImapAddress[];
  /** Message sender addresses */
  sender?: ImapAddress[];
  /** Message reply-to addresses */
  replyTo?: ImapAddress[];
  /** Message to addresses */
  to?: ImapAddress[];
  /** Message cc addresses */
  cc?: ImapAddress[];
  /** Message bcc addresses */
  bcc?: ImapAddress[];
  /** Message in-reply-to header */
  inReplyTo?: string;
  /** Message ID */
  messageId?: string;
}

/**
 * Represents an email address in IMAP
 */
export interface ImapAddress {
  /** Name part of the address */
  name?: string;
  /** Source route of the address (usually null) */
  sourceRoute?: string | null;
  /** Mailbox part of the address */
  mailbox?: string;
  /** Host part of the address */
  host?: string;
}

/**
 * Represents the structure of a message body in IMAP
 */
export interface ImapBodyStructure {
  /** Part type */
  type: string;
  /** Part subtype */
  subtype: string;
  /** Part parameters */
  parameters: Record<string, string>;
  /** Part ID */
  id?: string;
  /** Part description */
  description?: string;
  /** Part encoding */
  encoding: string;
  /** Part size */
  size: number;
  /** For multipart, the nested parts */
  childParts?: ImapBodyStructure[];
  /** For text parts, the number of lines */
  lines?: number;
  /** For message/rfc822 parts, the envelope */
  envelope?: ImapEnvelope;
  /** For message/rfc822 parts, the body structure */
  messageBodyStructure?: ImapBodyStructure;
  /** MD5 hash of the body */
  md5?: string;
  /** Disposition type */
  dispositionType?: string;
  /** Disposition parameters */
  dispositionParameters?: Record<string, string>;
  /** Content language */
  language?: string | string[];
  /** Content location */
  location?: string;
}

/**
 * Search criteria for IMAP searches
 */
export interface ImapSearchCriteria {
  /** Search for messages with specific sequence numbers */
  seqno?: number | number[];
  /** Search for messages with specific UIDs */
  uid?: number | number[];
  /** Search for messages with specific flags */
  flags?: {
    /** Search for messages with the specified flag set */
    has?: string[];
    /** Search for messages without the specified flag */
    not?: string[];
  };
  /** Search for messages within a date range */
  date?: {
    /** Search by internal date */
    internal?: {
      since?: Date;
      before?: Date;
      on?: Date;
    };
    /** Search by sent date */
    sent?: {
      since?: Date;
      before?: Date;
      on?: Date;
    };
  };
  /** Search by message size */
  size?: {
    /** Messages larger than this size in bytes */
    larger?: number;
    /** Messages smaller than this size in bytes */
    smaller?: number;
  };
  /** Search in message headers */
  header?: {
    /** Header field name */
    field: string;
    /** Text to search for in the header field */
    value: string;
  }[];
  /** Search for text in the message body */
  body?: string;
  /** Search for text in the message */
  text?: string;
  /** Search for messages that match all criteria */
  and?: ImapSearchCriteria[];
  /** Search for messages that match any criteria */
  or?: ImapSearchCriteria[];
  /** Search for messages that don't match the criteria */
  not?: ImapSearchCriteria;
}

/**
 * Options for fetching messages
 */
export interface ImapFetchOptions {
  /** Whether to use UIDs instead of sequence numbers */
  byUid?: boolean;
  /** Fetch message envelope */
  envelope?: boolean;
  /** Fetch message body structure */
  bodyStructure?: boolean;
  /** Fetch message flags */
  flags?: boolean;
  /** Fetch message internal date */
  internalDate?: boolean;
  /** Fetch message size */
  size?: boolean;
  /** Fetch message UID */
  uid?: boolean;
  /** Fetch specific headers */
  headers?: string[];
  /** Fetch all headers */
  allHeaders?: boolean;
  /** Fetch specific body parts */
  bodyParts?: string[];
  /** Fetch the entire message */
  full?: boolean;
  /** Mark messages as seen when fetching */
  markSeen?: boolean;
}

/**
 * IMAP server capabilities
 */
export type ImapCapability =
  | 'IMAP4'
  | 'IMAP4REV1'
  | 'AUTH=PLAIN'
  | 'AUTH=LOGIN'
  | 'AUTH=OAUTH'
  | 'AUTH=OAUTH2'
  | 'AUTH=XOAUTH2'
  | 'STARTTLS'
  | 'LOGINDISABLED'
  | 'IDLE'
  | 'NAMESPACE'
  | 'ID'
  | 'CHILDREN'
  | 'UIDPLUS'
  | 'MOVE'
  | 'CONDSTORE'
  | 'ESEARCH'
  | 'UTF8=ACCEPT'
  | 'UTF8=ONLY'
  | 'LITERAL+'
  | 'LITERAL-'
  | 'BINARY'
  | 'UNSELECT'
  | 'SASL-IR'
  | 'ENABLE'
  | 'QUOTA'
  | 'SORT'
  | 'THREAD'
  | 'MULTIAPPEND'
  | 'CATENATE'
  | 'URLAUTH'
  | 'UIDONLY'
  | 'WITHIN'
  | 'CONTEXT=SEARCH'
  | 'CONTEXT=SORT'
  | 'FUZZY'
  | 'ESORT'
  | 'COMPRESS=DEFLATE'
  | 'METADATA'
  | 'METADATA-SERVER'
  | 'NOTIFY'
  | 'LIST-EXTENDED'
  | 'LIST-STATUS'
  | 'SPECIAL-USE'
  | string; 