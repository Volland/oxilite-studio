## Purpose

The VS Code client of oxilite studio: commands, views and packaging around `oxilite studio-server`.

## ADDED Requirements

### Requirement: Server discovery
The extension SHALL run the binary named by `oxilite.server.path` when set, else the binary bundled
under `bin/`, with the `studio-server` argument, and SHALL show an error naming the setting when
neither exists.

#### Scenario: Development override
- **WHEN** `oxilite.server.path` points at a local build
- **THEN** that binary is started instead of the bundled one

### Requirement: Run a query
`oxilite: Run Query` SHALL send the active SPARQL document, or its selection, to `oxilite/query`
and render the payload in that document's results panel.

#### Scenario: Selection runs alone
- **WHEN** part of a `.rq` file is selected and the command runs
- **THEN** only the selected text is sent

#### Scenario: Error is shown
- **WHEN** the query does not parse
- **THEN** the panel shows the server's error message

### Requirement: Results render any payload
The results view SHALL render solutions, graph results and booleans as a table of formatted terms
and keep the last result across webview reloads.

#### Scenario: Construct results
- **WHEN** a CONSTRUCT query runs
- **THEN** the grid shows subject, predicate and object columns
