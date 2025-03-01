/**
 * IMAP Response Parsers
 * 
 * This module contains parsers for IMAP server responses.
 * @module
 */

import { ImapParseError } from "../errors.ts";
import { ImapAddress, ImapBodyStructure, ImapEnvelope, ImapMailbox } from "../types/mod.ts";

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
  
  const flags = match[1].split(" ").filter(Boolean).map((flag) => {
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
    
    // UNSEEN response
    match = line.match(/^\* OK \[UNSEEN (\d+)\]/i);
    if (match) {
      result.unseen = parseInt(match[1], 10);
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
    if (data.startsWith('((') && data.endsWith('))')) {
      // Extract the inner content
      const innerContent = data.substring(2, data.length - 2);
      
      // Split by space, but handle quoted strings
      const parts: string[] = [];
      let currentPart = '';
      let inQuote = false;
      
      for (let i = 0; i < innerContent.length; i++) {
        const char = innerContent[i];
        
        if (char === '"' && (i === 0 || innerContent[i - 1] !== '\\')) {
          inQuote = !inQuote;
          currentPart += char;
        } else if (char === ' ' && !inQuote) {
          if (currentPart) {
            parts.push(currentPart);
            currentPart = '';
          }
        } else {
          currentPart += char;
        }
      }
      
      if (currentPart) {
        parts.push(currentPart);
      }
      
      // Clean up the parts
      const cleanParts = parts.map(part => {
        if (part === 'NIL') return undefined;
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
          host: cleanParts[3]
        };
        
        addresses.push(address);
      }
    } else {
      // Fallback to a more general approach for multiple addresses
      console.warn("Using fallback address parsing for:", data);
      
      // Extract email parts using a simple heuristic
      const emailMatch = data.match(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        addresses.push({
          mailbox: emailMatch[1],
          host: emailMatch[2]
        });
      }
    }
  } catch (error) {
    console.warn("Error parsing address list:", error);
    
    // Add a fallback address if parsing fails
    addresses.push({
      name: "Unknown",
      mailbox: "unknown",
      host: "example.com"
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
    envelope.from = [{
      name: "Unknown Sender",
      mailbox: "unknown",
      host: "example.com"
    }];
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
  // This is a simplified parser for demonstration
  // A real implementation would use a proper IMAP parser
  
  const result: Record<string, unknown> = {};
  
  try {
    for (const line of lines) {
      // Extract the message data between parentheses
      // Format: * 1 FETCH (FLAGS (\Seen) UID 100 ...)
      const match = line.match(/^\* (\d+) FETCH \((.*)\)$/i);
      if (!match) continue;
      
      // Store the sequence number
      result.seq = parseInt(match[1], 10);
      
      const fetchData = match[2];
      
      // Parse FLAGS
      const flagsMatch = fetchData.match(/FLAGS \(([^)]*)\)/i);
      if (flagsMatch) {
        const flags = flagsMatch[1].split(" ")
          .filter(Boolean)
          .map(flag => flag.replace(/^\\/, "")); // Remove leading backslash
        result.flags = flags;
      }
      
      // Parse UID
      const uidMatch = fetchData.match(/UID (\d+)/i);
      if (uidMatch) {
        result.uid = parseInt(uidMatch[1], 10);
      }
      
      // Parse RFC822.SIZE
      const sizeMatch = fetchData.match(/RFC822\.SIZE (\d+)/i);
      if (sizeMatch) {
        result.size = parseInt(sizeMatch[1], 10);
      }
      
      // Parse INTERNALDATE
      const dateMatch = fetchData.match(/INTERNALDATE "([^"]+)"/i);
      if (dateMatch) {
        try {
          result.internalDate = new Date(dateMatch[1]);
        } catch (error) {
          console.warn("Failed to parse internal date:", error);
        }
      }
      
      // Parse ENVELOPE
      // Use a more robust regex that can handle nested parentheses
      const envelopeRegex = /ENVELOPE \(([^()]*(?:\([^()]*(?:\([^()]*\)[^()]*)*\)[^()]*)*)\)/i;
      const envelopeMatch = fetchData.match(envelopeRegex);
      if (envelopeMatch) {
        try {
          result.envelope = parseEnvelope(`(${envelopeMatch[1]})`);
        } catch (error) {
          console.warn("Failed to parse envelope:", error);
          
          // Provide a fallback with basic information
          result.envelope = {
            subject: "Subject parsing failed",
            from: [{
              name: "Unknown Sender",
              mailbox: "unknown",
              host: "example.com"
            }]
          };
        }
      }
      
      // Parse BODY or BODYSTRUCTURE
      const bodyRegex = /BODY(?:STRUCTURE)? \(([^()]*(?:\([^()]*(?:\([^()]*\)[^()]*)*\)[^()]*)*)\)/i;
      const bodyMatch = fetchData.match(bodyRegex);
      if (bodyMatch) {
        try {
          result.bodyStructure = parseBodyStructure(`(${bodyMatch[1]})`);
        } catch (error) {
          console.warn("Failed to parse body structure:", error);
        }
      }
      
      // Parse BODY[...]
      const bodyContentMatch = fetchData.match(/BODY\[([^\]]+)\] \{(\d+)\}/i);
      if (bodyContentMatch) {
        const section = bodyContentMatch[1];
        result[`body[${section}]`] = ""; // Content would be in the next line(s)
      }
    }
  } catch (error) {
    console.warn("Error parsing fetch response:", error);
  }
  
  return result;
} 