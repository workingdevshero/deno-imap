/**
 * Decodes message body based on Content-Transfer-Encoding
 * @param body Message body as string
 * @param encoding Content-Transfer-Encoding value
 * @returns Decoded message body
 */
export function decodeBody(body: string, encoding?: string): string {
  if (!encoding) return body;

  switch (encoding.toLowerCase()) {
    case 'base64':
      return decodeBase64(body);
    case 'quoted-printable':
      return decodeQuotedPrintable(body);
    case '7bit':
    case '8bit':
    case 'binary':
    default:
      return body;
  }
}

/**
 * Parses a multipart message and returns the text content
 * @param body Message body
 * @param boundary Boundary string
 * @returns Parsed text content
 */
export function parseMultipartMessage(body: string, boundary: string): string {
  // Split the body into parts using the boundary
  const parts = body.split(`--${boundary}`);
  let textContent = '';
  let htmlContent = '';

  // Process each part
  for (const part of parts) {
    if (!part.trim() || part.includes('--')) continue;

    // Split headers and content
    const [headersText, ...contentParts] = part.split('\r\n\r\n');
    if (!contentParts.length) continue;

    const content = contentParts.join('\r\n\r\n');
    const headers: Record<string, string> = {};

    // Parse headers
    const headerLines = headersText.split('\r\n');
    for (const line of headerLines) {
      if (!line.trim()) continue;

      const match = line.match(/^([^:]+):\s*(.*)/);
      if (match) {
        headers[match[1]] = match[2];
      }
    }

    // Get content type and encoding
    const contentType = headers['Content-Type'] || 'text/plain';
    const encoding = headers['Content-Transfer-Encoding'] || '7bit';

    // Decode content based on encoding
    const decodedContent = decodeBody(content, encoding);

    // Store content based on type
    if (contentType.includes('text/plain')) {
      textContent = decodedContent;
    } else if (contentType.includes('text/html')) {
      htmlContent = decodedContent;
    }
  }

  // Prefer plain text if available, otherwise use HTML with tags stripped
  if (textContent) {
    return textContent;
  } else if (htmlContent) {
    return htmlContent
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return 'No readable content found in the message.';
}

/**
 * Decodes a base64 encoded string
 * @param str Base64 encoded string
 * @returns Decoded string
 */
function decodeBase64(str: string): string {
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
    );
  } catch (error) {
    console.warn('Failed to decode base64:', error);
    return str;
  }
}

/**
 * Decodes a quoted-printable encoded string
 * @param str Quoted-printable encoded string
 * @returns Decoded string
 */
function decodeQuotedPrintable(str: string): string {
  try {
    return str
      .replace(/=\r\n/g, '')
      .replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  } catch (error) {
    console.warn('Failed to decode quoted-printable:', error);
    return str;
  }
}
