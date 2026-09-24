## Context

Decisions S2 (separate Rust server), S3 (Project store), S8 (React webviews, serializable
payloads) and S9 (server in oxilite, extension here, platform VSIXes) in `lat.md/decisions.md`.

## Decisions

- **Shared types in `shared/`.** The protocol and term formatting are imported by the extension
  host (esbuild, CommonJS) and the webview (Vite, ESM), so both render the same payload the same way.
- **esbuild for the host, Vite for webviews.** Vite builds with stable file names the panel's HTML
  links to under a nonce-based Content Security Policy.
- **A panel per query document, beside the editor.** A webview panel cannot dock in the bottom
  panel; a `WebviewView` there is shared by all documents, which conflicts with per-document
  results. Revisit when notebooks land.
- **End-to-end tests over the real binary** with `vscode-jsonrpc`, skipped when no binary exists,
  and run against the freshly built binary in CI.

## Non-goals

Completion, hover, explain, attached stores, reasoning, SHACL, paging (S1 and later).
