/**
 * IMAP Connection module
 * 
 * Handles the low-level socket communication with the IMAP server.
 * @module
 */

import { ImapConnectionOptions } from "./types/mod.ts";
import {
  ImapConnectionError,
  ImapError,
  ImapNotConnectedError,
  ImapTimeoutError,
} from "./errors.ts";

/**
 * Default connection timeout in milliseconds
 */
const DEFAULT_CONNECTION_TIMEOUT = 30000;

/**
 * Default socket timeout in milliseconds
 */
const DEFAULT_SOCKET_TIMEOUT = 60000;

/**
 * Default IMAP ports
 */
const DEFAULT_PORTS = {
  plain: 143,
  tls: 993,
};

/**
 * Line terminator for IMAP protocol
 */
const CRLF = "\r\n";

/**
 * Handles the low-level socket communication with the IMAP server
 */
export class ImapConnection {
  /** Connection options */
  private options: ImapConnectionOptions;
  /** TCP connection */
  private conn?: Deno.Conn;
  /** TLS connection */
  private tlsConn?: Deno.TlsConn;
  /** Whether the connection is established */
  private _connected = false;
  /** Buffer for incoming data */
  private buffer = new Uint8Array(1024 * 32); // 32KB buffer
  /** Text decoder for converting bytes to string */
  private decoder = new TextDecoder();
  /** Text encoder for converting string to bytes */
  private encoder = new TextEncoder();
  /** Buffered data that hasn't been processed yet */
  private bufferedData = "";
  /** Connection timeout timer */
  private connectionTimeoutTimer?: number;
  /** Socket timeout timer */
  private socketTimeoutTimer?: number;

  /**
   * Creates a new IMAP connection
   * @param options Connection options
   */
  constructor(options: ImapConnectionOptions) {
    this.options = {
      ...options,
      port: options.port || (options.tls ? DEFAULT_PORTS.tls : DEFAULT_PORTS.plain),
      connectionTimeout: options.connectionTimeout || DEFAULT_CONNECTION_TIMEOUT,
      socketTimeout: options.socketTimeout || DEFAULT_SOCKET_TIMEOUT,
    };
  }

  /**
   * Whether the connection is established
   */
  get connected(): boolean {
    return this._connected;
  }

