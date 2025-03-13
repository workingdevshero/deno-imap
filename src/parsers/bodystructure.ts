/**
 * IMAP BODYSTRUCTURE Parser
 * 
 * This module provides an improved parser for IMAP BODYSTRUCTURE responses,
 * with better handling of complex multipart structures and attachments.
 */

import type { ImapBodyStructure } from "../types/mod.ts";
import { ImapParseError } from "../errors.ts";

/**
 * Parses a body structure response
 * @param data Body structure data
 * @returns Body structure object
 */
export function parseBodyStructure(data: string): ImapBodyStructure {
  try {
    // Remove outer parentheses if present
    if (data.startsWith("(") && data.endsWith(")")) {
      data = data.substring(1, data.length - 1);
    }

    // Check if this is a multipart structure
    if (isMultipartStructure(data)) {
      return parseMultipartStructure(data);
    }

    // Parse as a simple part
    return parseSimplePart(data);
  } catch (error) {
    console.warn("Error parsing body structure:", error);
    
    // Return a default body structure if parsing fails
    return {
      type: "TEXT",
      subtype: "PLAIN",
      parameters: {},
      encoding: "7BIT",
      size: 0,
    };
  }
}

/**
 * Determines if a body structure string represents a multipart structure
 */
function isMultipartStructure(data: string): boolean {
  // Multipart structures start with a nested part (parenthesis)
  // and typically contain a subtype like "mixed" or "alternative"
  
  // Check if this is a multipart structure by looking for common patterns
  
  // Pattern 1: Starts with a nested part and contains a multipart subtype
  const hasMultipartSubtype = 
    data.includes('"mixed"') || 
    data.includes('"alternative"') || 
    data.includes('"related"') || 
    data.includes('"digest"') || 
    data.includes('"report"') || 
    data.includes('"signed"') || 
    data.includes('"encrypted"');
  
  // Pattern 2: Starts with a nested part (parenthesis)
  const startsWithNestedPart = 
    (data.startsWith("(") && !data.startsWith("((")) ||
    (data.startsWith("((") && hasMultipartSubtype);
  
  // Pattern 3: Contains multiple parts separated by space and ends with a subtype
  const hasMultipleParts = /^\([^)]+\)\s+\([^)]+\).*"[^"]+"/i.test(data);
  
  return startsWithNestedPart || hasMultipleParts || hasMultipartSubtype;
}

/**
 * Parses a multipart body structure
 */
function parseMultipartStructure(data: string): ImapBodyStructure {
  // Find all child parts
  const parts: string[] = [];
  let currentPart = "";
  let depth = 0;
  let i = 0;

  // Extract all child parts (each enclosed in parentheses)
  while (i < data.length) {
    const char = data[i];

    if (char === "(" && (i === 0 || data[i - 1] !== "\\")) {
      depth++;
      currentPart += char;
    } else if (char === ")" && (i === 0 || data[i - 1] !== "\\")) {
      depth--;
      currentPart += char;

      if (depth === 0) {
        parts.push(currentPart);
        currentPart = "";
        
        // Skip whitespace
        i++;
        while (i < data.length && data[i] === " ") i++;
        
        // If we're at a quote, this is likely the multipart subtype
        if (i < data.length && data[i] === '"') {
          break;
        }
        
        continue;
      }
    } else {
      currentPart += char;
    }
    i++;
  }

  // Extract subtype and parameters from the remaining data
  let subtype = "MIXED"; // Default subtype
  const parameters: Record<string, string> = {};
  
  // Extract the remaining data after the parts
  const remainingData = data.substring(i);
  
  // Extract the subtype (should be in quotes)
  const subtypeMatch = remainingData.match(/"([^"]+)"/);
  if (subtypeMatch) {
    subtype = subtypeMatch[1].toUpperCase();
    
    // Look for parameters after the subtype
    const paramsMatch = remainingData.substring(remainingData.indexOf(subtypeMatch[0]) + subtypeMatch[0].length).match(/\(([^)]*)\)/);
    if (paramsMatch) {
      try {
        const paramParts = parseListItems(paramsMatch[1]);
        for (let i = 0; i < paramParts.length; i += 2) {
          if (i + 1 < paramParts.length) {
            const key = parseStringValue(paramParts[i]) || "";
            const value = parseStringValue(paramParts[i + 1]) || "";
            if (key) {
              parameters[key.toUpperCase()] = value;
            }
          }
        }
      } catch (error) {
        console.warn("Error parsing multipart parameters:", error);
      }
    }
  }
  
  // Create the multipart body structure
  const bodyStructure: ImapBodyStructure = {
    type: "MULTIPART",
    subtype: subtype,
    parameters: parameters,
    encoding: "7BIT", // Default encoding for multipart
    size: 0, // Size is the sum of all parts
    childParts: [],
  };
  
  // Try to extract disposition, language, and location from the remaining data
  const dispositionMatch = remainingData.match(/\("([^"]+)"([^)]*)\)/);
  if (dispositionMatch && 
      (dispositionMatch[1].toUpperCase() === "ATTACHMENT" || 
       dispositionMatch[1].toUpperCase() === "INLINE")) {
    bodyStructure.dispositionType = dispositionMatch[1].toUpperCase();
    
    // Try to extract disposition parameters
    if (dispositionMatch[2]) {
      const dispParamsMatch = dispositionMatch[2].match(/\(([^)]*)\)/);
      if (dispParamsMatch) {
        try {
          const dispParams: Record<string, string> = {};
          const paramParts = parseListItems(dispParamsMatch[1]);
          for (let i = 0; i < paramParts.length; i += 2) {
            if (i + 1 < paramParts.length) {
              const key = parseStringValue(paramParts[i]) || "";
              const value = parseStringValue(paramParts[i + 1]) || "";
              if (key) {
                dispParams[key.toUpperCase()] = value;
              }
            }
          }
          bodyStructure.dispositionParameters = dispParams;
        } catch (error) {
          console.warn("Error parsing multipart disposition parameters:", error);
        }
      }
    }
  }
  
  // Parse each child part
  for (const part of parts) {
    try {
      const childPart = parseBodyStructure(part);
      bodyStructure.childParts!.push(childPart);
      
      // Add to the total size
      bodyStructure.size += childPart.size;
    } catch (error) {
      console.warn("Error parsing child part:", error);
    }
  }
  
  return bodyStructure;
}

