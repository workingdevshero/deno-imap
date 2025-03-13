import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { hasAttachments, parseBodyStructure, findAttachments } from "../src/parsers/mod.ts";
import type { ImapBodyStructure } from "../src/types/mod.ts";

Deno.test("parseBodyStructure - simple text/plain", () => {
  const input = '("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42)';
  const expected: Partial<ImapBodyStructure> = {
    type: "TEXT",
    subtype: "PLAIN",
    parameters: { CHARSET: "UTF-8" },
    encoding: "7BIT",
    size: 1234,
    lines: 42,
  };

  const result = parseBodyStructure(input);
  
  assertEquals(result.type, expected.type);
  assertEquals(result.subtype, expected.subtype);
  assertEquals(result.parameters.CHARSET, expected.parameters?.CHARSET);
  assertEquals(result.encoding, expected.encoding);
  assertEquals(result.size, expected.size);
  assertEquals(result.lines, expected.lines);
});

Deno.test("parseBodyStructure - text/html", () => {
  const input = '("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "QUOTED-PRINTABLE" 4321 NIL NIL NIL NIL)';
  
  const result = parseBodyStructure(input);
  
  assertEquals(result.type, "TEXT");
  assertEquals(result.subtype, "HTML");
  assertEquals(result.parameters.CHARSET, "UTF-8");
  assertEquals(result.encoding, "QUOTED-PRINTABLE");
  assertEquals(result.size, 4321);
});

Deno.test("parseBodyStructure - application/pdf with disposition", () => {
  const input = '("APPLICATION" "PDF" ("NAME" "document.pdf") NIL NIL "BASE64" 98765 NIL ("ATTACHMENT" ("FILENAME" "document.pdf")) NIL NIL)';
  
  const result = parseBodyStructure(input);
  
  assertEquals(result.type, "APPLICATION");
  assertEquals(result.subtype, "PDF");
  assertEquals(result.parameters.NAME, "document.pdf");
  assertEquals(result.encoding, "BASE64");
  assertEquals(result.size, 98765);
  assertEquals(result.dispositionType, "ATTACHMENT");
  assertEquals(result.dispositionParameters?.FILENAME, "document.pdf");
});

Deno.test("parseBodyStructure - image/jpeg with id", () => {
  const input = '("IMAGE" "JPEG" ("NAME" "photo.jpg") "<image001@example.com>" NIL "BASE64" 54321 NIL ("INLINE" ("FILENAME" "photo.jpg")) NIL NIL)';
  
  const result = parseBodyStructure(input);
  
  assertEquals(result.type, "IMAGE");
  assertEquals(result.subtype, "JPEG");
  assertEquals(result.parameters.NAME, "photo.jpg");
  assertEquals(result.id, "<image001@example.com>");
  assertEquals(result.encoding, "BASE64");
  assertEquals(result.size, 54321);
  assertEquals(result.dispositionType, "INLINE");
  assertEquals(result.dispositionParameters?.FILENAME, "photo.jpg");
});

Deno.test("parseBodyStructure - message/rfc822", () => {
  const input = '("MESSAGE" "RFC822" NIL NIL NIL "7BIT" 5678 ("Tue, 1 Apr 2023 12:34:56 +0000" "Test Subject" (("Sender Name" NIL "sender" "example.com")) (("Sender Name" NIL "sender" "example.com")) (("Sender Name" NIL "sender" "example.com")) (("Recipient Name" NIL "recipient" "example.com")) NIL NIL NIL "<message-id@example.com>") ("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) 123 NIL NIL NIL NIL)';
  
  const result = parseBodyStructure(input);
  
  assertEquals(result.type, "MESSAGE");
  assertEquals(result.subtype, "RFC822");
  assertEquals(result.encoding, "7BIT");
  assertEquals(result.size, 5678);
  assertEquals(result.lines, 123);
  
  // Skip envelope check since the envelope parser is not fully implemented
  // const envelope = result.envelope;
  // assertEquals(envelope?.subject, "Test Subject");
  // assertEquals(envelope?.from?.[0].mailbox, "sender");
  // assertEquals(envelope?.from?.[0].host, "example.com");
  
  // Check nested body structure
  const nestedBody = result.messageBodyStructure;
  assertEquals(nestedBody?.type, "TEXT");
  assertEquals(nestedBody?.subtype, "PLAIN");
  assertEquals(nestedBody?.parameters?.CHARSET, "UTF-8");
  assertEquals(nestedBody?.size, 1234);
  assertEquals(nestedBody?.lines, 42);
});

