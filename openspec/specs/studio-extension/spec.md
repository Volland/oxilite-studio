# studio-extension Specification

## Purpose
TBD - created by archiving change connection-per-document. Update Purpose after archive.

## Requirements

### Requirement: Notebooks run on their own connection
Every connection SHALL be offered as a notebook kernel, and a notebook's cells SHALL run on the
connection of its selected kernel, independently of the active connection.

#### Scenario: Active connection changes
- **WHEN** a notebook's kernel is "oxilite · Project store" and the user activates an attached
  database
- **THEN** running a cell still queries the Project store

### Requirement: Notebooks remember their connection
Selecting a kernel SHALL record a connection reference in the notebook's metadata, and opening a
notebook SHALL re-attach the referenced connection if needed and select its kernel unless one is already selected.

#### Scenario: Reopening a notebook
- **WHEN** a notebook saved with the connection `sqlite:data/prod.sqlite` is opened in a new window
- **THEN** `data/prod.sqlite` is attached without becoming active and its kernel is selected

### Requirement: Outputs name their connection
Every cell output SHALL record the connection that produced it and show it in the output header.

#### Scenario: Saved output
- **WHEN** a cell is run on "prod.sqlite" and the notebook is saved and reopened
- **THEN** the output header still names "prod.sqlite"

### Requirement: Query files pin a connection
A query file whose first comment block contains `oxilite: connection = <target>` SHALL run and
explain on that connection, attaching it first without making it active; an unpinned file SHALL
use the active connection.

#### Scenario: Pinned file
- **WHEN** `report.rq` starts with `# oxilite: connection = data/prod.sqlite` and the Project store
  is active
- **THEN** running it queries `data/prod.sqlite`, opened read-only, and the Project store stays
  active

#### Scenario: Pin syntax per language
- **WHEN** a Cypher file starts with `// oxilite: connection = project`
- **THEN** it runs on the Project store
