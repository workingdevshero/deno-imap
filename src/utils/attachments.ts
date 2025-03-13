/**
 * Attachment utilities
 * @module
 */

/**
 * Decodes attachment data based on its encoding
 * @param data The raw attachment data
 * @param encoding The content transfer encoding
 * @returns Decoded data as Uint8Array
 */
export function decodeAttachment(data: Uint8Array, encoding: string): Uint8Array {
  const decoder = new TextDecoder();

  switch (encoding.toUpperCase()) {
    case 'BASE64': {
      try {
        // Convert Uint8Array to string
        const base64String = decoder.decode(data)
          .replace(/\r\n/g, '') // Remove line breaks
          .replace(/[^A-Za-z0-9+/=]/g, ''); // Remove non-base64 characters

        // Decode base64 to binary
        const binaryString = atob(base64String);

        // Convert binary string to Uint8Array
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        return bytes;
      } catch (error) {
        console.error('Error decoding BASE64:', error);
        return data; // Return original data if decoding fails
      }
    }

    case 'QUOTED-PRINTABLE': {
      // For quoted-printable, we need to decode manually
      const text = decoder.decode(data);
      const decoded = text
        .replace(/=\r\n/g, '')
        .replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

      // Convert back to Uint8Array
      return new TextEncoder().encode(decoded);
    }

    case '7BIT':
    case '8BIT':
    case 'BINARY':
    default:
      return data; // No decoding needed
  }
}
