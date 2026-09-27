// The Schema Registry panel of a connection, and the edits it asks for: pickers for roles and
// targets, confirmation on persistent stores, and a refresh after each change.
// @lat: [[architecture#Views#Schema registry view]]
import * as vscode from 'vscode';
import { ResponseError, type LanguageClient } from 'vscode-languageclient/node';
import {
  Methods,
  type Connection,
  type Registry,
  type RegistryEditParams,
  type RegistryEditResult,
  type RegistryOp,
  type SchemaRole,
} from '../shared/protocol';
import { ALL_GRAPHS, DEFAULT_GRAPH, dataGraphs, graphLabel, schemaGraphs } from '../shared/registry';
import { sendWithConfirmation } from './confirm';
import type { SinglePanel } from './panels';

const ROLES: (vscode.QuickPickItem & { role: SchemaRole })[] = [
  { label: 'Ontology', description: 'RDFS / OWL axioms for query-time reasoning', role: 'ontology' },
  { label: 'SHACL shapes', description: 'shapes for validation and the Cypher shape index', role: 'shacl' },
  { label: 'ShEx schema', description: 'recorded and hidden; nothing compiles it', role: 'shex' },
];

/** JSON-RPC's "method not found": a server older than the registry requests. */
const METHOD_NOT_FOUND = -32601;

export class RegistryController {
  /** The connection the panel shows. */
  private connection: string | undefined;
  private registry: Registry | undefined;

  constructor(
    private readonly panel: SinglePanel,
    private readonly client: () => LanguageClient | undefined,
    private readonly connections: () => Connection[],
  ) {}

  private get target(): Connection | undefined {
    const all = this.connections();
    return all.find((c) => c.id === this.connection) ?? all.find((c) => c.active);
  }

  private title(): string {
    return `Schema registry · ${this.target?.label ?? 'Project store'}`;
  }

  /** Opens the panel on a connection (the active one by default). */
  async show(connection?: Connection): Promise<void> {
    this.connection = (connection ?? this.connections().find((c) => c.active))?.id;
    await this.load(true);
  }

  /** Reloads the panel if it is open (the store or the connections changed). */
  async refresh(): Promise<void> {
    if (!this.panel.isOpen) return;
    // A detached connection falls back to the active one.
    if (!this.connections().some((c) => c.id === this.connection)) this.connection = undefined;
    await this.load(false);
  }

  private async load(reveal: boolean): Promise<void> {
    const client = this.client();
    if (!client) return;
    const title = this.title();
    const show = reveal ? this.panel.show.bind(this.panel) : this.panel.update.bind(this.panel);
    try {
      this.registry = await client.sendRequest<Registry>(Methods.registry, { connection: this.target?.id });
      show(title, { type: 'registry', title, registry: this.registry });
    } catch (e) {
      const message =
        e instanceof ResponseError && e.code === METHOD_NOT_FOUND
          ? 'This oxilite server has no schema registry requests. Update oxilite, or point "oxilite.server.path" at a newer build.'
          : e instanceof Error ? e.message : String(e);
      show(title, { type: 'error', title, message });
    }
  }

