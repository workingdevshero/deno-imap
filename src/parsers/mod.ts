/**
 * IMAP Response Parsers
 *
 * This module contains parsers for IMAP server responses.
 * @module
 */

import { ImapParseError } from "../errors.ts";
import type {
  ImapAddress,
  ImapBodyStructure,
  ImapEnvelope,
  ImapMailbox,
} from "../types/mod.ts";

/**
 * Parses a capability response
 * @param line Capability response line
 * @returns Array of capabilities
 */
export function parseCapabilities(line: string): string[] {
  // Format: * CAPABILITY IMAP4rev1 STARTTLS AUTH=PLAIN ...
  const match = line.match(/^\* CAPABILITY (.+)$/i);

  if (!match) {
    throw new ImapParseError("Invalid capability response", line);
  }

  return match[1].split(" ");
}

/**
 * Parses a list response
 * @param line List response line
 * @returns Mailbox information
 */
export function parseListResponse(line: string): ImapMailbox {
  // Format: * LIST (\HasNoChildren) "/" "INBOX"
  const match = line.match(/^\* LIST \((.*?)\) "(.+?)" (.+)$/i);

  if (!match) {
    throw new ImapParseError("Invalid list response", line);
  }

  const flags = match[1]
    .split(" ")
    .filter(Boolean)
    .map((flag) => {
      // Remove backslashes and quotes
      return flag.replace(/^\\/, "").replace(/^"(.*)"$/, "$1");
    });

  const delimiter = match[2];
  let name = match[3];

  // If name is quoted, remove quotes
  if (name.startsWith('"') && name.endsWith('"')) {
    name = name.substring(1, name.length - 1);
  }

  return {
    name,
    flags,
    delimiter,
  };
}

/**
 * Parses a status response
 * @param line Status response line
 * @returns Mailbox status
 */
export function parseStatus(line: string): Partial<ImapMailbox> {
  // Format: * STATUS "INBOX" (MESSAGES 231 UNSEEN 5 UIDNEXT 44292 UIDVALIDITY 1)
  const match = line.match(/^\* STATUS "?([^"]+)"? \((.*)\)$/i);

  if (!match) {
    throw new ImapParseError("Invalid status response", line);
  }

  const name = match[1];
  const statusItems = match[2].split(" ");
  const result: Partial<ImapMailbox> = { name };

  for (let i = 0; i < statusItems.length; i += 2) {
    const key = statusItems[i].toLowerCase();
    const value = parseInt(statusItems[i + 1], 10);

    switch (key) {
      case "messages":
        result.exists = value;
        break;
      case "recent":
        result.recent = value;
        break;
      case "unseen":
        result.unseen = value;
        break;
      case "uidnext":
        result.uidNext = value;
        break;
      case "uidvalidity":
        result.uidValidity = value;
        break;
    }
  }

  return result;
}

/**
 * Parses a select response
 * @param lines Select response lines
 * @returns Mailbox information
 */
export function parseSelect(lines: string[]): Partial<ImapMailbox> {
  const result: Partial<ImapMailbox> = {};

  for (const line of lines) {
    // EXISTS response
    let match = line.match(/^\* (\d+) EXISTS$/i);
    if (match) {
      result.exists = parseInt(match[1], 10);
      continue;
    }

    // RECENT response
    match = line.match(/^\* (\d+) RECENT$/i);
    if (match) {
      result.recent = parseInt(match[1], 10);
      continue;
    }

    // UNSEEN response - this is the first unseen message number, not the count
    match = line.match(/^\* OK \[UNSEEN (\d+)\]/i);
    if (match) {
      // We'll set this temporarily, but it's not the actual unseen count
      // The actual unseen count should be determined by a STATUS command or a SEARCH for unseen messages
      result.firstUnseen = parseInt(match[1], 10);
      continue;
    }

    // UIDNEXT response
    match = line.match(/^\* OK \[UIDNEXT (\d+)\]/i);
    if (match) {
      result.uidNext = parseInt(match[1], 10);
      continue;
    }

    // UIDVALIDITY response
    match = line.match(/^\* OK \[UIDVALIDITY (\d+)\]/i);
    if (match) {
      result.uidValidity = parseInt(match[1], 10);
      continue;
    }

    // FLAGS response
    match = line.match(/^\* FLAGS \((.*)\)$/i);
    if (match) {
      result.flags = match[1].split(" ").filter(Boolean);
      continue;
    }
  }

  return result;
}

/**
 * Parses a search response
 * @param line Search response line
 * @returns Array of message numbers
 */
export function parseSearch(line: string): number[] {
  // Format: * SEARCH 1 2 3 4 5
  const match = line.match(/^\* SEARCH(.*)$/i);

  if (!match) {
    throw new ImapParseError("Invalid search response", line);
  }

  return match[1]
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((num) => parseInt(num, 10));
}

