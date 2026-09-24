## Why

The studio's design (see `lat.md/decisions.md`) spans two repositories, a Rust language server,
React webviews and platform packaging. Milestone S0 proves that whole path end to end before any
feature is built on it.

## What Changes

- A VS Code extension that spawns `oxilite studio-server` (the bundled binary, or
  `oxilite.server.path`) through `vscode-languageclient`.
- SPARQL and Turtle language registrations with TextMate grammars.
- `oxilite: Run Query` (Cmd/Ctrl+Enter) on a `.rq` file or selection, showing results in a React
  webview beside the editor: a virtualized TanStack grid over the serializable payload.
- A status bar item with the Project store's triple count and load errors; click to reload.
- Watched RDF files reload the store; load errors appear in the Problems panel.
- A GitHub Actions workflow building the server per platform and a platform-specific VSIX.
- Server side: oxilite change `studio-server-skeleton`.

## Capabilities

### New Capabilities
- `studio-extension`: the VS Code client of oxilite studio.

## Impact

New repository content only: `src/`, `shared/`, `webview/`, `syntaxes/`, `test/`, CI.