  /** A message from the view: an edit on a graph, a refresh, or opening the manifest. */
  async handle(op: RegistryOp | 'refresh' | 'openManifest', graph?: string): Promise<void> {
    if (op === 'refresh') return this.load(false);
    if (op === 'openManifest') return openManifest();
    const client = this.client();
    if (!client) return;
    if (!this.registry) await this.load(false);
    const registry = this.registry;
    if (!registry) return;
    try {
      const params = await this.ask(op, registry, graph);
      if (!params) return;
      const target = this.target;
      const request: RegistryEditParams = { ...params, connection: target?.id };
      // Drop asked already, naming what it deletes.
      const result = request.confirmed
        ? await client.sendRequest<RegistryEditResult>(Methods.registryEdit, request)
        : await sendWithConfirmation<RegistryEditParams, RegistryEditResult>(client, Methods.registryEdit, request, target);
      if (!result) return;
      if (!result.changed) {
        void vscode.window.showInformationMessage(
          op === 'installSystemGraphs' ? 'The system graphs are already current.' : `${graphLabel(params.graph ?? '')} is not registered.`,
        );
      }
      if (result.ephemeral) {
        void vscode.window
          .showInformationMessage('Changed the Project store\'s registry until the next reload: oxilite.toml defines it.', 'Open oxilite.toml')
          .then((a) => (a ? openManifest() : undefined));
      }
    } catch (e) {
      void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
    await this.load(false);
  }

  /** Collects what an edit needs; undefined when the user cancels. */
  private async ask(op: RegistryOp, registry: Registry, graph?: string): Promise<Omit<RegistryEditParams, 'connection'> | undefined> {
    const schema = schemaGraphs(registry).find((s) => s.graph === graph);
    switch (op) {
      case 'register': {
        const g = graph ?? (await pickGraph(registry));
        if (!g) return undefined;
        const role = await pickRole(`Register ${graphLabel(g)} as`);
        if (!role) return undefined;
        const appliesTo = await pickTargets(registry, g, []);
        return appliesTo && { op, graph: g, role, appliesTo };
      }
      case 'addRole': {
        const role = await pickRole(`Add a role to ${graphLabel(graph ?? '')}`, schema?.roles);
        return role && { op, graph, role };
      }
      case 'map': {
        const appliesTo = await pickTargets(registry, graph ?? '', schema?.appliesTo ?? []);
        return appliesTo && { op, graph, appliesTo };
      }
      case 'drop': {
        const n = schema?.triples;
        const answer = await vscode.window.showWarningMessage(
          `Drop ${graphLabel(graph ?? '')}?`,
          { modal: true, detail: `Deletes the registration and ${n === null || n === undefined ? 'every triple' : `the ${n.toLocaleString()} triples`} of <${graph}> from ${this.target?.path ?? 'the store'}.` },
          'Drop',
        );
        return answer === 'Drop' ? { op, graph, confirmed: true } : undefined;
      }
      default:
        return { op, graph };
    }
  }
}

async function pickRole(placeHolder: string, has: SchemaRole[] = []): Promise<SchemaRole | undefined> {
  const picked = await vscode.window.showQuickPick(ROLES.filter((r) => !has.includes(r.role)), { placeHolder });
  return picked?.role;
}

/** A graph of the store that is not registered yet, or an IRI typed in. */
async function pickGraph(registry: Registry): Promise<string | undefined> {
  const other = '$(edit) Another graph IRI…';
  const items = dataGraphs(registry)
    .filter((d) => !d.missing && d.graph !== DEFAULT_GRAPH)
    .map((d) => ({ label: graphLabel(d.graph), description: d.graph, detail: d.triples === null ? undefined : `${d.triples.toLocaleString()} triples`, graph: d.graph }));
  const picked = await vscode.window.showQuickPick([...items, { label: other, graph: '' }], { placeHolder: 'Graph to register as schema' });
  if (!picked) return undefined;
  if (picked.label !== other) return picked.graph;
  return vscode.window.showInputBox({
    prompt: 'Graph IRI (it is created empty if it does not exist)',
    validateInput: (v) => (/^[a-z][a-z0-9+.-]*:\S+$/i.test(v) ? undefined : 'An absolute IRI'),
  });
}

/** The graphs a schema applies to: "All graphs" or a selection; undefined when cancelled. */
async function pickTargets(registry: Registry, schema: string, current: string[]): Promise<string[] | undefined> {
  const all = { label: 'All graphs', description: 'oxl:AllGraphs: every graph, now and later', graph: ALL_GRAPHS, picked: current.length === 0 };
  const registered = new Set(registry.entries.map((e) => e.graph));
  const graphs = new Set([...dataGraphs(registry).map((d) => d.graph), ...current, DEFAULT_GRAPH]);
  const items = [...graphs]
    .filter((g) => g !== schema && !registered.has(g))
    .map((g) => ({ label: graphLabel(g), description: g === DEFAULT_GRAPH ? 'oxl:DefaultGraph' : g, graph: g, picked: current.includes(g) }));
  const picked = await vscode.window.showQuickPick([all, ...items], {
    canPickMany: true,
    placeHolder: `Graphs ${graphLabel(schema)} applies to (All graphs wins over a selection)`,
  });
  if (!picked) return undefined;
  if (!picked.length || picked.some((p) => p.graph === ALL_GRAPHS)) return [ALL_GRAPHS];
  return picked.map((p) => p.graph);
}

async function openManifest(): Promise<void> {
  const [manifest] = await vscode.workspace.findFiles('oxilite.toml', undefined, 1);
  if (manifest) await vscode.window.showTextDocument(manifest);
  else void vscode.window.showInformationMessage('No oxilite.toml: without a manifest the Project store registers nothing.');
}