/**
 * Parses a list of addresses
 * @param data Address list data
 * @returns Array of addresses
 */
function parseAddressList(data: string): ImapAddress[] {
  // Format: ((name adl mailbox host) (name adl mailbox host) ...)
  const addresses: ImapAddress[] = [];

  try {
    // IMAP addresses are in the format: ((name adl mailbox host) (name adl mailbox host) ...)
    // First, let's extract each address group (each enclosed in parentheses)

    // Simple approach for a single address
    if (data.startsWith("((") && data.endsWith("))")) {
      // Extract the inner content
      const innerContent = data.substring(2, data.length - 2);

      // Split by space, but handle quoted strings
      const parts: string[] = [];
      let currentPart = "";
      let inQuote = false;

      for (let i = 0; i < innerContent.length; i++) {
        const char = innerContent[i];

        if (char === '"' && (i === 0 || innerContent[i - 1] !== "\\")) {
          inQuote = !inQuote;
          currentPart += char;
        } else if (char === " " && !inQuote) {
          if (currentPart) {
            parts.push(currentPart);
            currentPart = "";
          }
        } else {
          currentPart += char;
        }
      }

      if (currentPart) {
        parts.push(currentPart);
      }

      // Clean up the parts
      const cleanParts = parts.map((part) => {
        if (part === "NIL") return undefined;
        // Remove surrounding quotes if present
        if (part.startsWith('"') && part.endsWith('"')) {
          return part.substring(1, part.length - 1);
        }
        return part;
      });

      // Create the address object
      if (cleanParts.length >= 4) {
        const address: ImapAddress = {
          name: cleanParts[0],
          sourceRoute: cleanParts[1],
          mailbox: cleanParts[2],
          host: cleanParts[3],
        };

        addresses.push(address);
      }
    } else {
      // Fallback to a more general approach for multiple addresses
      console.warn("Using fallback address parsing for:", data);

      // Extract email parts using a simple heuristic
      const emailMatch = data.match(
        /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
      );
      if (emailMatch) {
        addresses.push({
          mailbox: emailMatch[1],
          host: emailMatch[2],
        });
      }
    }
  } catch (error) {
    console.warn("Error parsing address list:", error);

    // Add a fallback address if parsing fails
    addresses.push({
      name: "Unknown",
      mailbox: "unknown",
      host: "example.com",
    });
  }

  return addresses;
}

/**
 * Parses an envelope response
 * @param data Envelope data
 * @returns Envelope object
 */
export function parseEnvelope(data: string): ImapEnvelope {
  // Format: (date subject (from) (sender) (reply-to) (to) (cc) (bcc) in-reply-to message-id)
  const envelope: ImapEnvelope = {};

  try {
    // Extract the parts between the outer parentheses
    const match = data.match(/^\((.*)\)$/);

    if (!match) {
      throw new ImapParseError("Invalid envelope format", data);
    }

    // Split the envelope data into its components
    // This is a simplified approach - a real implementation would use a proper IMAP parser
    const parts = parseListItems(match[1]);

    if (parts.length >= 10) {
      // Remove quotes from string values
      const cleanString = (str: string): string | undefined => {
        if (str === "NIL") return undefined;
        // Remove surrounding quotes if present
        if (str.startsWith('"') && str.endsWith('"')) {
          return str.substring(1, str.length - 1);
        }
        return str;
      };

      envelope.date = cleanString(parts[0]);
      envelope.subject = cleanString(parts[1]);

      // Parse address lists
      if (parts[2] !== "NIL") envelope.from = parseAddressList(parts[2]);
      if (parts[3] !== "NIL") envelope.sender = parseAddressList(parts[3]);
      if (parts[4] !== "NIL") envelope.replyTo = parseAddressList(parts[4]);
      if (parts[5] !== "NIL") envelope.to = parseAddressList(parts[5]);
      if (parts[6] !== "NIL") envelope.cc = parseAddressList(parts[6]);
      if (parts[7] !== "NIL") envelope.bcc = parseAddressList(parts[7]);

      envelope.inReplyTo = cleanString(parts[8]);
      envelope.messageId = cleanString(parts[9]);
    }
  } catch (error) {
    console.warn("Error parsing envelope:", error);

    // Provide a fallback with basic information
    envelope.subject = "Subject parsing failed";
    envelope.from = [
      {
        name: "Unknown Sender",
        mailbox: "unknown",
        host: "example.com",
      },
    ];
  }

  return envelope;
}

/**
 * Parses a list of items
 * @param data List data
 * @returns Array of items
 */