/**
 * Parses a simple (non-multipart) body part
 */
function parseSimplePart(data: string): ImapBodyStructure {
  // Parse the body structure parts
  const parts = parseListItems(data);

  // Basic validation
  if (parts.length < 7) {
    throw new ImapParseError("Invalid body structure format", data);
  }

  // Extract the basic fields
  const type = parseStringValue(parts[0]);
  const subtype = parseStringValue(parts[1]);
  const parameters = parseParameterList(parts[2]);
  const id = parseStringValue(parts[3]);
  const description = parseStringValue(parts[4]);
  const encoding = parseStringValue(parts[5]);
  const size = parseInt(parts[6], 10);

  // Create the body structure object
  const bodyStructure: ImapBodyStructure = {
    type: type?.toUpperCase() || "TEXT",
    subtype: subtype?.toUpperCase() || "PLAIN",
    parameters: parameters || {},
    encoding: encoding?.toUpperCase() || "7BIT",
    size: isNaN(size) ? 0 : size,
  };

  // Add optional fields if present
  if (id) bodyStructure.id = id;
  if (description) bodyStructure.description = description;

  // For text parts, the next field is the number of lines
  if (type?.toUpperCase() === "TEXT" && parts.length > 7) {
    const lines = parseInt(parts[7], 10);
    if (!isNaN(lines)) bodyStructure.lines = lines;
  }

  // For message/rfc822 parts, the next fields are envelope, body structure, and lines
  if (type?.toUpperCase() === "MESSAGE" && subtype?.toUpperCase() === "RFC822" && parts.length > 10) {
    try {
      // Parse envelope
      if (parts[7] !== "NIL") {
        // We'll need to import the envelope parser for this
        // bodyStructure.envelope = parseEnvelope(parts[7]);
      }

      // Parse nested body structure
      if (parts[8] !== "NIL") {
        bodyStructure.messageBodyStructure = parseBodyStructure(parts[8]);
      }

      // Parse lines
      const lines = parseInt(parts[9], 10);
      if (!isNaN(lines)) bodyStructure.lines = lines;
    } catch (error) {
      console.warn("Error parsing message/rfc822 body structure:", error);
    }
  }

  // Parse extension data if present (MD5, disposition, language, location)
  let extensionIndex = type?.toUpperCase() === "TEXT" ? 8 : 
                       (type?.toUpperCase() === "MESSAGE" && subtype?.toUpperCase() === "RFC822") ? 10 : 7;

  if (parts.length > extensionIndex) {
    // MD5
    if (parts[extensionIndex] !== "NIL") {
      bodyStructure.md5 = parseStringValue(parts[extensionIndex]);
    }
    extensionIndex++;

    // Disposition
    if (parts.length > extensionIndex && parts[extensionIndex] !== "NIL") {
      try {
        const dispositionParts = parseListItems(parts[extensionIndex].replace(/^\(|\)$/g, ""));
        if (dispositionParts.length >= 1) {
          bodyStructure.dispositionType = parseStringValue(dispositionParts[0])?.toUpperCase();
          
          if (dispositionParts.length >= 2) {
            bodyStructure.dispositionParameters = parseParameterList(dispositionParts[1]);
          }
        }
      } catch (error) {
        console.warn("Error parsing disposition:", error);
      }
    }
    extensionIndex++;

    // Language
    if (parts.length > extensionIndex && parts[extensionIndex] !== "NIL") {
      try {
        if (parts[extensionIndex].startsWith("(")) {
          // List of languages
          const languageParts = parseListItems(parts[extensionIndex].replace(/^\(|\)$/g, ""));
          bodyStructure.language = languageParts.map(parseStringValue).filter(Boolean) as string[];
        } else {
          // Single language
          bodyStructure.language = parseStringValue(parts[extensionIndex]) || undefined;
        }
      } catch (error) {
        console.warn("Error parsing language:", error);
      }
    }
    extensionIndex++;

    // Location
    if (parts.length > extensionIndex && parts[extensionIndex] !== "NIL") {
      bodyStructure.location = parseStringValue(parts[extensionIndex]);
    }
  }

  return bodyStructure;
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
 * Parses a parameter list
 * @param data Parameter list data
 * @returns Parameter object
 */
function parseParameterList(data: string): Record<string, string> {
  const parameters: Record<string, string> = {};

  if (data === "NIL" || !data) {
    return parameters;
  }

  try {
    // Remove outer parentheses if present
    if (data.startsWith("(") && data.endsWith(")")) {
      data = data.substring(1, data.length - 1);
    }

    // Parse the parameter list
    const parts = parseListItems(data);

    // Parameters come in name-value pairs
    for (let i = 0; i < parts.length; i += 2) {
      if (i + 1 < parts.length) {
        const name = parseStringValue(parts[i]);
        const value = parseStringValue(parts[i + 1]);

        if (name) {
          parameters[name.toUpperCase()] = value || "";
        }
      }
    }
  } catch (error) {
    console.warn("Error parsing parameter list:", error);
  }

  return parameters;
}

/**
 * Parses a string value
 * @param value String value
 * @returns Parsed string or undefined
 */
function parseStringValue(value: string): string | undefined {
  if (!value || value === "NIL") {
    return undefined;
  }

  // Remove quotes if present
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.substring(1, value.length - 1);
  }

  return value;
}

