# oxilite studio demo

A small company knowledge graph: an ontology, people, a SHACL shape, Datalog rules, queries,
tests and a notebook. Open this folder in VS Code with oxilite studio installed.

- `demo.oxnb`: the tour as a notebook (SPARQL, Datalog and Cypher cells).
- `queries/people.rq`: `Cmd/Ctrl+Enter` runs it; nobody is typed `ex:Person`, the ontology makes them so.
- `ex:eve` has no name: with OWL 2 RL she is an employee, so a person, so `ex:PersonShape`
  flags her line in `data/people.ttl`.
- `rules/org.dl`: management chains and colleagues; open `ex:eve` in the resource view and
  ask **why?** she reports to Ada.
- `oxilite check` in this folder runs the tests in `oxilite.toml`.
- `queries/salaries.rq` starts with `# oxilite: connection = project`: a pinned file runs on
  that connection whatever is active. The notebook remembers its connection too: pick a kernel
  ("oxilite · Project store" or an attached database) in the top-right corner.