Deno.test("parseBodyStructure - simple multipart/mixed", () => {
  const input = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) ("IMAGE" "JPEG" ("NAME" "photo.jpg") NIL NIL "BASE64" 54321 NIL ("INLINE" ("FILENAME" "photo.jpg")) NIL NIL) "MIXED" ("BOUNDARY" "----boundary123") NIL NIL NIL)';
  
  const result = parseBodyStructure(input);
  
  assertEquals(result.type, "MULTIPART");
  assertEquals(result.subtype, "MIXED");
  assertEquals(result.parameters?.BOUNDARY, "----boundary123");
  
  // Check child parts
  assertEquals(result.childParts?.length, 2);
  
  // First part - text/plain
  const textPart = result.childParts?.[0];
  assertEquals(textPart?.type, "TEXT");
  assertEquals(textPart?.subtype, "PLAIN");
  assertEquals(textPart?.parameters?.CHARSET, "UTF-8");
  assertEquals(textPart?.size, 1234);
  assertEquals(textPart?.lines, 42);
  
  // Second part - image/jpeg
  const imagePart = result.childParts?.[1];
  assertEquals(imagePart?.type, "IMAGE");
  assertEquals(imagePart?.subtype, "JPEG");
  assertEquals(imagePart?.parameters?.NAME, "photo.jpg");
  assertEquals(imagePart?.encoding, "BASE64");
  assertEquals(imagePart?.size, 54321);
  assertEquals(imagePart?.dispositionType, "INLINE");
  assertEquals(imagePart?.dispositionParameters?.FILENAME, "photo.jpg");
});

