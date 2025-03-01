# IMAP Client Examples

This directory contains examples demonstrating how to use the IMAP client library.

## Setup

Before running any example, create a `.env` file in the root directory with your IMAP server credentials:

```
IMAP_HOST="your_imap_server"
IMAP_PORT=993
IMAP_USERNAME="your_username"
IMAP_PASSWORD="your_password"
IMAP_USE_TLS="true"
```

The `IMAP_USE_TLS` variable is optional and defaults to `true` if not specified.

## Available Examples

### Basic Connection

The basic example demonstrates how to connect to an IMAP server, authenticate, list mailboxes, and check the status of the INBOX.

```bash
deno run --allow-net --allow-env --env-file=.env examples/basic.ts
```

### Searching Messages

The search example demonstrates various ways to search for messages in a mailbox, including searching by flags, date, headers, and text content.

```bash
deno run --allow-net --allow-env --env-file=.env examples/search.ts
```

### Fetching Messages

The fetch example demonstrates how to fetch and display message details, including envelope information, flags, headers, and message body.

```bash
deno run --allow-net --allow-env --env-file=.env examples/fetch.ts
```

### Managing Mailboxes

The mailboxes example demonstrates how to manage mailboxes, including listing, creating, renaming, and deleting mailboxes.

```bash
deno run --allow-net --allow-env --env-file=.env examples/mailboxes.ts
```

## Notes

- All examples include proper error handling and ensure the connection is closed properly.
- The examples are designed to be simple and focused on specific functionality.
- You can use these examples as a starting point for your own IMAP client applications. 