function parseListItems(data: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote = false;
  let inParentheses = 0;

  for (let i = 0; i < data.length; i++) {
    const char = data[i];

    if (char === '"' && data[i - 1] !== "\\") {
      inQuote = !inQuote;
      current += char;
    } else if (char === "(" && !inQuote) {
      inParentheses++;
      current += char;
    } else if (char === ")" && !inQuote) {
      inParentheses--;
      current += char;
    } else if (char === " " && !inQuote && inParentheses === 0) {
      if (current) {
        result.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) {
    result.push(current);
  }

  return result;
}

/**
 * Parses a body structure response
 * @param data Body structure data
 * @returns Body structure object
 */
export function parseBodyStructure(data: string): ImapBodyStructure {
  // This is a placeholder for a complex parser
  // A real implementation would use a proper IMAP parser

  return {
    type: "text",
    subtype: "plain",
    parameters: {},
    encoding: "7BIT",
    size: 0,
  };
}

/**
 * Parses a fetch response
 * @param lines Fetch response lines
 * @returns Fetch data
 */
export function parseFetch(lines: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  try {
    let currentSection: string | null = null;
    let sectionSize = 0;
    let sectionData: string[] = [];
    let inSection = false;

    // First, extract the sequence number from the first line
    const firstLine = lines[0];
    const seqMatch = firstLine.match(/^\* (\d+) FETCH/i);
    if (seqMatch) {
      result.seq = parseInt(seqMatch[1], 10);
    }

    // Extract other message data from the first line
    if (firstLine.includes("FLAGS")) {
      const flagsMatch = firstLine.match(/FLAGS \(([^)]*)\)/i);
      if (flagsMatch) {
        const flags = flagsMatch[1]
          .split(" ")
          .filter(Boolean)
          .map((flag) => flag.replace(/^\\/, "")); // Remove leading backslash
        result.flags = flags;
      }
    }

    if (firstLine.includes("UID")) {
      const uidMatch = firstLine.match(/UID (\d+)/i);
      if (uidMatch) {
        result.uid = parseInt(uidMatch[1], 10);
      }
    }

    if (firstLine.includes("RFC822.SIZE")) {
      const sizeMatch = firstLine.match(/RFC822\.SIZE (\d+)/i);
      if (sizeMatch) {
        result.size = parseInt(sizeMatch[1], 10);
      }
    }

    if (firstLine.includes("INTERNALDATE")) {
      const dateMatch = firstLine.match(/INTERNALDATE "([^"]+)"/i);
      if (dateMatch) {
        try {
          result.internalDate = new Date(dateMatch[1]);
        } catch (error) {
          console.warn("Failed to parse internal date:", error);
        }
      }
    }

    if (firstLine.includes("ENVELOPE")) {
      const envelopeRegex =
        /ENVELOPE \(([^()]*(?:\([^()]*(?:\([^()]*\)[^()]*)*\)[^()]*)*)\)/i;
      const envelopeMatch = firstLine.match(envelopeRegex);
      if (envelopeMatch) {
        try {
          result.envelope = parseEnvelope(`(${envelopeMatch[1]})`);
        } catch (error) {
          console.warn("Failed to parse envelope:", error);

          // Provide a fallback with basic information
          result.envelope = {
            subject: "Subject parsing failed",
            from: [
              {
                name: "Unknown Sender",
                mailbox: "unknown",
                host: "example.com",
              },
            ],
          };
        }
      }
    }

    if (firstLine.includes("BODYSTRUCTURE")) {
      const bodyRegex =
        /BODYSTRUCTURE \(([^()]*(?:\([^()]*(?:\([^()]*\)[^()]*)*\)[^()]*)*)\)/i;
      const bodyMatch = firstLine.match(bodyRegex);
      if (bodyMatch) {
        try {
          result.bodyStructure = parseBodyStructure(`(${bodyMatch[1]})`);
        } catch (error) {
          console.warn("Failed to parse body structure:", error);
        }
      }
    }

    // Process each line for section data
    for (const line of lines) {
      // If we're collecting section data
      if (inSection) {
        sectionData.push(line);

        // Check if we've collected all the data for this section
        const collectedData = sectionData.join("\r\n");
        if (collectedData.length >= sectionSize) {
          // Process the collected data
          if (currentSection) {
            if (currentSection === "HEADER") {
              // Parse headers
              result.headers = parseHeaders(sectionData);
            } else if (currentSection === "FULL") {
              // Store the full message as raw
              const textData = sectionData.join("\r\n");
              const encoder = new TextEncoder();
              result.raw = encoder.encode(textData);

              // Also try to extract the body
              if (!result.parts) {
                result.parts = {};
              }

              // Simple parsing to extract body from raw message
              const parts = textData.split("\r\n\r\n");
              if (parts.length > 1) {
                // Everything after the first empty line is the body
                const bodyText = parts.slice(1).join("\r\n\r\n");
                const encoder = new TextEncoder();
                (result.parts as Record<string, unknown>)["TEXT"] = {
                  data: encoder.encode(bodyText),
                  size: bodyText.length,
                  type: "text/plain", // Default type
                };
              }
            } else {
              // Store other section data
              if (!result.parts) {
                result.parts = {};
              }

              // Convert the array of strings to a Uint8Array
              const textData = sectionData.join("\r\n");
              const encoder = new TextEncoder();
              (result.parts as Record<string, unknown>)[currentSection] = {
                data: encoder.encode(textData),
                size: textData.length,
                type: "text/plain", // Default type
              };
            }
          }

          // Reset section collection
          inSection = false;
          currentSection = null;
          sectionData = [];
        }

        continue;
      }

      // Parse BODY[...] sections
      const bodyContentMatch = line.match(/BODY\[([^\]]+)\] \{(\d+)\}/i);
      if (bodyContentMatch) {
        currentSection = bodyContentMatch[1];
        sectionSize = parseInt(bodyContentMatch[2], 10);
        inSection = true;
        sectionData = [];
        continue;
      }

      // Handle the case where the body content is on the same line (for small content)
      const inlineBodyMatch = line.match(/BODY\[([^\]]+)\] "([^"]*)"/i);
      if (inlineBodyMatch) {
        const section = inlineBodyMatch[1];
        const content = inlineBodyMatch[2];

        if (section === "HEADER") {
          // Parse headers from inline content
          result.headers = parseHeaders([content]);
        } else {
          // Store other section data
          if (!result.parts) {
            result.parts = {};
          }

          // Convert the string to a Uint8Array
          const encoder = new TextEncoder();
          (result.parts as Record<string, unknown>)[section] = {
            data: encoder.encode(content),
            size: content.length,
            type: "text/plain", // Default type
          };
        }
      }

      // Handle full message content
      const fullBodyMatch = line.match(/BODY\[\] \{(\d+)\}/i);
      if (fullBodyMatch) {
        sectionSize = parseInt(fullBodyMatch[1], 10);
        currentSection = "FULL";
        inSection = true;
        sectionData = [];
        continue;
      }
    }

    // Process any remaining section data
    if (inSection && currentSection && sectionData.length > 0) {
      if (currentSection === "HEADER") {
        // Parse headers
        result.headers = parseHeaders(sectionData);
      } else if (currentSection === "FULL") {
        // Store the full message as raw
        const textData = sectionData.join("\r\n");
        const encoder = new TextEncoder();
        result.raw = encoder.encode(textData);

        // Also try to extract the body
        if (!result.parts) {
          result.parts = {};
        }

        // Simple parsing to extract body from raw message
        const parts = textData.split("\r\n\r\n");
        if (parts.length > 1) {
          // Everything after the first empty line is the body
          const bodyText = parts.slice(1).join("\r\n\r\n");
          const encoder = new TextEncoder();
          (result.parts as Record<string, unknown>)["TEXT"] = {
            data: encoder.encode(bodyText),
            size: bodyText.length,
            type: "text/plain", // Default type
          };
        }
      } else {
        // Store other section data
        if (!result.parts) {
          result.parts = {};
        }

        // Convert the array of strings to a Uint8Array
        const textData = sectionData.join("\r\n");
        const encoder = new TextEncoder();
        (result.parts as Record<string, unknown>)[currentSection] = {
          data: encoder.encode(textData),
          size: textData.length,
          type: "text/plain", // Default type
        };
      }
    }
  } catch (error) {
    console.warn("Error parsing fetch response:", error);
  }

  return result;
}

/**
 * Parse email headers from an array of header lines
 * @param headerLines Array of header lines
 * @returns Object with header names as keys and values as values
 */
function parseHeaders(
  headerLines: string[]
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};

  // Join all lines with proper line breaks
  const headerText = headerLines.join("\r\n");

  // Split into individual header entries
  const headerEntries = headerText.split(/\r\n(?!\s)/);

  for (const entry of headerEntries) {
    if (!entry.trim()) continue;

    // Check if this is a new header or continuation
    const match = entry.match(/^([^:]+):\s*(.*(?:\r\n\s+.*)*)/);
    if (match) {
      const name = match[1].trim();
      const value = match[2].replace(/\r\n\s+/g, " ").trim();

      // Some headers can appear multiple times
      if (headers[name]) {
        if (Array.isArray(headers[name])) {
          (headers[name] as string[]).push(value);
        } else {
          headers[name] = [headers[name] as string, value];
        }
      } else {
        headers[name] = value;
      }
    }
  }

  return headers;
}
