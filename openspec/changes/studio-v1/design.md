## Decisions

- **One webview bundle, two hosts.** Panels and the notebook renderer render the same React
  components; components reach their host only through `post`.
- **Single reusable panels** for the resource view, report, "why?", ontology, debugger and
  search; results stay one panel per query document.
- **Graph models are pure functions** in `shared/graph.ts`, tested without a webview.
