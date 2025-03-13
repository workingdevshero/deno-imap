/**
 * IMAP Commands
 *
 * This module contains functions for generating IMAP commands.
 * @module
 */

import type { ImapFetchOptions, ImapSearchCriteria } from '../types/mod.ts';

/**
 * Generates a LOGIN command
 * @param username Username
 * @param password Password
 * @returns LOGIN command string
 */
export function login(username: string, password: string): string {
  return `LOGIN ${quoteString(username)} ${quoteString(password)}`;
}

/**
 * Generates a CAPABILITY command
 * @returns CAPABILITY command string
 */
export function capability(): string {
  return 'CAPABILITY';
}

/**
 * Generates a NOOP command
 * @returns NOOP command string
 */
export function noop(): string {
  return 'NOOP';
}

/**
 * Generates a LOGOUT command
 * @returns LOGOUT command string
 */
export function logout(): string {
  return 'LOGOUT';
}

/**
 * Generates a LIST command
 * @param reference Reference name (usually empty string)
 * @param mailbox Mailbox name pattern
 * @returns LIST command string
 */
export function list(reference: string, mailbox: string): string {
  // Always quote the reference parameter, especially when it's empty
  const quotedReference = reference === '' ? '""' : quoteString(reference);
  return `LIST ${quotedReference} ${quoteString(mailbox)}`;
}

/**
 * Generates a SELECT command
 * @param mailbox Mailbox name
 * @returns SELECT command string
 */
export function select(mailbox: string): string {
  return `SELECT ${quoteString(mailbox)}`;
}

/**
 * Generates an EXAMINE command
 * @param mailbox Mailbox name
 * @returns EXAMINE command string
 */
export function examine(mailbox: string): string {
  return `EXAMINE ${quoteString(mailbox)}`;
}

/**
 * Generates a CREATE command
 * @param mailbox Mailbox name
 * @returns CREATE command string
 */
export function create(mailbox: string): string {
  return `CREATE ${quoteString(mailbox)}`;
}

/**
 * Generates a DELETE command
 * @param mailbox Mailbox name
 * @returns DELETE command string
 */
export function deleteMailbox(mailbox: string): string {
  return `DELETE ${quoteString(mailbox)}`;
}

/**
 * Generates a RENAME command
 * @param oldName Old mailbox name
 * @param newName New mailbox name
 * @returns RENAME command string
 */
export function rename(oldName: string, newName: string): string {
  return `RENAME ${quoteString(oldName)} ${quoteString(newName)}`;
}

/**
 * Generates a SUBSCRIBE command
 * @param mailbox Mailbox name
 * @returns SUBSCRIBE command string
 */
export function subscribe(mailbox: string): string {
  return `SUBSCRIBE ${quoteString(mailbox)}`;
}

/**
 * Generates an UNSUBSCRIBE command
 * @param mailbox Mailbox name
 * @returns UNSUBSCRIBE command string
 */
export function unsubscribe(mailbox: string): string {
  return `UNSUBSCRIBE ${quoteString(mailbox)}`;
}

/**
 * Generates a STATUS command
 * @param mailbox Mailbox name
 * @param items Status items to request
 * @returns STATUS command string
 */
export function status(mailbox: string, items: string[]): string {
  return `STATUS ${quoteString(mailbox)} (${items.join(' ')})`;
}

/**
 * Generates an APPEND command
 * @param mailbox Mailbox name
 * @param message Message content
 * @param flags Message flags
 * @param date Message date
 * @returns APPEND command string
 */
export function append(
  mailbox: string,
  message: string,
  flags?: string[],
  date?: Date,
): string {
  let command = `APPEND ${quoteString(mailbox)}`;

  if (flags && flags.length > 0) {
    command += ` (${flags.join(' ')})`;
  }

  if (date) {
    command += ` ${formatDate(date)}`;
  }

  command += ` {${message.length}}`;

  return command;
}

/**
 * Generates a CHECK command
 * @returns CHECK command string
 */
export function check(): string {
  return 'CHECK';
}

/**
 * Generates a CLOSE command
 * @returns CLOSE command string
 */
export function close(): string {
  return 'CLOSE';
}

