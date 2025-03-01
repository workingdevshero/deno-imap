/**
 * IMAP Client
 * 
 * Main implementation of the IMAP client.
 * @module
 */

import { ImapConnection } from "./connection.ts";
import * as commands from "./commands/mod.ts";
import * as parsers from "./parsers/mod.ts";
import {
  ImapAuthError,
  ImapCapabilityError,
  ImapCommandError,
  ImapNoMailboxSelectedError,
  ImapNotConnectedError,
  ImapTimeoutError,
} from "./errors.ts";
import {
  ImapAuthMechanism,
  ImapCapability,
  ImapFetchOptions,
  ImapMailbox,
  ImapMessage,
  ImapOptions,
  ImapSearchCriteria,
} from "./types/mod.ts";

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
      });
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

    await this.connection.connect();

    // Read the server greeting
    const greeting = await this.connection.readLine();

    if (!greeting.startsWith("* OK")) {
      this.connection.disconnect();
      throw new ImapCommandError("connect", greeting);
    }

    // Get server capabilities
    await this.updateCapabilities();
  }

  /**
   * Disconnects from the IMAP server
   */
  disconnect(): void {
    if (!this.connected) {
      return;
    }

    try {
      // Try to send LOGOUT command
      this.executeCommand(commands.logout()).catch(() => {
        // Ignore errors
      });
    } finally {
      this.connection.disconnect();
      this._authenticated = false;
      this._selectedMailbox = undefined;
      this._capabilities.clear();
    }
  }

  /**
   * Updates the server capabilities
   * @returns Promise that resolves with the capabilities
   */
  async updateCapabilities(): Promise<string[]> {
    const response = await this.executeCommand(commands.capability());
    
    for (const line of response) {
      if (line.startsWith("* CAPABILITY")) {
        const capabilities = parsers.parseCapabilities(line);
        this._capabilities = new Set(capabilities);
        return capabilities;
      }
    }
    
    return [];
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
          throw new Error(`Authentication mechanism ${mechanism} not implemented yet`);
        default:
          throw new Error(`Unknown authentication mechanism: ${mechanism}`);
      }

      this._authenticated = true;
      
      // Update capabilities after authentication
      await this.updateCapabilities();
    } catch (error) {
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
    await this.executeCommand(commands.login(this.options.username, this.options.password));
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

    const response = await this.executeCommand(commands.list(reference, mailbox));
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
    items = ["MESSAGES", "RECENT", "UNSEEN", "UIDNEXT", "UIDVALIDITY"],
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
  async search(criteria: ImapSearchCriteria, charset?: string): Promise<number[]> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    if (!this._selectedMailbox) {
      throw new ImapNoMailboxSelectedError();
    }

    const response = await this.executeCommand(commands.search(criteria, charset));
    
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
  async fetch(sequence: string, options: ImapFetchOptions): Promise<ImapMessage[]> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

    if (!this._selectedMailbox) {
      throw new ImapNoMailboxSelectedError();
    }

    const response = await this.executeCommand(commands.fetch(sequence, options));
    
    // Parse the fetch response
    const messages: ImapMessage[] = [];
    let currentMessage: Partial<ImapMessage> | null = null;
    
    for (const line of response) {
      // Check if this is the start of a new message
      // Format: * 1 FETCH (...)
      const fetchMatch = line.match(/^\* (\d+) FETCH/i);
      if (fetchMatch) {
        // If we were parsing a message, add it to the list
        if (currentMessage && currentMessage.seq) {
          messages.push(currentMessage as ImapMessage);
        }
        
        // Start a new message
        currentMessage = {
          seq: parseInt(fetchMatch[1], 10),
          flags: [],
        };
        
        // Parse the message data
        try {
          const messageData = parsers.parseFetch([line]);
          
          // Add the parsed data to the current message
          if (messageData) {
            currentMessage = { ...currentMessage, ...messageData };
          }
        } catch (error) {
          console.warn("Failed to parse FETCH response:", error);
        }
      }
    }
    
    // Add the last message if we were parsing one
    if (currentMessage && currentMessage.seq) {
      messages.push(currentMessage as ImapMessage);
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
    useUid = false,
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
  async copyMessages(sequence: string, mailbox: string, useUid = false): Promise<void> {
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
  async moveMessages(sequence: string, mailbox: string, useUid = false): Promise<void> {
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
    date?: Date,
  ): Promise<void> {
    if (!this.connected) {
      throw new ImapNotConnectedError();
    }

    if (!this._authenticated) {
      await this.authenticate();
    }

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

    // Set command timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      this.commandTimeoutTimer = setTimeout(() => {
        reject(new ImapTimeoutError(command, this.options.commandTimeout || 30000));
        this.commandPromises.delete(tag);
      }, this.options.commandTimeout || 30000);
    });

    try {
      // Send the command
      await this.connection.writeLine(`${tag} ${command}`);

      // Wait for the response
      const responseLines: string[] = [];
      
      while (true) {
        const line = await Promise.race([this.connection.readLine(), timeoutPromise]);
        responseLines.push(line);
        
        if (line.startsWith(tag)) {
          // Command completed
          if (line.includes("OK")) {
            this.commandPromises.get(tag)?.resolve(responseLines);
          } else {
            this.commandPromises.get(tag)?.reject(new ImapCommandError(command, line));
          }
          
          this.commandPromises.delete(tag);
          break;
        }
      }

      // Clear timeout
      clearTimeout(this.commandTimeoutTimer);
      this.commandTimeoutTimer = undefined;

      return await commandPromise;
    } catch (error) {
      this.commandPromises.delete(tag);
      
      if (this.commandTimeoutTimer) {
        clearTimeout(this.commandTimeoutTimer);
        this.commandTimeoutTimer = undefined;
      }
      
      throw error;
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
      const line = await this.connection.readLine();
      responseLines.push(line);
      
      if (line.startsWith(tag)) {
        // Command completed
        if (!line.includes("OK")) {
          throw new ImapCommandError("command", line);
        }
        
        break;
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
} 