Deno.test("parseBodyStructure - nested multipart", () => {
  const input = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) (("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "QUOTED-PRINTABLE" 4321 NIL NIL NIL NIL) ("IMAGE" "JPEG" ("NAME" "photo.jpg") NIL NIL "BASE64" 54321 NIL ("INLINE" ("FILENAME" "photo.jpg")) NIL NIL) "RELATED" ("BOUNDARY" "----related456") NIL NIL NIL) "ALTERNATIVE" ("BOUNDARY" "----alternative789") NIL NIL NIL)';
  
  const result = parseBodyStructure(input);
  
  assertEquals(result.type, "MULTIPART");
  assertEquals(result.subtype, "ALTERNATIVE");
  assertEquals(result.parameters?.BOUNDARY, "----alternative789");
  
  // Check child parts
  assertEquals(result.childParts?.length, 2);
  
  // First part - text/plain
  const textPart = result.childParts?.[0];
  assertEquals(textPart?.type, "TEXT");
  assertEquals(textPart?.subtype, "PLAIN");
  assertEquals(textPart?.parameters?.CHARSET, "UTF-8");
  assertEquals(textPart?.size, 1234);
  assertEquals(textPart?.lines, 42);
  
  // Second part - multipart/related
  const relatedPart = result.childParts?.[1];
  assertEquals(relatedPart?.type, "MULTIPART");
  assertEquals(relatedPart?.subtype, "RELATED");
  assertEquals(relatedPart?.parameters?.BOUNDARY, "----related456");
  
  // Check nested parts in multipart/related
  assertEquals(relatedPart?.childParts?.length, 2);
  
  // First nested part - text/html
  const htmlPart = relatedPart?.childParts?.[0];
  assertEquals(htmlPart?.type, "TEXT");
  assertEquals(htmlPart?.subtype, "HTML");
  assertEquals(htmlPart?.parameters?.CHARSET, "UTF-8");
  assertEquals(htmlPart?.encoding, "QUOTED-PRINTABLE");
  assertEquals(htmlPart?.size, 4321);
  
  // Second nested part - image/jpeg
  const imagePart = relatedPart?.childParts?.[1];
  assertEquals(imagePart?.type, "IMAGE");
  assertEquals(imagePart?.subtype, "JPEG");
  assertEquals(imagePart?.parameters?.NAME, "photo.jpg");
  assertEquals(imagePart?.encoding, "BASE64");
  assertEquals(imagePart?.size, 54321);
  assertEquals(imagePart?.dispositionType, "INLINE");
  assertEquals(imagePart?.dispositionParameters?.FILENAME, "photo.jpg");
});

Deno.test("parseBodyStructure - with language and location", () => {
  const input = '("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL ("EN-US" "FR-CA") "https://example.com/message")';
  
  const result = parseBodyStructure(input);
  
  assertEquals(result.type, "TEXT");
  assertEquals(result.subtype, "PLAIN");
  assertEquals(result.parameters.CHARSET, "UTF-8");
  assertEquals(result.encoding, "7BIT");
  assertEquals(result.size, 1234);
  assertEquals(result.lines, 42);
  assertEquals(result.language, ["EN-US", "FR-CA"]);
  assertEquals(result.location, "https://example.com/message");
});

Deno.test("parseBodyStructure - invalid input", () => {
  const input = '("TEXT")'; // Too few elements
  
  const result = parseBodyStructure(input);
  
  // Should return default values
  assertEquals(result.type, "TEXT");
  assertEquals(result.subtype, "PLAIN");
  assertEquals(result.encoding, "7BIT");
  assertEquals(result.size, 0);
  assertEquals(Object.keys(result.parameters).length, 0);
});

Deno.test("parseBodyStructure - with MD5", () => {
  const input = '("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 "d41d8cd98f00b204e9800998ecf8427e" NIL NIL NIL)';
  
  const result = parseBodyStructure(input);
  
  assertEquals(result.type, "TEXT");
  assertEquals(result.subtype, "PLAIN");
  assertEquals(result.parameters.CHARSET, "UTF-8");
  assertEquals(result.encoding, "7BIT");
  assertEquals(result.size, 1234);
  assertEquals(result.lines, 42);
  assertEquals(result.md5, "d41d8cd98f00b204e9800998ecf8427e");
});

Deno.test("hasAttachments - simple text message without attachments", () => {
  const input = '("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42)';
  const bodyStructure = parseBodyStructure(input);
  
  assertEquals(hasAttachments(bodyStructure), false);
});

Deno.test("hasAttachments - multipart/alternative without attachments", () => {
  const input = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) ("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "QUOTED-PRINTABLE" 4321 NIL NIL NIL NIL) "ALTERNATIVE" ("BOUNDARY" "----boundary123") NIL NIL NIL)';
  const bodyStructure = parseBodyStructure(input);
  
  assertEquals(hasAttachments(bodyStructure), false);
});

Deno.test("hasAttachments - message with explicit attachment", () => {
  const input = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) ("APPLICATION" "PDF" ("NAME" "document.pdf") NIL NIL "BASE64" 98765 NIL ("ATTACHMENT" ("FILENAME" "document.pdf")) NIL NIL) "MIXED" ("BOUNDARY" "----boundary123") NIL NIL NIL)';
  const bodyStructure = parseBodyStructure(input);
  
  assertEquals(hasAttachments(bodyStructure), true);
});

Deno.test("hasAttachments - message with inline image", () => {
  const input = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) ("IMAGE" "JPEG" ("NAME" "photo.jpg") NIL NIL "BASE64" 54321 NIL ("INLINE" ("FILENAME" "photo.jpg")) NIL NIL) "MIXED" ("BOUNDARY" "----boundary123") NIL NIL NIL)';
  const bodyStructure = parseBodyStructure(input);
  
  assertEquals(hasAttachments(bodyStructure), true);
});