/**
 * Generates an EXPUNGE command
 * @returns EXPUNGE command string
 */
export function expunge(): string {
  return 'EXPUNGE';
}

/**
 * Generates a SEARCH command
 * @param criteria Search criteria
 * @param charset Character set
 * @returns SEARCH command string
 */
export function search(criteria: ImapSearchCriteria, charset?: string): string {
  let command = 'SEARCH';

  if (charset) {
    command += ` CHARSET ${charset}`;
  }

  const formattedCriteria = formatSearchCriteria(criteria);

  // If no criteria were provided, use ALL as the default
  if (!formattedCriteria) {
    command += ' ALL';
  } else {
    command += ` ${formattedCriteria}`;
  }

  return command;
}

/**
 * Generates a FETCH command
 * @param sequence Message sequence set
 * @param options Fetch options
 * @returns FETCH command string
 */
export function fetch(sequence: string, options: ImapFetchOptions): string {
  const command = options.byUid ? 'UID FETCH' : 'FETCH';
  const items: string[] = [];

  if (options.flags) {
    items.push('FLAGS');
  }

  if (options.envelope) {
    items.push('ENVELOPE');
  }

  if (options.bodyStructure) {
    items.push('BODYSTRUCTURE');
  }

  if (options.internalDate) {
    items.push('INTERNALDATE');
  }

  if (options.size) {
    items.push('RFC822.SIZE');
  }

  if (options.uid) {
    items.push('UID');
  }

  if (options.allHeaders) {
    items.push('BODY.PEEK[HEADER]');
  } else if (options.headers && options.headers.length > 0) {
    items.push(`BODY.PEEK[HEADER.FIELDS (${options.headers.join(' ')})]`);
  }

  if (options.bodyParts && options.bodyParts.length > 0) {
    for (const part of options.bodyParts) {
      items.push(`BODY${options.markSeen ? '' : '.PEEK'}[${part}]`);
    }
  }

  if (options.full) {
    items.push(`BODY${options.markSeen ? '' : '.PEEK'}[]`);
  }

  return `${command} ${sequence} (${items.join(' ')})`;
}

/**
 * Generates a STORE command
 * @param sequence Message sequence set
 * @param flags Flags to set
 * @param action Action to perform
 * @param useUid Whether to use UIDs
 * @returns STORE command string
 */
export function store(
  sequence: string,
  flags: string[],
  action: 'set' | 'add' | 'remove',
  useUid = false,
): string {
  const command = useUid ? 'UID STORE' : 'STORE';
  let flagAction: string;

  switch (action) {
    case 'set':
      flagAction = 'FLAGS';
      break;
    case 'add':
      flagAction = '+FLAGS';
      break;
    case 'remove':
      flagAction = '-FLAGS';
      break;
  }

  return `${command} ${sequence} ${flagAction} (${flags.join(' ')})`;
}

/**
 * Generates a COPY command
 * @param sequence Message sequence set
 * @param mailbox Destination mailbox
 * @param useUid Whether to use UIDs
 * @returns COPY command string
 */
export function copy(
  sequence: string,
  mailbox: string,
  useUid = false,
): string {
  const command = useUid ? 'UID COPY' : 'COPY';
  return `${command} ${sequence} ${quoteString(mailbox)}`;
}

/**
 * Generates a MOVE command
 * @param sequence Message sequence set
 * @param mailbox Destination mailbox
 * @param useUid Whether to use UIDs
 * @returns MOVE command string
 */
export function move(
  sequence: string,
  mailbox: string,
  useUid = false,
): string {
  const command = useUid ? 'UID MOVE' : 'MOVE';
  return `${command} ${sequence} ${quoteString(mailbox)}`;
}

/**
 * Formats a date for IMAP
 * @param date Date to format
 * @returns Formatted date string
 */
function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const offset = Math.abs(date.getTimezoneOffset());
  const offsetHours = Math.floor(offset / 60)
    .toString()
    .padStart(2, '0');
  const offsetMinutes = (offset % 60).toString().padStart(2, '0');
  const offsetSign = date.getTimezoneOffset() > 0 ? '-' : '+';

  return `"${day}-${month}-${year} ${hours}:${minutes}:${seconds} ${offsetSign}${offsetHours}${offsetMinutes}"`;
}

