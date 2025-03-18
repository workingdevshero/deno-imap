/**
 * Tests for the IMAP commands module
 */

import { assertEquals } from '@std/assert';
import * as commands from '../src/commands/mod.ts';

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

// Test APPEND command
Deno.test('append command formats correctly with ASCII message', () => {
  const result = commands.append('INBOX', 'Hello, World!');
  assertEquals(result, 'APPEND INBOX {13}');
});

Deno.test('append command correctly calculates length for UTF-8 characters', () => {
  // Test with various multi-byte UTF-8 characters:
  // - '🌟' (star emoji) is 4 bytes
  // - '中' (Chinese character) is 3 bytes
  // - 'é' (Latin e with acute) is 2 bytes
  // - 'a' (ASCII) is 1 byte
  // Total: 10 bytes
  const result = commands.append('INBOX', '🌟中éa');
  assertEquals(result, 'APPEND INBOX {10}');
});

Deno.test('append command formats correctly with flags and date', () => {
  const date = new Date('2024-03-13T12:00:00Z');
  const message = '🌟 Important message'; // '🌟' is 4 bytes
  const result = commands.append('INBOX', message, ['\\Seen', '\\Flagged'], date);
  // 4 bytes for 🌟 + 18 bytes for " Important message" = 22 bytes total
  assertEquals(result.startsWith('APPEND INBOX (\\Seen \\Flagged) "13-Mar-2024 '), true);
  assertEquals(result.endsWith('" {22}'), true);
});