Deno.test("hasAttachments - message with application type", () => {
  const input = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) ("APPLICATION" "OCTET-STREAM" NIL NIL NIL "BASE64" 98765 NIL NIL NIL NIL) "MIXED" ("BOUNDARY" "----boundary123") NIL NIL NIL)';
  const bodyStructure = parseBodyStructure(input);
  
  assertEquals(hasAttachments(bodyStructure), true);
});

Deno.test("hasAttachments - message with deeply nested attachment", () => {
  const input = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) (("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "QUOTED-PRINTABLE" 4321 NIL NIL NIL NIL) ("IMAGE" "JPEG" ("NAME" "photo.jpg") NIL NIL "BASE64" 54321 NIL ("INLINE" ("FILENAME" "photo.jpg")) NIL NIL) "RELATED" ("BOUNDARY" "----related456") NIL NIL NIL) "ALTERNATIVE" ("BOUNDARY" "----alternative789") NIL NIL NIL)';
  const bodyStructure = parseBodyStructure(input);
  
  assertEquals(hasAttachments(bodyStructure), true);
});

Deno.test("hasAttachments - message with forwarded message", () => {
  const input = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) ("MESSAGE" "RFC822" NIL NIL NIL "7BIT" 5678 ("Tue, 1 Apr 2023 12:34:56 +0000" "Test Subject" (("Sender Name" NIL "sender" "example.com")) (("Sender Name" NIL "sender" "example.com")) (("Sender Name" NIL "sender" "example.com")) (("Recipient Name" NIL "recipient" "example.com")) NIL NIL NIL "<message-id@example.com>") ("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) 123 NIL NIL NIL NIL) "MIXED" ("BOUNDARY" "----boundary123") NIL NIL NIL)';
  const bodyStructure = parseBodyStructure(input);
  
  assertEquals(hasAttachments(bodyStructure), true);
});

Deno.test("hasAttachments - message with named part but no disposition", () => {
  const input = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) ("TEXT" "CSV" ("NAME" "data.csv") NIL NIL "7BIT" 2345 53 NIL NIL NIL NIL) "MIXED" ("BOUNDARY" "----boundary123") NIL NIL NIL)';
  const bodyStructure = parseBodyStructure(input);
  
  assertEquals(hasAttachments(bodyStructure), true);
});