  /**
   * Connects to the IMAP server
   * @returns Promise that resolves when connected
   * @throws {ImapConnectionError} If connection fails
   * @throws {ImapTimeoutError} If connection times out
   */
  async connect(): Promise<void> {
    if (this._connected) {
      return;
    }

    try {
      // Set connection timeout
      const connectionTimeoutPromise = new Promise<never>((_, reject) => {
        this.connectionTimeoutTimer = setTimeout(() => {
          reject(
            new ImapTimeoutError("connect", this.options.connectionTimeout || DEFAULT_CONNECTION_TIMEOUT),
          );
        }, this.options.connectionTimeout || DEFAULT_CONNECTION_TIMEOUT);
      });

      // Connect to the server
      const connectPromise = this.establishConnection();
      await Promise.race([connectPromise, connectionTimeoutPromise]);

      // Clear connection timeout
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = undefined;

      // Set socket timeout
      this.resetSocketTimeout();

      this._connected = true;
    } catch (error) {
      // Clean up if connection fails
      this.cleanup();
      
      if (error instanceof ImapError) {
        throw error;
      } else {
        throw new ImapConnectionError(`Failed to connect to ${this.options.host}:${this.options.port}`, error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Establishes a connection to the IMAP server
   * @returns Promise that resolves when connected
   */
  private async establishConnection(): Promise<void> {
    try {
      // Create TCP connection
      this.conn = await Deno.connect({
        hostname: this.options.host,
        port: this.options.port,
      });

      // Upgrade to TLS if needed
      if (this.options.tls) {
        this.tlsConn = await Deno.connectTls({
          hostname: this.options.host,
          port: this.options.port,
          caCerts: this.options.tlsOptions?.caCerts,
          alpnProtocols: this.options.tlsOptions?.alpnProtocols,
        });
      }
    } catch (error) {
      throw new ImapConnectionError(
        `Failed to connect to ${this.options.host}:${this.options.port}`, 
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Resets the socket timeout
   */
  private resetSocketTimeout(): void {
    // Clear existing timeout
    if (this.socketTimeoutTimer) {
      clearTimeout(this.socketTimeoutTimer);
    }

    // Set new timeout
    this.socketTimeoutTimer = setTimeout(() => {
      this.handleSocketTimeout();
    }, this.options.socketTimeout || DEFAULT_SOCKET_TIMEOUT);
  }

  /**
   * Handles socket timeout
   */
  private handleSocketTimeout(): void {
    this.cleanup();
    this._connected = false;
    throw new ImapTimeoutError("socket", this.options.socketTimeout || DEFAULT_SOCKET_TIMEOUT);
  }

  /**
   * Cleans up resources
   */
  private cleanup(): void {
    // Clear timeouts
    if (this.connectionTimeoutTimer) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = undefined;
    }

    if (this.socketTimeoutTimer) {
      clearTimeout(this.socketTimeoutTimer);
      this.socketTimeoutTimer = undefined;
    }

    // Close connections
    try {
      this.tlsConn?.close();
    } catch (_) {
      // Ignore errors
    }

    try {
      this.conn?.close();
    } catch (_) {
      // Ignore errors
    }

    this.tlsConn = undefined;
    this.conn = undefined;
    this._connected = false;
  }

  /**
   * Disconnects from the IMAP server
   */
  disconnect(): void {
    this.cleanup();
  }

  /**
   * Writes data to the socket
   * @param data Data to write
   * @throws {ImapNotConnectedError} If not connected
   */
  async write(data: string): Promise<void> {
    if (!this._connected) {
      throw new ImapNotConnectedError();
    }

    this.resetSocketTimeout();

    const bytes = this.encoder.encode(data);
    const conn = this.tlsConn || this.conn;

    if (!conn) {
      throw new ImapNotConnectedError();
    }

    try {
      await conn.write(bytes);
    } catch (error) {
      this.cleanup();
      throw new ImapConnectionError(
        "Failed to write to socket", 
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Writes a line to the socket (appends CRLF)
   * @param line Line to write
   */
  async writeLine(line: string): Promise<void> {
    await this.write(line + CRLF);
  }

  /**
   * Reads data from the socket
   * @returns Promise that resolves with the data
   * @throws {ImapNotConnectedError} If not connected
   */
  async read(): Promise<string> {
    if (!this._connected) {
      throw new ImapNotConnectedError();
    }

    this.resetSocketTimeout();

    const conn = this.tlsConn || this.conn;

    if (!conn) {
      throw new ImapNotConnectedError();
    }

    try {
      const bytesRead = await conn.read(this.buffer);
      
      if (bytesRead === null) {
        // Connection closed
        this.cleanup();
        throw new ImapConnectionError("Connection closed by server");
      }

      const data = this.decoder.decode(this.buffer.subarray(0, bytesRead));
      return data;
    } catch (error) {
      this.cleanup();
      throw new ImapConnectionError(
        "Failed to read from socket", 
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Reads a line from the socket
   * @returns Promise that resolves with the line
   */
  async readLine(): Promise<string> {
    // Check if we have a line in the buffer
    const crlfIndex = this.bufferedData.indexOf(CRLF);
    
    if (crlfIndex !== -1) {
      // We have a line in the buffer
      const line = this.bufferedData.substring(0, crlfIndex);
      this.bufferedData = this.bufferedData.substring(crlfIndex + CRLF.length);
      return line;
    }

    // Read more data
    const data = await this.read();
    this.bufferedData += data;

    // Try again
    return this.readLine();
  }

  /**
   * Reads multiple lines until a termination condition is met
   * @param terminator Function that determines when to stop reading
   * @returns Promise that resolves with the lines
   */
  async readUntil(terminator: (line: string, accumulatedLines: string[]) => boolean): Promise<string[]> {
    const lines: string[] = [];
    
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      
      if (terminator(line, lines)) {
        break;
      }
    }
    
    return lines;
  }
} 