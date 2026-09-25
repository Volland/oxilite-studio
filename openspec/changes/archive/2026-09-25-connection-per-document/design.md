## Decisions

- **Kernels, not a custom picker.** VS Code's notebook kernel picker is where users already choose
  what a notebook runs on. One controller per connection is created and disposed as connections
  come and go; its id is derived from the connection id so VS Code's own per-notebook memory of
  the selected kernel keeps working.
- **Metadata stores a reference, not an id.** Connection ids contain absolute paths. The notebook
  stores `{ "oxilite": { "connection": "project" | "sqlite:<relative path>" | "d1:<account>/<database>" } }`
  so it travels with the repository; D1 tokens stay in VS Code's secret storage.
- **One pin syntax for every language.** `oxilite: connection = <target>` inside the first
  comment block of the file, found by a pure parser (`shared/pin.ts`) that knows each language's
  comment markers. Pinned SQLite files attach read-only unless the pin says `read-write`, because
  a pin is written once and run many times.
- **Attach without activating.** A pinned file or a notebook needing a connection must not switch
  the active connection under the user: the server's attach requests gain `activate` (default
  `true`, so existing callers keep their behaviour).

## Non-goals

Completion, hover and diagnostics for a pinned document still use the active connection's
vocabulary. Querying files and a database together (a "workspace graphs" overlay) is a separate
change.
