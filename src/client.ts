/**
 * IMAP Client
 *
 * Main implementation of the IMAP client.
 * @module
 */

import * as commands from "./commands/mod.ts";
import { ImapConnection } from "./connection.ts";
import {
  ImapAuthError,
  ImapCapabilityError,
  ImapCommandError,
  ImapConnectionError,
  ImapNoMailboxSelectedError,
  ImapNotConnectedError,
  ImapTimeoutError,
} from "./errors.ts";
import * as parsers from "./parsers/mod.ts";
import { createCancellablePromise } from "./utils/promises.ts";
import type {
  ImapAuthMechanism,
  ImapBodyStructure,
  ImapEnvelope,
  ImapFetchOptions,
  ImapMailbox,
  ImapMessage,
  ImapMessagePart,
  ImapOptions,
  ImapSearchCriteria,
} from "./types/mod.ts";

/**
 * Event types for the IMAP client
 */
export type ImapClientEvent =
  | "reconnecting"
  | "reconnected"
  | "reconnect_failed"
  | "error"
  | "close"
  | "end";

/**
 * Event listener type
 */
export type ImapClientEventListener = (data?: any) => void;

/**
 * Default options for the IMAP client
 */
const DEFAULT_OPTIONS: Partial<ImapOptions> = {
  autoConnect: true,
  autoReconnect: true,
  maxReconnectAttempts: 3,
  reconnectDelay: 1000,
  commandTimeout: 30000,
};

/**
 * IMAP client implementation
 */
export class ImapClient {
  /** Connection to the IMAP server */
  private connection: ImapConnection;
  /** Client options */
  private options: ImapOptions;
  /** Command tag counter */
  private tagCounter = 0;
  /** Server capabilities */
  private _capabilities: Set<string> = new Set();
  /** Currently selected mailbox */
  private _selectedMailbox?: ImapMailbox;
  /** Command timeout timer */
  private commandTimeoutTimer?: number;
  /** Whether the client is authenticated */
  private _authenticated = false;
  /** Command promises */
  private commandPromises: Map<
    string,
    { resolve: (value: string[]) => void; reject: (reason: Error) => void }
  > = new Map();
  /** Reconnection attempt counter */
  private reconnectAttempts = 0;
  /** Whether a reconnection is in progress */
  private isReconnecting = false;
  /** Event listeners */
  private eventListeners: Map<ImapClientEvent, Set<ImapClientEventListener>> =
    new Map();

  /**
   * Creates a new IMAP client
   * @param options Client options
   */
  constructor(options: ImapOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.connection = new ImapConnection(this.options);

    if (this.options.autoConnect) {
      this.connect().catch((error) => {
        console.error("Failed to auto-connect:", error);
        this.emit("error", error);
      });
    }
  }

