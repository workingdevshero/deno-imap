/**
 * Simple test for the IMAP client commands
 */

import { assertEquals } from "@std/assert";
import * as commands from "../src/commands/mod.ts";

Deno.test("list command formats correctly with empty reference", () => {
  const result = commands.list("", "*");
  assertEquals(result, 'LIST "" *');
});

Deno.test("list command formats correctly with non-empty reference", () => {
  const result = commands.list("INBOX", "*");
  assertEquals(result, 'LIST INBOX *');
});

Deno.test("search command formats flags correctly", () => {
  const result = commands.search({ flags: { has: ["\\Unseen"] } });
  assertEquals(result, 'SEARCH UNSEEN');
}); 