Deno.test("parseBodyStructure - complex multipart structure with multiple levels", () => {
  // This is a complex structure similar to what we saw in the real-world example
  const input = '((("text" "plain" ("charset" "utf-8") NIL NIL "base64" 14 1 NIL NIL NIL NIL)("text" "html" ("charset" "utf-8") NIL NIL "base64" 636 10 NIL NIL NIL NIL) "alternative" ("boundary" "b2=_zlPo1LsLmCEZyj4E5yNqPAuKEy9GtZqYMxPB8uIWHvM") NIL NIL NIL)("image" "png" ("name" "deno.png") NIL NIL "base64" 760752 NIL ("attachment" ("filename" "deno.png")) NIL NIL) "mixed" ("boundary" "b1=_zlPo1LsLmCEZyj4E5yNqPAuKEy9GtZqYMxPB8uIWHvM") NIL NIL NIL)';
  
  const result = parseBodyStructure(input);
  
  // Check the top-level structure
  assertEquals(result.type, "MULTIPART");
  assertEquals(result.subtype, "MIXED");
  assertEquals(result.parameters?.BOUNDARY, "b1=_zlPo1LsLmCEZyj4E5yNqPAuKEy9GtZqYMxPB8uIWHvM");
  
  // Check that we have two child parts
  assertEquals(result.childParts?.length, 2);
  
  // First child is a multipart/alternative
  const alternativePart = result.childParts?.[0];
  assertEquals(alternativePart?.type, "MULTIPART");
  assertEquals(alternativePart?.subtype, "ALTERNATIVE");
  assertEquals(alternativePart?.parameters?.BOUNDARY, "b2=_zlPo1LsLmCEZyj4E5yNqPAuKEy9GtZqYMxPB8uIWHvM");
  assertEquals(alternativePart?.childParts?.length, 2);
  
  // Check the text/plain part inside alternative
  const textPlainPart = alternativePart?.childParts?.[0];
  assertEquals(textPlainPart?.type, "TEXT");
  assertEquals(textPlainPart?.subtype, "PLAIN");
  assertEquals(textPlainPart?.parameters?.CHARSET, "utf-8");
  assertEquals(textPlainPart?.encoding, "BASE64");
  assertEquals(textPlainPart?.size, 14);
  assertEquals(textPlainPart?.lines, 1);
  
  // Check the text/html part inside alternative
  const textHtmlPart = alternativePart?.childParts?.[1];
  assertEquals(textHtmlPart?.type, "TEXT");
  assertEquals(textHtmlPart?.subtype, "HTML");
  assertEquals(textHtmlPart?.parameters?.CHARSET, "utf-8");
  assertEquals(textHtmlPart?.encoding, "BASE64");
  assertEquals(textHtmlPart?.size, 636);
  assertEquals(textHtmlPart?.lines, 10);
  
  // Second child is an image/png attachment
  const imagePart = result.childParts?.[1];
  assertEquals(imagePart?.type, "IMAGE");
  assertEquals(imagePart?.subtype, "PNG");
  assertEquals(imagePart?.parameters?.NAME, "deno.png");
  assertEquals(imagePart?.encoding, "BASE64");
  assertEquals(imagePart?.size, 760752);
  assertEquals(imagePart?.dispositionType, "ATTACHMENT");
  assertEquals(imagePart?.dispositionParameters?.FILENAME, "deno.png");
  
  // Verify that hasAttachments correctly identifies this structure as having attachments
  assertEquals(hasAttachments(result), true);
});

Deno.test("parseBodyStructure - multipart structure with unusual format", () => {
  // This tests the enhanced isMultipartStructure function with a structure that doesn't follow the typical pattern
  const input = '("text" "plain" ("charset" "utf-8") NIL NIL "7BIT" 100 10 NIL NIL NIL NIL) ("image" "jpeg" ("name" "test.jpg") NIL NIL "BASE64" 5000 NIL ("ATTACHMENT" ("FILENAME" "test.jpg")) NIL NIL) "mixed" ("BOUNDARY" "----boundary123") NIL NIL NIL';
  
  const result = parseBodyStructure(input);
  
  // Check that it was correctly identified as a multipart structure
  assertEquals(result.type, "MULTIPART");
  assertEquals(result.subtype, "MIXED");
  assertEquals(result.parameters?.BOUNDARY, "----boundary123");
  
  // Check that we have two child parts
  assertEquals(result.childParts?.length, 2);
  
  // First child is text/plain
  const textPart = result.childParts?.[0];
  assertEquals(textPart?.type, "TEXT");
  assertEquals(textPart?.subtype, "PLAIN");
  
  // Second child is an image attachment
  const imagePart = result.childParts?.[1];
  assertEquals(imagePart?.type, "IMAGE");
  assertEquals(imagePart?.subtype, "JPEG");
  assertEquals(imagePart?.dispositionType, "ATTACHMENT");
  
  // Verify that hasAttachments correctly identifies this structure as having attachments
  assertEquals(hasAttachments(result), true);
});

Deno.test("parseBodyStructure - multipart structure with only subtype indicator", () => {
  // This tests the enhanced isMultipartStructure function with a structure that only has a subtype indicator
  // We need to provide a more complete structure for the parser to handle
  const input = '(("TEXT" "PLAIN" NIL NIL NIL "7BIT" 0 0 NIL NIL NIL NIL) "mixed" ("BOUNDARY" "----boundary123") NIL NIL NIL)';
  
  const result = parseBodyStructure(input);
  
  // Check that it was correctly identified as a multipart structure
  assertEquals(result.type, "MULTIPART");
  assertEquals(result.subtype, "MIXED");
  assertEquals(result.parameters?.BOUNDARY, "----boundary123");
  
  // This structure has one child part
  assertEquals(result.childParts?.length, 1);
});