/**
 * Formats search criteria for IMAP SEARCH command
 * @param criteria Search criteria
 * @returns Formatted search criteria string
 */
function formatSearchCriteria(criteria: ImapSearchCriteria): string {
  const parts: string[] = [];

  if (criteria.seqno !== undefined) {
    if (Array.isArray(criteria.seqno)) {
      parts.push(criteria.seqno.join(','));
    } else {
      parts.push(criteria.seqno.toString());
    }
  }

  if (criteria.uid !== undefined) {
    if (Array.isArray(criteria.uid)) {
      parts.push(`UID ${criteria.uid.join(',')}`);
    } else {
      parts.push(`UID ${criteria.uid}`);
    }
  }

  if (criteria.flags) {
    if (criteria.flags.has) {
      for (const flag of criteria.flags.has) {
        // Convert flag names like \Unseen to UNSEEN for the SEARCH command
        const flagName = flag.replace(/^\\/, '').toUpperCase();
        parts.push(flagName);
      }
    }

    if (criteria.flags.not) {
      for (const flag of criteria.flags.not) {
        // Convert flag names like \Unseen to UNSEEN for the SEARCH command
        const flagName = flag.replace(/^\\/, '').toUpperCase();
        parts.push(`NOT ${flagName}`);
      }
    }
  }

  if (criteria.date) {
    if (criteria.date.internal) {
      if (criteria.date.internal.since) {
        parts.push(`SINCE ${formatDateShort(criteria.date.internal.since)}`);
      }

      if (criteria.date.internal.before) {
        parts.push(`BEFORE ${formatDateShort(criteria.date.internal.before)}`);
      }

      if (criteria.date.internal.on) {
        parts.push(`ON ${formatDateShort(criteria.date.internal.on)}`);
      }
    }

    if (criteria.date.sent) {
      if (criteria.date.sent.since) {
        parts.push(`SENTSINCE ${formatDateShort(criteria.date.sent.since)}`);
      }

      if (criteria.date.sent.before) {
        parts.push(`SENTBEFORE ${formatDateShort(criteria.date.sent.before)}`);
      }

      if (criteria.date.sent.on) {
        parts.push(`SENTON ${formatDateShort(criteria.date.sent.on)}`);
      }
    }
  }

  if (criteria.size) {
    if (criteria.size.larger !== undefined) {
      parts.push(`LARGER ${criteria.size.larger}`);
    }

    if (criteria.size.smaller !== undefined) {
      parts.push(`SMALLER ${criteria.size.smaller}`);
    }
  }

  if (criteria.header) {
    for (const header of criteria.header) {
      parts.push(
        `HEADER ${quoteString(header.field)} ${quoteString(header.value)}`,
      );
    }
  }

  if (criteria.body !== undefined) {
    parts.push(`BODY ${quoteString(criteria.body)}`);
  }

  if (criteria.text !== undefined) {
    parts.push(`TEXT ${quoteString(criteria.text)}`);
  }

  if (criteria.and && criteria.and.length > 0) {
    const andParts = criteria.and.map((c) => formatSearchCriteria(c));
    parts.push(`(${andParts.join(' ')})`);
  }

  if (criteria.or && criteria.or.length > 0) {
    const orParts = criteria.or.map((c) => formatSearchCriteria(c));
    parts.push(`OR ${orParts[0]} ${orParts[1]}`);
  }

  if (criteria.not) {
    parts.push(`NOT (${formatSearchCriteria(criteria.not)})`);
  }

  return parts.join(' ');
}

/**
 * Formats a date for IMAP search
 * @param date Date to format
 * @returns Formatted date string
 */
function formatDateShort(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][date.getMonth()];
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
}

/**
 * Quotes a string for IMAP
 * @param str String to quote
 * @returns Quoted string
 */
function quoteString(str: string): string {
  // If the string contains special characters, quote it
  if (/[\r\n\t\\\"\(\)\{\}\[\] ]/.test(str)) {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  return str;
}
