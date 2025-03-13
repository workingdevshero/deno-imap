/**
 * Tests for the IMAP commands module
 */

import { assertEquals } from '@std/assert';
import * as commands from '../src/commands/mod.ts';
import { ImapSearchCriteria } from '../src/types/mod.ts';

// Test LIST command
Deno.test('list command formats correctly with empty reference', () => {
  const result = commands.list('', '*');
  assertEquals(result, 'LIST "" *');
});

Deno.test('list command formats correctly with non-empty reference', () => {
  const result = commands.list('INBOX', '*');
  assertEquals(result, 'LIST INBOX *');
});

Deno.test('list command quotes mailbox with spaces', () => {
  const result = commands.list('', 'Sent Items');
  assertEquals(result, 'LIST "" "Sent Items"');
});

// Test SELECT command
Deno.test('select command formats correctly', () => {
  const result = commands.select('INBOX');
  assertEquals(result, 'SELECT INBOX');
});

Deno.test('select command quotes mailbox with spaces', () => {
  const result = commands.select('Sent Items');
  assertEquals(result, 'SELECT "Sent Items"');
});

// Test SEARCH command
Deno.test('search command formats flags correctly', () => {
  const result = commands.search({ flags: { has: ['\\Unseen'] } });
  assertEquals(result, 'SEARCH UNSEEN');
});

Deno.test('search command formats multiple flags correctly', () => {
  const result = commands.search({
    flags: {
      has: ['\\Unseen', '\\Flagged'],
      not: ['\\Deleted'],
    },
  });
  assertEquals(result, 'SEARCH UNSEEN FLAGGED NOT DELETED');
});

Deno.test('search command formats date criteria correctly', () => {
  const date = new Date('2023-01-15');
  const result = commands.search({
    date: {
      internal: { since: date },
    },
  });

  // The exact format might vary depending on timezone, so we'll just check for the basic structure
  const hasCorrectFormat = result.startsWith('SEARCH SINCE ');
  assertEquals(hasCorrectFormat, true);
});

// Test FETCH command
Deno.test('fetch command formats basic options correctly', () => {
  const result = commands.fetch('1:10', { envelope: true, flags: true });
  assertEquals(result, 'FETCH 1:10 (FLAGS ENVELOPE)');
});

Deno.test('fetch command formats UID fetch correctly', () => {
  const result = commands.fetch('1:10', { envelope: true, flags: true, byUid: true });
  assertEquals(result, 'UID FETCH 1:10 (FLAGS ENVELOPE)');
});

Deno.test('fetch command formats headers correctly', () => {
  const result = commands.fetch('1', { headers: ['Subject', 'From'] });
  assertEquals(result, 'FETCH 1 (BODY.PEEK[HEADER.FIELDS (Subject From)])');
});

// Test STORE command
Deno.test('store command formats flag setting correctly', () => {
  const result = commands.store('1:5', ['\\Seen'], 'set');
  assertEquals(result, 'STORE 1:5 FLAGS (\\Seen)');
});

Deno.test('store command formats flag adding correctly', () => {
  const result = commands.store('1:5', ['\\Seen'], 'add');
  assertEquals(result, 'STORE 1:5 +FLAGS (\\Seen)');
});

Deno.test('store command formats flag removing correctly', () => {
  const result = commands.store('1:5', ['\\Seen'], 'remove');
  assertEquals(result, 'STORE 1:5 -FLAGS (\\Seen)');
});

// Test other commands
Deno.test('login command formats correctly', () => {
  const result = commands.login('user@example.com', 'password');
  assertEquals(result, 'LOGIN user@example.com password');
});

Deno.test('create command formats correctly', () => {
  const result = commands.create('New Folder');
  assertEquals(result, 'CREATE "New Folder"');
});

Deno.test('delete command formats correctly', () => {
  const result = commands.deleteMailbox('Old Folder');
  assertEquals(result, 'DELETE "Old Folder"');
});

Deno.test('copy command formats correctly', () => {
  const result = commands.copy('1:5', 'Archive');
  assertEquals(result, 'COPY 1:5 Archive');
});

Deno.test('move command formats correctly', () => {
  const result = commands.move('1:5', 'Archive');
  assertEquals(result, 'MOVE 1:5 Archive');
});