/**
 * Determines if a message has attachments based on its body structure
 * @param bodyStructure The body structure to check
 * @returns True if the message has attachments, false otherwise
 */
export function hasAttachments(bodyStructure: ImapBodyStructure): boolean {
  // Check if this part is an attachment
  if (isAttachment(bodyStructure)) {
    return true;
  }

  // If this is a multipart message, check each child part
  if (bodyStructure.type === "MULTIPART" && bodyStructure.childParts) {
    for (const part of bodyStructure.childParts) {
      if (hasAttachments(part)) {
        return true;
      }
    }
  }

  // If this is a message/rfc822, check its nested body structure
  if (bodyStructure.type === "MESSAGE" && 
      bodyStructure.subtype === "RFC822" && 
      bodyStructure.messageBodyStructure) {
    return hasAttachments(bodyStructure.messageBodyStructure);
  }

  return false;
}

/**
 * Determines if a body part is an attachment
 * @param part The body part to check
 * @returns True if the part is an attachment, false otherwise
 */
function isAttachment(part: ImapBodyStructure): boolean {
  // Check for explicit attachment disposition
  if (part.dispositionType === "ATTACHMENT") {
    return true;
  }

  // Check for inline disposition with a filename
  if (part.dispositionType === "INLINE" && 
      part.dispositionParameters && 
      part.dispositionParameters.FILENAME) {
    return true;
  }

  // Check for content types that are typically attachments
  if (part.type === "APPLICATION" || 
      part.type === "IMAGE" || 
      part.type === "AUDIO" || 
      part.type === "VIDEO") {
    return true;
  }

  // Check for a name parameter, which often indicates an attachment
  if (part.parameters && part.parameters.NAME) {
    return true;
  }

  // Special case for message/rfc822 parts without disposition
  if (part.type === "MESSAGE" && part.subtype === "RFC822" && !part.dispositionType) {
    return true;
  }

  return false;
}

/**
 * Extracts attachment information from a body structure
 * @param bodyStructure The body structure to analyze
 * @param path Current section path (used in recursion)
 * @returns Array of attachment information
 */
export function findAttachments(
  bodyStructure: ImapBodyStructure, 
  path = ""
): Array<{
  filename: string;
  type: string;
  subtype: string;
  size: number;
  encoding: string;
  section: string;
}> {
  const results: Array<{
    filename: string;
    type: string;
    subtype: string;
    size: number;
    encoding: string;
    section: string;
  }> = [];

  // Check if this part is an attachment
  if (isAttachment(bodyStructure)) {
    results.push({
      filename: bodyStructure.dispositionParameters?.FILENAME || 
                bodyStructure.parameters?.NAME || 
                "unnamed",
      type: bodyStructure.type,
      subtype: bodyStructure.subtype,
      size: bodyStructure.size,
      encoding: bodyStructure.encoding,
      section: path || "1", // Default to "1" if path is empty
    });
  }

  // Check child parts for multipart messages
  if (bodyStructure.childParts) {
    for (let i = 0; i < bodyStructure.childParts.length; i++) {
      // For multipart messages, section numbers start at 1
      const childPath = path ? `${path}.${i + 1}` : `${i + 1}`;
      const childAttachments = findAttachments(bodyStructure.childParts[i], childPath);
      results.push(...childAttachments);
    }
  }

  // Check nested body structure for message/rfc822
  if (bodyStructure.messageBodyStructure) {
    // For message/rfc822, we need to add ".1" to the path
    const messagePath = path ? `${path}.1` : "1";
    const nestedAttachments = findAttachments(bodyStructure.messageBodyStructure, messagePath);
    results.push(...nestedAttachments);
  }

  return results;
} 