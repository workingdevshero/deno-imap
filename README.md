![deno-imap](https://github.com/user-attachments/assets/7b2e53ac-4b29-4070-a72d-8c23e8d0ac47)

# deno-imap

A modern IMAP (Internet Message Access Protocol) client for Deno.

## Features

- Full IMAP protocol support
- TLS/SSL support
- Authentication (PLAIN, LOGIN)
- Mailbox management (list, create, delete, rename)
- Message operations (search, fetch, move, copy, delete)
- Flag management (mark as read/unread, flag/unflag)
- Comprehensive TypeScript types
- Promise-based API
- Utility functions for common operations

## Installation

You can import the module directly from the JSR registry:

```typescript
import { ImapClient } from "jsr:@bobbyg603/deno-imap";
```

Or import it from GitHub:

```typescript
import { ImapClient } from "https://raw.githubusercontent.com/bobbyg603/deno-imap/main/mod.ts";
```

## Basic Usage

```typescript
import { ImapClient } from "jsr:@bobbyg603/deno-imap";

// Create a new IMAP client
const client = new ImapClient({
  host: "imap.example.com",
  port: 993,
  tls: true,
  username: "user@example.com",
  password: "password",
});

// Connect and authenticate
await client.connect();
await client.authenticate();

// List mailboxes
const mailboxes = await client.listMailboxes();
console.log("Available mailboxes:", mailboxes);

// Select a mailbox
const inbox = await client.selectMailbox("INBOX");
console.log("INBOX has", inbox.exists, "messages");

// Search for unread messages
const unreadMessages = await client.search({ flags: { has: ["\\Unseen"] } });
console.log("Unread message IDs:", unreadMessages);

// Fetch messages (safely handling mailboxes with fewer than 10 messages)
const messageCount = inbox.exists || 0;
const fetchRange = messageCount > 0 ? `1:${Math.min(messageCount, 10)}` : "1";

const messages = await client.fetch(fetchRange, { 
  envelope: true, 
  headers: ["Subject", "From", "Date"] 
});

// Display message details
for (const message of messages) {
  console.log("Message #", message.seq);
  console.log("Subject:", message.envelope?.subject);
  console.log("From:", message.envelope?.from?.[0]?.mailbox + "@" + message.envelope?.from?.[0]?.host);
  console.log("Date:", message.envelope?.date);
}

// Disconnect
client.disconnect();
```

## Using Environment Variables

For security and flexibility, you can store your IMAP connection details in environment variables:

```typescript
const client = new ImapClient({
  host: Deno.env.get("IMAP_HOST")!,
  port: parseInt(Deno.env.get("IMAP_PORT")!),
  tls: Deno.env.get("IMAP_USE_TLS") !== "false",
  username: Deno.env.get("IMAP_USERNAME")!,
  password: Deno.env.get("IMAP_PASSWORD")!,
});
```

Create a `.env` file with your connection details:

```
IMAP_HOST="imap.example.com"
IMAP_PORT=993
IMAP_USERNAME="user@example.com"
IMAP_PASSWORD="your_password_here"
IMAP_USE_TLS="true"
```

Then run your script with the `--env-file` flag:

```bash
deno run --allow-net --allow-env --env-file=.env your_script.ts
```

## Utility Functions

The package includes utility functions for common operations:

```typescript
import { 
  ImapClient,
  fetchUnreadMessages, 
  fetchMessagesFromSender,
  markMessagesAsRead,
  deleteMessages
} from "jsr:@bobbyg603/deno-imap";

const client = new ImapClient({
  host: "imap.example.com",
  port: 993,
  tls: true,
  username: "user@example.com",
  password: "password",
});

await client.connect();
await client.authenticate();

// Fetch unread messages
const unreadMessages = await fetchUnreadMessages(client, "INBOX");

// Fetch messages from a specific sender
const messagesFromSender = await fetchMessagesFromSender(
  client, 
  "INBOX", 
  "sender@example.com"
);

// Mark messages as read using UIDs (more reliable than sequence numbers)
await markMessagesAsRead(
  client, 
  "INBOX", 
  messagesFromSender.map(msg => msg.uid || 0).filter(uid => uid > 0),
  true // Use UIDs instead of sequence numbers
);

// Delete messages
await deleteMessages(
  client, 
  "INBOX", 
  unreadMessages.slice(0, 5).map(msg => msg.uid || 0).filter(uid => uid > 0),
  true // Use UIDs instead of sequence numbers
);

client.disconnect();
```

## API Reference

### ImapClient

The main class for interacting with IMAP servers.

#### Constructor

```typescript
new ImapClient(options: ImapOptions)
```

#### Options

- `host`: IMAP server hostname
- `port`: IMAP server port
- `tls`: Whether to use TLS
- `username`: Username for authentication
- `password`: Password for authentication
- `authMechanism`: Authentication mechanism to use (default: "PLAIN")
- `autoConnect`: Whether to automatically connect on client creation (default: true)
- `autoReconnect`: Whether to automatically reconnect on connection loss (default: true)
- `maxReconnectAttempts`: Maximum number of reconnection attempts (default: 3)
- `reconnectDelay`: Delay between reconnection attempts in milliseconds (default: 1000)
- `commandTimeout`: Timeout for commands in milliseconds (default: 30000)
- `connectionTimeout`: Connection timeout in milliseconds (default: 30000)
- `socketTimeout`: Socket timeout in milliseconds (default: 60000)
- `tlsOptions`: TLS options

#### Methods

- `connect()`: Connects to the IMAP server
- `disconnect()`: Disconnects from the IMAP server
- `authenticate(mechanism?: ImapAuthMechanism)`: Authenticates with the IMAP server
- `listMailboxes(reference?: string, mailbox?: string)`: Lists mailboxes
- `getMailboxStatus(mailbox: string, items?: string[])`: Gets the status of a mailbox
- `selectMailbox(mailbox: string)`: Selects a mailbox
- `examineMailbox(mailbox: string)`: Examines a mailbox (read-only mode)
- `closeMailbox()`: Closes the currently selected mailbox
- `createMailbox(mailbox: string)`: Creates a new mailbox
- `deleteMailbox(mailbox: string)`: Deletes a mailbox
- `renameMailbox(oldName: string, newName: string)`: Renames a mailbox
- `subscribeMailbox(mailbox: string)`: Subscribes to a mailbox
- `unsubscribeMailbox(mailbox: string)`: Unsubscribes from a mailbox
- `search(criteria: ImapSearchCriteria, charset?: string)`: Searches for messages
- `fetch(sequence: string, options: ImapFetchOptions)`: Fetches messages
- `setFlags(sequence: string, flags: string[], action?: "set" | "add" | "remove", useUid?: boolean)`: Sets flags on messages
- `copyMessages(sequence: string, mailbox: string, useUid?: boolean)`: Copies messages to another mailbox
- `moveMessages(sequence: string, mailbox: string, useUid?: boolean)`: Moves messages to another mailbox
- `expunge()`: Expunges deleted messages
- `appendMessage(mailbox: string, message: string, flags?: string[], date?: Date)`: Appends a message to a mailbox

#### Properties

- `connected`: Whether the client is connected
- `authenticated`: Whether the client is authenticated
- `capabilities`: Server capabilities
- `selectedMailbox`: Currently selected mailbox

## Examples

The [examples](./examples) directory contains sample code demonstrating how to use the IMAP client:

- [Basic Example](./examples/basic.ts): Demonstrates connecting to an IMAP server, listing mailboxes, and checking the INBOX status.
- [Search Example](./examples/search.ts): Shows how to search for messages using various criteria.
- [Fetch Example](./examples/fetch.ts): Demonstrates how to fetch and decode message content, including handling multipart messages and different encodings.
- [Mailboxes Example](./examples/mailboxes.ts): Shows how to manage mailboxes, including creating, renaming, and deleting them.
- [Advanced Example](./examples/advanced.ts): Shows more advanced features like searching, fetching message content, and manipulating messages.

To run the examples, create a `.env` file with your IMAP server details, then run:

```bash
# Run the basic example
deno run --allow-net --allow-env --env-file=.env examples/basic.ts

# Run the search example
deno run --allow-net --allow-env --env-file=.env examples/search.ts

# Run the fetch example
deno run --allow-net --allow-env --env-file=.env examples/fetch.ts

# Run the mailboxes example
deno run --allow-net --allow-env --env-file=.env examples/mailboxes.ts

# Run the advanced example
deno run --allow-net --allow-env --env-file=.env examples/advanced.ts
```

## License

MIT 
