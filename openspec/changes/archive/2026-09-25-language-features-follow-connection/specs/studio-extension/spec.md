## ADDED Requirements

### Requirement: Language features reach the server
The server SHALL announce its capabilities at the top level of the `initialize` result, so that
the client syncs documents and requests completion, hover, definitions, symbols and diagnostics.

#### Scenario: Completing after a prefix
- **WHEN** the user types `?person ex:` in a SPARQL file in a workspace whose store uses
  `ex:reportsTo`
- **THEN** the suggestions include `ex:reportsTo` with its usage count, not only words from the file

### Requirement: Language features follow the document's connection
Completion, hover and vocabulary warnings for a pinned file or a notebook cell SHALL use the
vocabulary of the connection the document runs on. Other documents SHALL use the active
connection. Resolving a pin for this purpose SHALL NOT create a database or prompt the user.

#### Scenario: Pinned file completes from its database
- **WHEN** a SPARQL file is pinned to an existing `prod.sqlite` that uses `ex:source`, and the
  Project store is active
- **THEN** completing after `ex:` offers `ex:source` first

#### Scenario: Pin to a missing file
- **WHEN** a file is pinned to a SQLite path that does not exist
- **THEN** no database file is created and completion uses the active connection
