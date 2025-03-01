/**
 * IMAP fetch example
 * 
 * This example demonstrates how to fetch message details from an IMAP mailbox.
 * 
 * To run this example, create a .env file with the following variables:
 * IMAP_HOST=your_imap_server
 * IMAP_PORT=993
 * IMAP_USERNAME=your_username
 * IMAP_PASSWORD=your_password
 * IMAP_USE_TLS=true
 * 
 * Then run with: deno run --allow-net --allow-env --env-file=.env examples/fetch.ts
 */

import { ImapClient } from "../mod.ts";
import { getContentInfo } from './utils/headers.ts';
import { decodeBody, parseMultipartMessage } from './utils/body.ts';

// Helper function to decode Uint8Array to string
function decodeUint8Array(data: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(data);
}

/**
 * Decodes a base64 encoded string
 * @param str Base64 encoded string
 * @returns Decoded string
 */
export function decodeBase64(str: string): string {
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(str), (c) => c.charCodeAt(0))
    );
  } catch (error) {
    console.warn("Failed to decode base64:", error);
    return str;
  }
}

/**
 * Decodes a quoted-printable encoded string
 * @param str Quoted-printable encoded string
 * @returns Decoded string
 */
export function decodeQuotedPrintable(str: string): string {
  try {
    return str
      .replace(/=\r\n/g, "")
      .replace(/=([0-9A-F]{2})/g, (_, hex) => 
        String.fromCharCode(parseInt(hex, 16))
      );
  } catch (error) {
    console.warn("Failed to decode quoted-printable:", error);
    return str;
  }
}



// Validate required environment variables
const requiredEnvVars = ["IMAP_HOST", "IMAP_PORT", "IMAP_USERNAME", "IMAP_PASSWORD"];
for (const envVar of requiredEnvVars) {
  if (!Deno.env.get(envVar)) {
    console.error(`Error: ${envVar} environment variable is required`);
    Deno.exit(1);
  }
}

// Get environment variables
const host = Deno.env.get("IMAP_HOST")!;
const port = parseInt(Deno.env.get("IMAP_PORT")!, 10);
const username = Deno.env.get("IMAP_USERNAME")!;
const password = Deno.env.get("IMAP_PASSWORD")!;
const tls = Deno.env.get("IMAP_USE_TLS") !== "false"; // Default to true if not specified

// Create a new IMAP client
const client = new ImapClient({
  host,
  port,
  tls,
  username,
  password,
});

