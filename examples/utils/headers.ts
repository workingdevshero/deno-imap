/**
 * Extracts content type and encoding from headers
 * @param headers Message headers
 * @returns Object with contentType and encoding
 */

export function getContentInfo(headers: Record<string, string | string[]>): { contentType: string; encoding: string; boundary?: string; } {
  let contentType = "text/plain";
  let encoding = "7bit";
  let boundary;

  if (headers["Content-Type"]) {
    const ctHeader = Array.isArray(headers["Content-Type"])
      ? headers["Content-Type"][0]
      : headers["Content-Type"];

    const ctMatch = ctHeader.match(/^([^;]+)/);
    if (ctMatch) contentType = ctMatch[1].trim().toLowerCase();

    // Extract boundary for multipart messages
    const boundaryMatch = ctHeader.match(/boundary="?([^";\s]+)"?/i);
    if (boundaryMatch) boundary = boundaryMatch[1];
  }

  if (headers["Content-Transfer-Encoding"]) {
    const cteHeader = Array.isArray(headers["Content-Transfer-Encoding"])
      ? headers["Content-Transfer-Encoding"][0]
      : headers["Content-Transfer-Encoding"];

    encoding = cteHeader.trim().toLowerCase();
  }

  return { contentType, encoding, boundary };
}
