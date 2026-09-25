## Why

In VS Code, SPARQL, Turtle, Datalog, Cypher and ShEx files got no completion, hover,
go-to-definition, outline or live diagnostics. Only word-based suggestions appeared. The server
nested its `initialize` capabilities one level too deep (`{"capabilities":{"capabilities":…}}`),
so the client saw none and never synced documents. Custom requests such as run and explain were
unaffected, which hid the bug. Tests that called the server directly missed it too.

Once language features work, a pinned file or a notebook cell should complete from the store it
runs on, not from the active connection. The `connection-per-document` change left that out.

## What Changes

- **Server:** `initialize` returns the capabilities at the top level (oxilite change
  `studio-initialize-capabilities`), with a regression test.
- **Server:** a new `oxilite/documentConnection` notification (`uri`, `connection` or null) names
  a document's connection. Completion, hover and vocabulary warnings for that document use it,
  falling back to the active connection when it is closed or unnamed. Cypher queries on a named
  connection resolve names against that connection's vocabulary, not the active one's.
- **Extension:** sends the connection of every pinned file (on open and on edit, debounced) and of
  every notebook cell (from the notebook's selected kernel). A pin is attached in the background
  only if that needs no prompt and creates nothing: the SQLite file exists, or a D1 token is
  saved. Concurrent attaches of the same target are merged.

## Capabilities

### Modified Capabilities

- `studio-extension`: language features follow the document's connection.

## Impact

`src/pins.ts` (`DocumentConnections`, `attachableQuietly`, deduplicated `ensureConnection`),
`src/notebook.ts` (`connectionOf`, `onDidChangeConnection`), `src/extension.ts`,
`shared/protocol.ts`. Version 0.1.3.
