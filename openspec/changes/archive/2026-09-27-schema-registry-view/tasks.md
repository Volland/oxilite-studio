## 1. Server (oxilite `studio-server-registry`)

- [x] 1.1 `oxilite/registry`: entries, graphs with sizes, asserted `owl:imports`, problems, system
      graph state, for any connection; test
- [x] 1.2 `oxilite/registryEdit`: register, addRole, map, activate, deactivate, unregister, drop,
      installSystemGraphs; confirmation and read-only rules; test
- [x] 1.3 Explorer graphs carry their registry role and targets; test

## 2. Extension

- [x] 2.1 `shared/registry.ts`: effective schemas per data graph and the mapping graph; unit tests
- [x] 2.2 `shared/graph.ts` classes on nodes and edges; graph view styles them and can select nodes
- [x] 2.3 Registry webview: mapping graph, registrations, per graph, problems, details and actions
- [x] 2.4 Commands and edit flows (pickers, confirmation, temporary edits on the Project store),
      refresh on store changes; explorer context menu
- [x] 2.5 End-to-end test against the server binary

## 3. Docs

- [x] 3.1 `lat.md` (architecture, tests, milestones) in both repositories; `lat check`
- [x] 3.2 README
