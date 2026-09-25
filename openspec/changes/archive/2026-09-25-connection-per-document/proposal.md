## Why

Every query file and every notebook cell runs against the one *active* connection. Attaching a
database makes it active, so a notebook written against the workspace files silently runs
against the database next time, and a saved output does not say where it came from. Query files
have no way to say which database they are for. `lat.md/architecture.md` even claimed a query
document can pin a connection; it could not.

## What Changes

- **Notebook kernels per connection.** Each connection (the Project store, every attached SQLite
  file, every D1 database) is a notebook kernel, "oxilite · <connection>", in VS Code's kernel
  picker. A notebook's cells run on its selected kernel's connection, whatever is active.
- **Notebooks remember their source.** Selecting a kernel records a connection reference in the
  notebook's metadata (`project`, a SQLite path relative to the workspace, or a D1
  `account/database`; never a token). Reopening the notebook re-attaches that connection if needed
  and selects its kernel.
- **Outputs say where they came from.** Each saved output records the connection that produced it,
  shown in the output header.
- **Query files pin a connection** with a header comment, `oxilite: connection = <target>`, in the
  language's comment syntax (`#` SPARQL, `%` or `#` Datalog, `//` Cypher). Targets: `project`, a
  SQLite path (read-only unless followed by `read-write`), or `d1:<account>/<database>`. Running or
  explaining a pinned file uses that connection, attaching it first without making it active. A
  CodeLens above the pin shows where the file runs. Unpinned files keep using the active
  connection.
- **Server:** `oxilite/attach` and `oxilite/attachD1` accept `activate: false`, so attaching for a
  pinned document or a notebook does not switch everyone else's connection (oxilite change
  `studio-attach-without-activate`).

## Capabilities

### Modified Capabilities
- `studio-extension`

## Impact

`shared/pin.ts` (new, pure), `src/notebook.ts`, `src/extension.ts`, `src/pins.ts` (new), and one
server request parameter. Completion and hover still follow the active connection.