  /**
   * Adds an event listener
   * @param event Event type
   * @param listener Event listener
   */
  on(event: ImapClientEvent, listener: ImapClientEventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)?.add(listener);
  }

  /**
   * Removes an event listener
   * @param event Event type
   * @param listener Event listener
   */
  off(event: ImapClientEvent, listener: ImapClientEventListener): void {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)?.delete(listener);
    }
  }

  /**
   * Emits an event
   * @param event Event type
   * @param data Event data
   */
  private emit(event: ImapClientEvent, data?: any): void {
    if (this.eventListeners.has(event)) {
      for (const listener of this.eventListeners.get(event) || []) {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Whether the client is connected
   */
  get connected(): boolean {
    return this.connection.connected;
  }

  /**
   * Whether the client is authenticated
   */
  get authenticated(): boolean {
    return this._authenticated;
  }

  /**
   * Whether a reconnection is in progress
   */
  get reconnecting(): boolean {
    return this.isReconnecting;
  }

  /**
   * Server capabilities
   */
  get capabilities(): string[] {
    return [...this._capabilities];
  }

  /**
   * Currently selected mailbox
   */
  get selectedMailbox(): ImapMailbox | undefined {
    return this._selectedMailbox;
  }

  /**
   * Connects to the IMAP server
   * @returns Promise that resolves when connected
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.connection.connect();

      // Read the server greeting
      const greeting = await this.connection.readLine();

      if (!greeting.startsWith("* OK")) {
        this.connection.disconnect();
        throw new ImapCommandError("connect", greeting);
      }

      // Get server capabilities
      await this.updateCapabilities();
    } catch (error) {
      // If the error is a socket timeout, emit an error event
      if (error instanceof ImapTimeoutError) {
        this.emit("error", error);
      }
      throw error;
    }
  }

  /**
   * Disconnects from the IMAP server
   * Attempts to gracefully close the connection by sending a LOGOUT command
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    // First, cancel any pending command timeouts
    if (this.commandTimeoutTimer) {
      clearTimeout(this.commandTimeoutTimer);
      this.commandTimeoutTimer = undefined;
    }

    try {
      // Try to send LOGOUT command with a shorter timeout
      try {
        // Use executeCommand with a shorter timeout for the LOGOUT command
        const logoutTimeout = 2000; // 2 second timeout for LOGOUT
        const originalTimeout = this.options.commandTimeout;
        
        // Temporarily set a shorter command timeout
        this.options.commandTimeout = logoutTimeout;
        
        // Execute the LOGOUT command
        await this.executeCommand(commands.logout());
        
        // Restore original timeout
        this.options.commandTimeout = originalTimeout;
      } catch (error) {
        // Ignore errors during logout, but log them
        console.warn("Error during LOGOUT command:", error);
      }
    } finally {
      // Cancel all pending commands immediately
      for (const [tag, promise] of this.commandPromises.entries()) {
        promise.reject(new ImapConnectionError("Connection closed by client"));
        this.commandPromises.delete(tag);
      }
      
      // Clear command promises map
      this.commandPromises.clear();
      
      // Disconnect the connection
      this.connection.disconnect();
      
      // Reset state
      this._authenticated = false;
      this._selectedMailbox = undefined;
      this._capabilities.clear();
      
      // Reset reconnection state
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      
      // Emit close event
      this.emit("close");
    }
  }

  /**
   * Reconnects to the IMAP server
   * @returns Promise that resolves when reconnected
   * @throws {ImapConnectionError} If reconnection fails
   */
  async forceReconnect(): Promise<void> {
    await this.reconnect();
  }

  /**
   * Updates the server capabilities
   * @returns Promise that resolves with the capabilities
   */
  async updateCapabilities(): Promise<string[]> {
    try {
      const response = await this.executeCommand(commands.capability());

      for (const line of response) {
        if (line.startsWith("* CAPABILITY")) {
          const capabilities = parsers.parseCapabilities(line);
          this._capabilities = new Set(capabilities);
          return capabilities;
        }
      }

      return [];
    } catch (error) {
      // If the error is a socket timeout, emit an error event
      if (error instanceof ImapTimeoutError) {
        this.emit("error", error);
      }
      throw error;
    }
  }

  /**
   * Authenticates with the IMAP server
   * @param mechanism Authentication mechanism
   * @returns Promise that resolves when authenticated
   */
  async authenticate(mechanism: ImapAuthMechanism = "PLAIN"): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (this._authenticated) {
      return;
    }

    // Check if the server supports the requested auth mechanism
    const authCap = `AUTH=${mechanism}`;
    if (!this._capabilities.has(authCap)) {
      throw new ImapCapabilityError(authCap);
    }

    try {
      switch (mechanism) {
        case "PLAIN":
          await this.authenticatePlain();
          break;
        case "LOGIN":
          await this.authenticateLogin();
          break;
        case "OAUTH2":
        case "XOAUTH2":
          throw new Error(
            `Authentication mechanism ${mechanism} not implemented yet`
          );
        default:
          throw new Error(`Unknown authentication mechanism: ${mechanism}`);
      }

      this._authenticated = true;

      // Update capabilities after authentication
      await this.updateCapabilities();
    } catch (error) {
      // If the error is a socket timeout, emit an error event
      if (error instanceof ImapTimeoutError) {
        this.emit("error", error);
      }

      if (error instanceof ImapCommandError) {
        throw new ImapAuthError(`Authentication failed: ${error.response}`);
      }
      throw error;
    }
  }

  /**
   * Authenticates with the PLAIN mechanism
   * @returns Promise that resolves when authenticated
   */
  private async authenticatePlain(): Promise<void> {
    const authString = `\u0000${this.options.username}\u0000${this.options.password}`;
    const base64Auth = btoa(authString);

    await this.executeCommand(`AUTHENTICATE PLAIN ${base64Auth}`);
  }

  /**
   * Authenticates with the LOGIN mechanism
   * @returns Promise that resolves when authenticated
   */
  private async authenticateLogin(): Promise<void> {
    await this.executeCommand(
      commands.login(this.options.username, this.options.password)
    );
  }

  /**
   * Lists mailboxes
   * @param reference Reference name (usually empty string)
   * @param mailbox Mailbox name pattern
   * @returns Promise that resolves with the mailboxes
   */
  async listMailboxes(reference = "", mailbox = "*"): Promise<ImapMailbox[]> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    const response = await this.executeCommand(
      commands.list(reference, mailbox)
    );
    const mailboxes: ImapMailbox[] = [];

    for (const line of response) {
      if (line.startsWith("* LIST")) {
        try {
          const mailbox = parsers.parseListResponse(line);
          mailboxes.push(mailbox);
        } catch (error) {
          console.warn("Failed to parse LIST response:", error);
        }
      }
    }

    return mailboxes;
  }

  /**
   * Gets the status of a mailbox
   * @param mailbox Mailbox name
   * @param items Status items to request
   * @returns Promise that resolves with the mailbox status
   */
  async getMailboxStatus(
    mailbox: string,
    items = ["MESSAGES", "RECENT", "UNSEEN", "UIDNEXT", "UIDVALIDITY"]
  ): Promise<Partial<ImapMailbox>> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    const response = await this.executeCommand(commands.status(mailbox, items));

    for (const line of response) {
      if (line.startsWith("* STATUS")) {
        try {
          return parsers.parseStatus(line);
        } catch (error) {
          console.warn("Failed to parse STATUS response:", error);
        }
      }
    }

    return { name: mailbox };
  }

  /**
   * Selects a mailbox
   * @param mailbox Mailbox name
   * @returns Promise that resolves with the mailbox information
   */
  async selectMailbox(mailbox: string): Promise<ImapMailbox> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    const response = await this.executeCommand(commands.select(mailbox));
    const mailboxInfo = parsers.parseSelect(response);

    // Get the actual unseen count using STATUS command
    try {
      const status = await this.getMailboxStatus(mailbox, ["UNSEEN"]);
      if (status.unseen !== undefined) {
        mailboxInfo.unseen = status.unseen;
      }
    } catch (error) {
      console.warn("Failed to get unseen count:", error);
    }

    this._selectedMailbox = {
      name: mailbox,
      flags: mailboxInfo.flags || [],
      delimiter: "/", // Default delimiter
      ...mailboxInfo,
    };

    return this._selectedMailbox;
  }

  /**
   * Examines a mailbox (read-only mode)
   * @param mailbox Mailbox name
   * @returns Promise that resolves with the mailbox information
   */
  async examineMailbox(mailbox: string): Promise<ImapMailbox> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    const response = await this.executeCommand(commands.examine(mailbox));
    const mailboxInfo = parsers.parseSelect(response);

    // Don't set as selected mailbox since it's read-only

    return {
      name: mailbox,
      flags: mailboxInfo.flags || [],
      delimiter: "/", // Default delimiter
      ...mailboxInfo,
    };
  }

  /**
   * Closes the currently selected mailbox
   * @returns Promise that resolves when the mailbox is closed
   */
  async closeMailbox(): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      throw new ImapNotConnectedError("Not authenticated");
    }

    if (!this._selectedMailbox) {
      return;
    }

    await this.executeCommand(commands.close());
    this._selectedMailbox = undefined;
  }

  /**
   * Creates a new mailbox
   * @param mailbox Mailbox name
   * @returns Promise that resolves when the mailbox is created
   */
  async createMailbox(mailbox: string): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    await this.executeCommand(commands.create(mailbox));
  }

  /**
   * Deletes a mailbox
   * @param mailbox Mailbox name
   * @returns Promise that resolves when the mailbox is deleted
   */
  async deleteMailbox(mailbox: string): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    await this.executeCommand(commands.deleteMailbox(mailbox));

    // If the deleted mailbox is the currently selected one, clear it
    if (this._selectedMailbox && this._selectedMailbox.name === mailbox) {
      this._selectedMailbox = undefined;
    }
  }

  /**
   * Renames a mailbox
   * @param oldName Old mailbox name
   * @param newName New mailbox name
   * @returns Promise that resolves when the mailbox is renamed
   */
  async renameMailbox(oldName: string, newName: string): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    await this.executeCommand(commands.rename(oldName, newName));

    // If the renamed mailbox is the currently selected one, update its name
    if (this._selectedMailbox && this._selectedMailbox.name === oldName) {
      this._selectedMailbox.name = newName;
    }
  }

  /**
   * Subscribes to a mailbox
   * @param mailbox Mailbox name
   * @returns Promise that resolves when subscribed
   */
  async subscribeMailbox(mailbox: string): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    await this.executeCommand(commands.subscribe(mailbox));
  }

  /**
   * Unsubscribes from a mailbox
   * @param mailbox Mailbox name
   * @returns Promise that resolves when unsubscribed
   */
  async unsubscribeMailbox(mailbox: string): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    await this.executeCommand(commands.unsubscribe(mailbox));
  }

  /**
   * Searches for messages
   * @param criteria Search criteria
   * @param charset Character set
   * @returns Promise that resolves with the message numbers
   */
  async search(
    criteria: ImapSearchCriteria,
    charset?: string
  ): Promise<number[]> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    if (!this._selectedMailbox) {
      throw new ImapNoMailboxSelectedError();
    }

    const response = await this.executeCommand(
      commands.search(criteria, charset)
    );

    for (const line of response) {
      if (line.startsWith("* SEARCH")) {
        try {
          return parsers.parseSearch(line);
        } catch (error) {
          console.warn("Failed to parse SEARCH response:", error);
        }
      }
    }

    return [];
  }

  /**
   * Fetches messages
   * @param sequence Message sequence set
   * @param options Fetch options
   * @returns Promise that resolves with the messages
   */
  async fetch(
    sequence: string,
    options: ImapFetchOptions
  ): Promise<ImapMessage[]> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    if (!this._selectedMailbox) {
      throw new ImapNoMailboxSelectedError();
    }

    const response = await this.executeCommand(
      commands.fetch(sequence, options)
    );

    // Parse the fetch response
    const messages: ImapMessage[] = [];

    // Group the response lines by message
    const messageGroups: string[][] = [];
    let currentGroup: string[] = [];
    let inLiteral = false;
    let literalSize = 0;
    let literalCollected = 0;

    for (const line of response) {
      // Check if this is the start of a new message
      // Format: * 1 FETCH (...)
      const fetchMatch = line.match(/^\* (\d+) FETCH/i);

      if (fetchMatch && !inLiteral) {
        // If we were collecting lines for a message, add them to the groups
        if (currentGroup.length > 0) {
          messageGroups.push(currentGroup);
          currentGroup = [];
        }

        // Start a new group
        currentGroup.push(line);

        // Check if this line contains a literal string
        const literalMatch = line.match(/\{(\d+)\}$/);
        if (literalMatch) {
          inLiteral = true;
          literalSize = parseInt(literalMatch[1], 10);
          literalCollected = 0;
        }
      } else {
        // Add the line to the current group
        currentGroup.push(line);

        // If we're collecting a literal, update the count
        if (inLiteral) {
          literalCollected += line.length + 2; // +2 for CRLF

          // Check if we've collected the entire literal
          if (literalCollected >= literalSize) {
            inLiteral = false;
          }
        }
      }
    }

    // Add the last group if it's not empty
    if (currentGroup.length > 0) {
      messageGroups.push(currentGroup);
    }

    // Parse each message group
    for (const group of messageGroups) {
      try {
        const messageData = parsers.parseFetch(group);

        if (messageData && messageData.seq) {
          // Create a message object with the parsed data
          const message: ImapMessage = {
            seq: messageData.seq as number,
            flags: (messageData.flags as string[]) || [],
            uid: messageData.uid as number,
            size: messageData.size as number,
            internalDate: messageData.internalDate as Date,
            envelope: messageData.envelope as ImapEnvelope | undefined,
            bodyStructure: messageData.bodyStructure as
              | ImapBodyStructure
              | undefined,
            headers: messageData.headers as Record<string, string | string[]>,
            parts: messageData.parts as
              | Record<string, ImapMessagePart>
              | undefined,
            raw: messageData.raw as Uint8Array,
          };

          // Add the message to the list
          messages.push(message);
        }
      } catch (error) {
        console.warn("Failed to parse FETCH response:", error);
      }
    }

    return messages;
  }

  /**
   * Sets flags on messages
   * @param sequence Message sequence set
   * @param flags Flags to set
   * @param action Action to perform
   * @param useUid Whether to use UIDs
   * @returns Promise that resolves when the flags are set
   */
  async setFlags(
    sequence: string,
    flags: string[],
    action: "set" | "add" | "remove" = "set",
    useUid = false
  ): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    if (!this._selectedMailbox) {
      throw new ImapNoMailboxSelectedError();
    }

    await this.executeCommand(commands.store(sequence, flags, action, useUid));
  }

  /**
   * Copies messages to another mailbox
   * @param sequence Message sequence set
   * @param mailbox Destination mailbox
   * @param useUid Whether to use UIDs
   * @returns Promise that resolves when the messages are copied
   */
  async copyMessages(
    sequence: string,
    mailbox: string,
    useUid = false
  ): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    if (!this._selectedMailbox) {
      throw new ImapNoMailboxSelectedError();
    }

    await this.executeCommand(commands.copy(sequence, mailbox, useUid));
  }

  /**
   * Moves messages to another mailbox
   * @param sequence Message sequence set
   * @param mailbox Destination mailbox
   * @param useUid Whether to use UIDs
   * @returns Promise that resolves when the messages are moved
   */
  async moveMessages(
    sequence: string,
    mailbox: string,
    useUid = false
  ): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    if (!this._selectedMailbox) {
      throw new ImapNoMailboxSelectedError();
    }

    // Check if the server supports MOVE
    if (this._capabilities.has("MOVE")) {
      await this.executeCommand(commands.move(sequence, mailbox, useUid));
    } else {
      // Fall back to COPY + STORE + EXPUNGE
      await this.copyMessages(sequence, mailbox, useUid);
      await this.setFlags(sequence, ["\\Deleted"], "add", useUid);
      await this.executeCommand(commands.expunge());
    }
  }

  /**
   * Expunges deleted messages
   * @returns Promise that resolves when the messages are expunged
   */
  async expunge(): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    if (!this._selectedMailbox) {
      throw new ImapNoMailboxSelectedError();
    }

    await this.executeCommand(commands.expunge());
  }

  /**
   * Appends a message to a mailbox
   * @param mailbox Mailbox name
   * @param message Message content
   * @param flags Message flags
   * @param date Message date
   * @returns Promise that resolves when the message is appended
   */
  async appendMessage(
    mailbox: string,
    message: string,
    flags?: string[],
    date?: Date
  ): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    try {
      // Send the APPEND command
      const tag = this.generateTag();
      const command = commands.append(mailbox, message, flags, date);

      await this.connection.writeLine(`${tag} ${command}`);

      // Wait for the continuation response
      const response = await this.connection.readLine();

      if (!response.startsWith("+")) {
        throw new ImapCommandError("APPEND", response);
      }

      // Send the message content
      await this.connection.writeLine(message);

      // Wait for the command completion
      await this.waitForCommandCompletion(tag);
    } catch (error) {
      // Handle connection errors
      if (
        error instanceof ImapTimeoutError ||
        error instanceof ImapConnectionError
      ) {
        // If the connection was lost, attempt to reconnect if enabled
        if (
          this.options.autoReconnect &&
          error instanceof ImapConnectionError
        ) {
          try {
            await this.reconnect();

            // If reconnection was successful, retry the append operation
            // Note: The message may have been partially appended before the connection was lost
            return await this.appendMessage(mailbox, message, flags, date);
          } catch (_reconnectError) {
            // If reconnection failed, throw the original error
            throw error;
          }
        }
      }

      throw error;
    }
  }

  /**
   * Executes an IMAP command
   * @param command Command to execute
   * @returns Promise that resolves with the response lines
   */
  private async executeCommand(command: string): Promise<string[]> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    const tag = this.generateTag();
    const commandPromise = new Promise<string[]>((resolve, reject) => {
      this.commandPromises.set(tag, { resolve, reject });
    });

    // Create a cancellable timeout promise
    const timeoutMs = this.options.commandTimeout || 30000;
    const cancellable = createCancellablePromise<string[]>(
      async () => {
        try {
          // Send the command
          await this.connection.writeLine(`${tag} ${command}`);

          // Wait for the response
          const responseLines: string[] = [];

          while (true) {
            const line = await this.connection.readLine();
            responseLines.push(line);

            if (line.startsWith(tag)) {
              // Command completed
              if (line.includes("OK")) {
                this.commandPromises.get(tag)?.resolve(responseLines);
              } else {
                this.commandPromises
                  .get(tag)
                  ?.reject(new ImapCommandError(command, line));
              }

              this.commandPromises.delete(tag);
              break;
            }
          }

          return responseLines;
        } catch (error) {
          this.commandPromises.delete(tag);

          // If the error is from the connection (e.g., socket timeout),
          // clean up and rethrow
          if (
            error instanceof ImapTimeoutError ||
            error instanceof ImapConnectionError
          ) {
            // If the connection was lost, attempt to reconnect if enabled
            if (
              this.options.autoReconnect &&
              error instanceof ImapConnectionError
            ) {
              try {
                await this.reconnect();

                // If reconnection was successful, retry the command
                return await this.executeCommand(command);
              } catch (_reconnectError) {
                // If reconnection failed, throw the original error
                throw error;
              }
            }
          }
          
          // Rethrow the error
          throw error;
        }
      },
      timeoutMs,
      `Command timeout: ${command}`
    );

    // Store the timeout clear function for later use
    this.commandTimeoutTimer = setTimeout(() => {}, 0);
    clearTimeout(this.commandTimeoutTimer);
    this.commandTimeoutTimer = 1 as unknown as number; // Just a non-undefined value as a flag
    
    try {
      // Wait for the command to complete or timeout
      return await cancellable.promise;
    } catch (error) {
      this.commandPromises.delete(tag);
      throw error;
    } finally {
      // Clear the timeout
      cancellable.disableTimeout();
      this.commandTimeoutTimer = undefined;
    }
  }

  /**
   * Waits for a command to complete
   * @param tag Command tag
   * @returns Promise that resolves when the command completes
   */
  private async waitForCommandCompletion(tag: string): Promise<string[]> {
    const responseLines: string[] = [];

    while (true) {
      try {
        const line = await this.connection.readLine();
        responseLines.push(line);

        if (line.startsWith(tag)) {
          // Command completed
          if (!line.includes("OK")) {
            throw new ImapCommandError("command", line);
          }

          break;
        }
      } catch (error) {
        // If the error is from the connection (e.g., socket timeout),
        // clean up and rethrow
        if (
          error instanceof ImapTimeoutError ||
          error instanceof ImapConnectionError
        ) {
          // If the connection was lost, attempt to reconnect if enabled
          if (
            this.options.autoReconnect &&
            error instanceof ImapConnectionError
          ) {
            try {
              await this.reconnect();

              // If reconnection was successful, we can't continue waiting for this command
              // as the server won't remember it. Throw an error to indicate the command failed.
              throw new ImapCommandError(
                "command",
                "Connection lost during command execution and was reconnected. The command may or may not have been executed."
              );
            } catch (_reconnectError) {
              // If reconnection failed, throw the original error
              throw error;
            }
          }

          throw error;
        }
        // Otherwise, rethrow the error
        throw error;
      }
    }

    return responseLines;
  }

  /**
   * Generates a unique command tag
   * @returns Command tag
   */
  private generateTag(): string {
    this.tagCounter++;
    return `A${this.tagCounter.toString().padStart(4, "0")}`;
  }

  /**
   * Attempts to reconnect to the IMAP server
   * @returns Promise that resolves when reconnected
   * @throws {ImapConnectionError} If reconnection fails after max attempts
   */
  private async reconnect(): Promise<void> {
    // If already reconnecting, wait for that to complete
    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts = 0;
    this.emit("reconnecting");

    // Track the backoff timeout so we can clear it if needed
    let backoffTimeout: number | undefined;

    try {
      // Save the currently selected mailbox to reselect after reconnection
      let previousMailbox: string | undefined;
      if (this._selectedMailbox) {
        previousMailbox = this._selectedMailbox.name;
      }

      // Disconnect if still connected
      if (this.connected) {
        this.connection.disconnect();
      }

      // Reset state
      this._authenticated = false;
      this._selectedMailbox = undefined as ImapMailbox | undefined;
      this._capabilities.clear();

      // Try to reconnect with exponential backoff
      while (this.reconnectAttempts < this.options.maxReconnectAttempts!) {
        try {
          console.log(
            `Reconnection attempt ${this.reconnectAttempts + 1}/${
              this.options.maxReconnectAttempts
            }...`
          );

          // Wait with exponential backoff
          const delay =
            this.options.reconnectDelay! * Math.pow(2, this.reconnectAttempts);
          
          // Use a promise with a stored timeout ID so we can clear it if needed
          await new Promise<void>((resolve) => {
            backoffTimeout = setTimeout(() => {
              backoffTimeout = undefined;
              resolve();
            }, delay);
          });

          // Try to connect
          await this.connect();

          // If connected, authenticate
          if (this.connected) {
            await this.authenticate();

            // If previously had a mailbox selected, reselect it
            if (previousMailbox && this._authenticated) {
              await this.selectMailbox(previousMailbox);
            }

            console.log("Reconnection successful");

            // Get current mailbox name for the event
            let currentMailbox: string | undefined;
            if (this._selectedMailbox) {
              currentMailbox = this._selectedMailbox.name;
            }

            this.emit("reconnected", { mailbox: currentMailbox });
            this.reconnectAttempts = 0;
            return;
          }
        } catch (error) {
          console.warn(
            `Reconnection attempt ${this.reconnectAttempts + 1} failed:`,
            error
          );
          this.emit("error", error);
        }

        this.reconnectAttempts++;
      }

      // If we get here, all reconnection attempts failed
      const error = new ImapConnectionError(
        `Failed to reconnect after ${this.options.maxReconnectAttempts} attempts`
      );
      this.emit("reconnect_failed", error);
      throw error;
    } finally {
      // Clear any pending backoff timeout
      if (backoffTimeout !== undefined) {
        clearTimeout(backoffTimeout);
        backoffTimeout = undefined;
      }
      
      this.isReconnecting = false;
    }
  }

  /**
   * Removes all event listeners
   */
  private removeAllEventListeners(): void {
    this.eventListeners.clear();
  }

  /**
   * Forcibly closes all connections and cleans up resources
   * This is more aggressive than disconnect() as it doesn't try to send a LOGOUT command
   */
  close(): void {
    // Cancel any pending command timeouts
    if (this.commandTimeoutTimer) {
      clearTimeout(this.commandTimeoutTimer);
      this.commandTimeoutTimer = undefined;
    }
    
    // Cancel all pending commands immediately
    for (const [tag, promise] of this.commandPromises.entries()) {
      promise.reject(new ImapConnectionError("Connection forcibly closed by client"));
      this.commandPromises.delete(tag);
    }
    
    // Clear command promises map
    this.commandPromises.clear();
    
    // Disconnect the connection
    if (this.connected) {
      this.connection.disconnect();
    }
    
    // Reset state
    this._authenticated = false;
    this._selectedMailbox = undefined;
    this._capabilities.clear();
    
    // Reset reconnection state
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    
    // Emit close event
    this.emit("close");
    
    // Remove all event listeners
    this.removeAllEventListeners();
  }
}