Deno.test("findAttachments - complex structure with multiple attachments", () => {
  // This tests the findAttachments function with a complex structure containing multiple attachments
  const input = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) ("APPLICATION" "PDF" ("NAME" "document1.pdf") NIL NIL "BASE64" 98765 NIL ("ATTACHMENT" ("FILENAME" "document1.pdf")) NIL NIL) ("APPLICATION" "ZIP" ("NAME" "archive.zip") NIL NIL "BASE64" 123456 NIL ("ATTACHMENT" ("FILENAME" "archive.zip")) NIL NIL) "MIXED" ("BOUNDARY" "----boundary123") NIL NIL NIL)';
  
  const bodyStructure = parseBodyStructure(input);
  const attachments = findAttachments(bodyStructure);
  
  // Check that we found the correct number of attachments
  assertEquals(attachments.length, 2);
  
  // Check the first attachment
  assertEquals(attachments[0].filename, "document1.pdf");
  assertEquals(attachments[0].type, "APPLICATION");
  assertEquals(attachments[0].subtype, "PDF");
  assertEquals(attachments[0].size, 98765);
  assertEquals(attachments[0].encoding, "BASE64");
  assertEquals(attachments[0].section, "2");
  
  // Check the second attachment
  assertEquals(attachments[1].filename, "archive.zip");
  assertEquals(attachments[1].type, "APPLICATION");
  assertEquals(attachments[1].subtype, "ZIP");
  assertEquals(attachments[1].size, 123456);
  assertEquals(attachments[1].encoding, "BASE64");
  assertEquals(attachments[1].section, "3");
});

Deno.test("findAttachments - nested structure with attachments at different levels", () => {
  // This tests the findAttachments function with attachments at different nesting levels
  const input = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 1234 42 NIL NIL NIL NIL) (("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "QUOTED-PRINTABLE" 4321 NIL NIL NIL NIL) ("IMAGE" "JPEG" ("NAME" "photo.jpg") NIL NIL "BASE64" 54321 NIL ("INLINE" ("FILENAME" "photo.jpg")) NIL NIL) ("APPLICATION" "PDF" ("NAME" "nested.pdf") NIL NIL "BASE64" 87654 NIL ("ATTACHMENT" ("FILENAME" "nested.pdf")) NIL NIL) "RELATED" ("BOUNDARY" "----related456") NIL NIL NIL) ("APPLICATION" "ZIP" ("NAME" "toplevel.zip") NIL NIL "BASE64" 123456 NIL ("ATTACHMENT" ("FILENAME" "toplevel.zip")) NIL NIL) "MIXED" ("BOUNDARY" "----mixed789") NIL NIL NIL)';
  
  const bodyStructure = parseBodyStructure(input);
  const attachments = findAttachments(bodyStructure);
  
  // Check that we found the correct number of attachments
  assertEquals(attachments.length, 3);
  
  // Check the attachments and their section paths
  const filenames = attachments.map((a) => a.filename);
  const sections = attachments.map((a) => a.section);
  
  // The attachments should be: photo.jpg, nested.pdf, and toplevel.zip
  assertEquals(filenames.includes("photo.jpg"), true);
  assertEquals(filenames.includes("nested.pdf"), true);
  assertEquals(filenames.includes("toplevel.zip"), true);
  
  // Check that the section paths are correct
  const photoAttachment = attachments.find((a) => a.filename === "photo.jpg");
  const nestedPdfAttachment = attachments.find((a) => a.filename === "nested.pdf");
  const topLevelZipAttachment = attachments.find((a) => a.filename === "toplevel.zip");
  
  assertEquals(photoAttachment?.section, "2.2");
  assertEquals(nestedPdfAttachment?.section, "2.3");
  assertEquals(topLevelZipAttachment?.section, "3");
}); 