// Main function to handle the IMAP operations
async function main() {
  try {
    // Connect and authenticate
    await client.connect();
    await client.authenticate();
    console.log("Connected and authenticated");

    // Select the INBOX
    const inbox = await client.selectMailbox("INBOX");
    console.log(`Selected INBOX with ${inbox.exists} messages`);

    if (!inbox.exists || inbox.exists === 0) {
      console.log("No messages in INBOX");
      return;
    }

    // Fetch the most recent message
    const messageNumber = inbox.exists;
    console.log(`\nFetching message #${messageNumber}...`);
    
    const messages = await client.fetch(messageNumber.toString(), {
      envelope: true,
      flags: true,
      bodyParts: ["HEADER", "TEXT"],
      full: true,
    });

    if (messages.length === 0) {
      console.log("No message details available");
      return;
    }

    const message = messages[0];
    
    // Display message envelope information
    if (message.envelope) {
      const from = message.envelope.from?.[0] || { name: "Unknown", mailbox: "unknown", host: "unknown" };
      const to = message.envelope.to?.[0] || { name: "Unknown", mailbox: "unknown", host: "unknown" };
      
      console.log("\nMessage envelope:");
      console.log(`From: ${from.name || from.mailbox + "@" + from.host}`);
      console.log(`To: ${to.name || to.mailbox + "@" + to.host}`);
      console.log(`Subject: ${message.envelope.subject || "No subject"}`);
      
      // Handle date
      if (message.envelope.date) {
        try {
          const date = new Date(message.envelope.date);
          console.log(`Date: ${date.toLocaleString()}`);
        } catch {
          console.log(`Date: ${message.envelope.date} (unparsed)`);
        }
      } else {
        console.log("Date: Not available");
      }
    }

    // Display message flags
    if (message.flags && message.flags.length > 0) {
      console.log(`\nFlags: ${message.flags.join(", ")}`);
    } else {
      console.log("\nFlags: None");
    }

    // Display message headers
    let contentInfo: { contentType: string; encoding: string; boundary?: string } = { 
      contentType: "text/plain", 
      encoding: "7bit" 
    };
    
    if (message.headers) {
      console.log("\nSelected headers:");
      const importantHeaders = ["From", "To", "Subject", "Date", "Content-Type", "Content-Transfer-Encoding"];
      for (const header of importantHeaders) {
        if (message.headers[header]) {
          console.log(`${header}: ${message.headers[header]}`);
        }
      }
      
      // Extract content type and encoding for later use
      contentInfo = getContentInfo(message.headers);
      console.log(`\nDetected content type: ${contentInfo.contentType}`);
      console.log(`Detected encoding: ${contentInfo.encoding}`);
      if (contentInfo.boundary) {
        console.log(`Detected boundary: ${contentInfo.boundary}`);
      }
    }

    // Display message body with proper decoding
    console.log("\n=== MESSAGE CONTENT ===");
    
    if (message.parts && message.parts.TEXT) {
      console.log("\nProcessing message body...");
      
      // Get the raw body text
      const rawBodyText = decodeUint8Array(message.parts.TEXT.data);
      
      // Handle different content types
      if (contentInfo.contentType.startsWith("multipart/") && contentInfo.boundary) {
        // Handle multipart messages
        const parsedContent = parseMultipartMessage(rawBodyText, contentInfo.boundary);
        console.log("\nDecoded message content:");
        console.log(parsedContent);
      } else {
        // Handle single part messages
        const decodedBody = decodeBody(rawBodyText, contentInfo.encoding);
        
        if (contentInfo.contentType.includes("html")) {
          console.log("\n[HTML Content - Tags Stripped]");
          const plainText = decodedBody.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          console.log(plainText);
        } else {
          console.log("\n[Plain Text Content]");
          console.log(decodedBody);
        }
      }
    } else if (message.raw) {
      console.log("\nExtracting content from raw message...");
      const rawText = decodeUint8Array(message.raw);
      
      // Split headers and body
      const parts = rawText.split("\r\n\r\n");
      if (parts.length > 1) {
        // Extract headers from the first part
        const headerText = parts[0];
        const headerLines = headerText.split("\r\n");
        
        // Parse headers to get content type and encoding
        const headers: Record<string, string> = {};
        let currentHeader = "";
        let currentValue = "";
        
        for (const line of headerLines) {
          if (/^\s/.test(line)) {
            // Continuation of previous header
            currentValue += " " + line.trim();
          } else {
            // Save previous header if exists
            if (currentHeader) {
              headers[currentHeader] = currentValue;
            }
            
            // Parse new header
            const match = line.match(/^([^:]+):\s*(.*)/);
            if (match) {
              currentHeader = match[1];
              currentValue = match[2];
            }
          }
        }
        
        // Save last header
        if (currentHeader) {
          headers[currentHeader] = currentValue;
        }
        
        // Get content info
        const { contentType, encoding, boundary } = headers["Content-Type"] 
          ? { 
              contentType: headers["Content-Type"], 
              encoding: headers["Content-Transfer-Encoding"] || "7bit",
              boundary: headers["Content-Type"].match(/boundary="?([^";\s]+)"?/i)?.[1]
            }
          : { contentType: "text/plain", encoding: "7bit", boundary: undefined };
        
        console.log(`Detected content type: ${contentType}`);
        console.log(`Detected encoding: ${encoding}`);
        if (boundary) {
          console.log(`Detected boundary: ${boundary}`);
        }
        
        // Get the body
        const bodyText = parts.slice(1).join("\r\n\r\n");
        
        // Handle different content types
        if (contentType.includes("multipart/") && boundary) {
          // Handle multipart messages
          const parsedContent = parseMultipartMessage(bodyText, boundary);
          console.log("\nDecoded message content:");
          console.log(parsedContent);
        } else {
          // Handle single part messages
          const decodedBody = decodeBody(bodyText, encoding);
          
          if (contentType.toLowerCase().includes("html")) {
            console.log("\n[HTML Content - Tags Stripped]");
            const plainText = decodedBody.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            console.log(plainText);
          } else {
            console.log("\n[Plain Text Content]");
            console.log(decodedBody);
          }
        }
      } else {
        console.log("Could not extract body from raw message");
      }
    } else {
      console.log("\nNo message body available");
    }

  } catch (error: unknown) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
  } finally {
    // Disconnect from the server
    await client.disconnect();
    console.log("\nDisconnected from IMAP server");
  }
}

// Run the main function
await main(); 