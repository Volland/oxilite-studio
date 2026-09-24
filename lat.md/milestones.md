# Milestones

Delivery plan for oxilite studio. Each milestone ships a usable VSIX and gets an OpenSpec change before work starts.

## S0 Walking skeleton

The server over LSP, the extension client, a convention-loaded Project store, running a `.rq` file into the React grid, and a platform VSIX from CI.

Proves the whole path: Rust, LSP, TypeScript, webview and packaging. See [[architecture#Process model]] and [[architecture#Packaging]].

Status: done (2026-09-24). Server in oxilite (OpenSpec change `studio-server-skeleton`), extension here (`s0-walking-skeleton`). Known limits: queries block the server (no cancellation), a full reload on every watched change, results capped instead of paged.

## S1 Query workbench

SPARQL and Turtle diagnostics, store-driven completion, hover and go-to-definition, the explain view, query history and attached `.sqlite` stores.

Delivers the app-developer loop. See [[architecture#Language support]] and [[architecture#Connections]].

Status: done (2026-09-24). Explain shows the compiled SQL and planner notes as text; a structured plan tree is left for later.

## S2 Modelling loop

The manifest, the per-file reload pipeline with cancellation, reasoning levels, Store Explorer, resource view and live SHACL diagnostics.

The headline demo for modellers. See [[architecture#Reload pipeline]] and [[architecture#Validation]].

Status: done (2026-09-24). Pulled forward from S4: producer attribution of inferences in oxilite core, needed for OWL 2 RL and rules to coexist. Materialization itself runs on the server's main thread; only validation and reads are backgrounded.

## S3 Rules and graphs

Datalog and Cypher language support, the graph view, and import and export.

See [[architecture#Language support]] and [[architecture#Views]].

Status: done (2026-09-24).

## S4 Trust

Producer provenance and justification in oxilite core, "Why?" across views, `oxilite check` and manifest tests in Test Explorer.

The core design starts as an OpenSpec change in oxilite in parallel with S1 to S3, since it is the largest unknown. See [[architecture#Reasoning and provenance]] and [[architecture#Testing]].

Status: done (2026-09-24). Provenance landed with S2. Justifications use rule templates for OWL 2 RL and RDFS, so an OWL 2 RL conclusion outside the templates (class expressions, property chains) is reported without premises.

## S5 Edge and agents

Local and remote D1 attached stores with cost guards, and the MCP tools.

See [[architecture#Connections]] and [[architecture#Agent tools]].

Status: done (2026-09-24). The D1 backend is tested against a stand-in for the `/raw` endpoint, not against Cloudflare itself.

## v1.1 Follow-ups

Notebooks, the ontology diagram, a Datalog debugger, full-text search UI and ShEx validation.

Status: done (2026-09-24).

Deferred further (v2): JSON-LD and Verifiable Credentials browsing, schema diff, in-editor chat, generic SPARQL endpoints, W3C `mf:` test manifests.
