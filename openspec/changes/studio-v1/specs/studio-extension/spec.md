## ADDED Requirements

### Requirement: Explain inferences from the resource view
The resource view SHALL mark inferred statements with their producers and offer "why?",
which opens the proof tree.

#### Scenario: Inferred type
- **WHEN** a resource's type is inferred through a subclass axiom
- **THEN** its row is badged as inferred and "why?" shows the subclass rule and its premises

### Requirement: Notebooks keep their results
A `.oxnb` notebook SHALL save cell outputs as result payloads and render them with the same
views as the results panel.

#### Scenario: Reopening a notebook
- **WHEN** a notebook with run cells is saved and reopened
- **THEN** its tables and graphs are shown without running the cells again
