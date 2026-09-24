// oxilite studio: starts `oxilite studio-server` and wires its requests to commands and views.
// @lat: [[architecture#Process model]]
import * as vscode from 'vscode';
import { ResponseError, type LanguageClient } from 'vscode-languageclient/node';
import {
  Methods,
  NEEDS_CONFIRMATION,
  type Connection,
  type Description,
  type FromView,
  type Plan,
  type ProofNode,
  type Profile,
  type QueryParams,
  type QueryPayload,
  type StoreStatus,
  type ValidationReport,
} from '../shared/protocol';
import { summarize } from '../shared/terms';
import { createClient } from './client';
import { findServer } from './serverPath';
import { ConnectionsView } from './connectionsView';
import { ExplorerView } from './explorerView';
import { openLocation, SinglePanel } from './panels';
import { KgTests } from './testing';
import { NOTEBOOK_TYPE, OxNotebookController, OxNotebookSerializer } from './notebook';
import { fromOntology, type Ontology } from '../shared/graph';
import { QueryHistory, type HistoryEntry } from './history';
import { ResultsPanels } from './resultsPanel';

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  status.command = 'oxilite.selectConnection';
  status.text = '$(database) oxilite';
  status.show();
  const validation = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
  validation.command = 'oxilite.showValidationReport';
  const reasoning = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 8);
  reasoning.command = 'oxilite.setReasoning';
  const onViewMessage = (m: FromView) => {
    if (m.type === 'openResource') void vscode.commands.executeCommand('oxilite.openResource', m.iri);
    if (m.type === 'openLocation') void openLocation(m.location);
    if (m.type === 'why') void why(m);
  };
  const why = async (t: { s: unknown; p: unknown; o: unknown }) => {
    if (!client) return;
    try {
      const tree = await client.sendRequest<ProofNode>(Methods.why, t);
      whyPanel.show('Why?', { type: 'why', title: 'Why?', tree });
    } catch (e) {
      void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
  };
  const panels = new ResultsPanels(context.extensionUri, onViewMessage);
  const resource = new SinglePanel(context.extensionUri, 'oxilite.resource', onViewMessage);
  const reportPanel = new SinglePanel(context.extensionUri, 'oxilite.report', onViewMessage);
  const whyPanel = new SinglePanel(context.extensionUri, 'oxilite.why', onViewMessage);
  const tests = new KgTests(() => client);
  const diagram = new SinglePanel(context.extensionUri, 'oxilite.ontology', onViewMessage);
  const debugPanel = new SinglePanel(context.extensionUri, 'oxilite.debug', onViewMessage);
  const search = new SinglePanel(context.extensionUri, 'oxilite.search', onViewMessage);
  const notebooks = new OxNotebookController(() => client, () => connections.active?.path ?? 'the store');
  const messaging = vscode.notebooks.createRendererMessaging('oxilite-renderer');
  messaging.onDidReceiveMessage((e) => onViewMessage(e.message as FromView));
  const connections = new ConnectionsView();
  const history = new QueryHistory(context.workspaceState);
  const explorer = new ExplorerView(() => client);
  let project: StoreStatus | undefined;
  const refreshStatus = () => {
    showStatus(status, connections.active, project);
    if (project) {
      reasoning.text = `$(lightbulb) ${project.profile}`;
      reasoning.tooltip = project.manifest ? 'Reasoning profile (set in oxilite.toml)' : 'Reasoning profile: click to change';
      reasoning.show();
    }
  };

  context.subscriptions.push(
    status,
    validation,
    reasoning,
    panels,
    resource,
    reportPanel,
    whyPanel,
    tests,
    diagram,
    debugPanel,
    search,
    notebooks,
    vscode.workspace.registerNotebookSerializer(NOTEBOOK_TYPE, new OxNotebookSerializer()),
    vscode.window.registerTreeDataProvider('oxilite.connections', connections),
    vscode.window.registerTreeDataProvider('oxilite.explorer', explorer),
    vscode.window.registerTreeDataProvider('oxilite.history', history),
  );

  const d1Key = 'oxilite.d1Connections';
  const d1Secret = (account: string, database: string) => `oxilite.d1.${account}.${database}`;
  const attachD1 = async (account: string, database: string, readOnly: boolean): Promise<boolean> => {
    const token = await context.secrets.get(d1Secret(account, database));
    if (!client || !token) return false;
    connections.set(await client.sendRequest<Connection[]>(Methods.attachD1, { account, database, token, readOnly }));
    refreshStatus();
    return true;
  };
  const start = async (): Promise<void> => {
    client = createClient(context);
    if (!client) return;
    client.onNotification(Methods.storeChanged, (s: StoreStatus) => {
      project = s;
      explorer.refresh();
      void tests.refresh();
      void refreshConnections();
    });
    client.onNotification(Methods.connectionsChanged, (list: Connection[]) => {
      connections.set(list);
      explorer.refresh();
      refreshStatus();
    });
    client.onNotification(Methods.validationStarted, () => {
      validation.text = '$(sync~spin) SHACL';
      validation.show();
    });
    client.onNotification(Methods.validationChanged, (r: ValidationReport) => {
      showValidation(validation, r);
      reportPanel.update('SHACL report', { type: 'report', title: 'SHACL report', report: r });
    });
    await client.start();
    const profile = vscode.workspace.getConfiguration('oxilite').get<Profile>('reasoning.profile', 'none');
    project = await client.sendRequest<StoreStatus>(Methods.setReasoning, { profile });
    await refreshConnections();
    // D1 connections come back after a restart; their tokens live in the secret store.
    for (const d of context.workspaceState.get<{ account: string; database: string; readOnly: boolean }[]>(d1Key, [])) {
      await attachD1(d.account, d.database, d.readOnly).catch(() => undefined);
    }
  };
  const refreshConnections = async () => {
    if (!client) return;
    connections.set(await client.sendRequest<Connection[]>(Methods.connections));
    refreshStatus();
  };

  const run = async (text: string | undefined, document: vscode.TextDocument): Promise<void> => {
    if (!client || text === undefined) return;
    const title = document.uri.path.split('/').pop() ?? 'query';
    const panel = panels.show(document);
    panels.post(panel, { type: 'running', title });
    const limit = vscode.workspace.getConfiguration('oxilite').get<number>('query.rowLimit', 10000);
    const params: QueryParams = { query: text, limit };
    const method = document.languageId === 'datalog' ? Methods.datalog : document.languageId === 'cypher' ? Methods.cypher : Methods.query;
    try {
      const payload = await sendWithConfirmation<QueryParams, QueryPayload>(client, method, params, connections.active);
      if (!payload) {
        panels.post(panel, { type: 'error', title, message: 'Update cancelled.' });
        return;
      }
      panels.post(panel, { type: 'result', title, payload });
      await history.add({
        query: text,
        language: document.languageId,
        connection: connections.active?.label ?? 'Project store',
        time: Date.now(),
        summary: summarize(payload),
      });
    } catch (e) {
      panels.post(panel, { type: 'error', title, message: e instanceof Error ? e.message : String(e) });
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('oxilite.runQuery', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      // A selection runs on its own, so one file can hold several queries.
      await run(selectionOrAll(editor), editor.document);
    }),
    vscode.commands.registerCommand('oxilite.explainQuery', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !client) return;
      const title = `plan of ${editor.document.uri.path.split('/').pop()}`;
      const panel = panels.show(editor.document);
      try {
        const plan = await client.sendRequest<Plan>(Methods.explain, {
          query: selectionOrAll(editor),
          language: editor.document.languageId,
        });
        panels.post(panel, { type: 'plan', title, plan });
      } catch (e) {
        panels.post(panel, { type: 'error', title, message: e instanceof Error ? e.message : String(e) });
      }
    }),
    vscode.commands.registerCommand('oxilite.reloadStore', async () => {
      if (!client) return;
      status.text = '$(sync~spin) oxilite';
      project = await client.sendRequest<StoreStatus>(Methods.reload);
      await refreshConnections();
    }),
    vscode.commands.registerCommand('oxilite.restartServer', async () => {
      await client?.stop();
      await start();
    }),
    vscode.commands.registerCommand('oxilite.attachStore', async () => {
      if (!client) return;
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'SQLite databases': ['sqlite', 'sqlite3', 'db'], 'All files': ['*'] },
        openLabel: 'Attach',
      });
      if (!picked?.[0]) return;
      const mode = await vscode.window.showQuickPick(['Read-write', 'Read-only'], { placeHolder: 'Open the store' });
      if (!mode) return;
      connections.set(
        await client.sendRequest<Connection[]>(Methods.attach, { path: picked[0].fsPath, readOnly: mode === 'Read-only' }),
      );
      refreshStatus();
    }),
    vscode.commands.registerCommand('oxilite.detachStore', async (c?: Connection) => {
      const target = c ?? (await pickConnection(connections.all.filter((x) => x.kind !== 'project')));
      if (!client || !target) return;
      connections.set(await client.sendRequest<Connection[]>(Methods.detach, { id: target.id }));
      refreshStatus();
    }),
    vscode.commands.registerCommand('oxilite.activateConnection', async (c: Connection) => {
      if (!client) return;
      connections.set(await client.sendRequest<Connection[]>(Methods.activate, { id: c.id }));
      refreshStatus();
    }),
    vscode.commands.registerCommand('oxilite.selectConnection', async () => {
      const c = await pickConnection(connections.all);
      if (c) await vscode.commands.executeCommand('oxilite.activateConnection', c);
    }),
    vscode.commands.registerCommand('oxilite.openHistoryEntry', async (e: HistoryEntry) => {
      const doc = await vscode.workspace.openTextDocument({ language: e.language, content: e.query });
      await vscode.window.showTextDocument(doc);
    }),
    vscode.commands.registerCommand('oxilite.clearHistory', () => history.clear()),
    vscode.commands.registerCommand('oxilite.openResource', async (iri?: string) => {
      if (!client) return;
      const target = iri ?? (await iriAtCursor(client));
      if (!target) return;
      try {
        const description = await client.sendRequest<Description>(Methods.describe, { iri: target });
        resource.show(`Resource: ${target.replace(/^.*[/#]/, '')}`, { type: 'resource', title: target, description });
      } catch (e) {
        void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
      }
    }),
    vscode.commands.registerCommand('oxilite.showValidationReport', async () => {
      if (!client) return;
      const report = await client.sendRequest<ValidationReport>(Methods.validationReport);
      reportPanel.show('SHACL report', { type: 'report', title: 'SHACL report', report });
    }),
    vscode.commands.registerCommand('oxilite.validate', async () => {
      await client?.sendRequest(Methods.validate);
    }),
    vscode.commands.registerCommand('oxilite.setReasoning', async () => {
      if (!client) return;
      if (project?.manifest) {
        void vscode.window.showInformationMessage('The reasoning profile is set by oxilite.toml.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        [
          { label: 'none', detail: 'Asserted triples only' },
          { label: 'rdfs', detail: 'Query-time RDFS: subclasses, subproperties, domains and ranges' },
          { label: 'owlql', detail: 'Query-time RDFS plus inverse, symmetric and transitive properties' },
          { label: 'owl2rl', detail: 'Materialized OWL 2 RL closure (recomputed when data changes)' },
        ],
        { placeHolder: `Reasoning profile (now ${project?.profile ?? 'none'})` },
      );
      if (!picked) return;
      await vscode.workspace.getConfiguration('oxilite').update('reasoning.profile', picked.label, vscode.ConfigurationTarget.Workspace);
      project = await client.sendRequest<StoreStatus>(Methods.setReasoning, { profile: picked.label });
      explorer.refresh();
      refreshStatus();
    }),
    vscode.commands.registerCommand('oxilite.refreshExplorer', () => explorer.refresh()),
    vscode.commands.registerCommand('oxilite.attachD1', async () => {
      const account = await vscode.window.showInputBox({ prompt: 'Cloudflare account ID', ignoreFocusOut: true });
      if (!account) return;
      const database = await vscode.window.showInputBox({ prompt: 'D1 database ID (wrangler d1 list)', ignoreFocusOut: true });
      if (!database) return;
      const token = await vscode.window.showInputBox({
        prompt: 'API token with D1 read (and edit, for writes) permission; kept in VS Code\'s secret storage',
        password: true,
        ignoreFocusOut: true,
      });
      if (!token) return;
      const mode = await vscode.window.showQuickPick(['Read-only', 'Read-write'], { placeHolder: 'Open the database' });
      if (!mode) return;
      await context.secrets.store(d1Secret(account, database), token);
      try {
        await attachD1(account, database, mode === 'Read-only');
        const saved = context.workspaceState.get<{ account: string; database: string; readOnly: boolean }[]>(d1Key, []);
        await context.workspaceState.update(d1Key, [
          ...saved.filter((d) => !(d.account === account && d.database === database)),
          { account, database, readOnly: mode === 'Read-only' },
        ]);
      } catch (e) {
        void vscode.window.showErrorMessage(`D1: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
    vscode.commands.registerCommand('oxilite.attachLocalD1', async () => {
      if (!client) return;
      const files = await client.sendRequest<string[]>(Methods.localD1);
      if (!files.length) {
        void vscode.window.showInformationMessage('No local D1 database under .wrangler/state: run `wrangler dev` once.');
        return;
      }
      const path = files.length === 1 ? files[0] : await vscode.window.showQuickPick(files, { placeHolder: 'Local D1 database' });
      if (!path) return;
      connections.set(await client.sendRequest<Connection[]>(Methods.attach, { path, readOnly: true }));
      refreshStatus();
    }),
    vscode.commands.registerCommand('oxilite.materialize', async (c?: Connection) => {
      if (!client) return;
      const target = c ?? connections.active;
      try {
        const r = await sendWithConfirmation<object, { inferred: number; d1?: { rowsWritten: number } }>(
          client,
          Methods.materialize,
          { connection: target?.id },
          target,
        );
        if (r) {
          void vscode.window.showInformationMessage(
            `${r.inferred} inferred triples${r.d1 ? `; D1 wrote ${r.d1.rowsWritten} rows` : ''}.`,
          );
        }
      } catch (e) {
        void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
      }
    }),
    vscode.commands.registerCommand('oxilite.copyMcpConfig', async () => {
      const server = serverCommand(context);
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!server || !root) return;
      const config = { mcpServers: { oxilite: { command: server, args: ['mcp', '--root', root] } } };
      await vscode.env.clipboard.writeText(JSON.stringify(config, null, 2));
      void vscode.window.showInformationMessage('MCP config copied: paste it into .mcp.json (Claude Code) or your agent\'s settings.');
    }),
    vscode.lm.registerMcpServerDefinitionProvider('oxilite', {
      provideMcpServerDefinitions: () => {
        const server = serverCommand(context);
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return server && root ? [new vscode.McpStdioServerDefinition('oxilite', server, ['mcp', '--root', root])] : [];
      },
    }),
    vscode.commands.registerCommand('oxilite.newNotebook', async () => {
      const data = new vscode.NotebookData([
        new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, '# oxilite notebook\nCells run against the active connection.', 'markdown'),
        new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10', 'sparql'),
      ]);
      const doc = await vscode.workspace.openNotebookDocument(NOTEBOOK_TYPE, data);
      await vscode.window.showNotebookDocument(doc);
    }),
    vscode.commands.registerCommand('oxilite.showOntology', async () => {
      if (!client) return;
      const o = await client.sendRequest<Ontology>(Methods.ontology, {});
      diagram.show('Ontology', { type: 'graph', title: `Ontology: ${o.classes.length} classes`, graph: fromOntology(o) });
    }),
    vscode.commands.registerCommand('oxilite.debugRules', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!client || !editor || editor.document.languageId !== 'datalog') return;
      try {
        const d = await client.sendRequest<{ rules: never[]; plan: string; cap: number }>(Methods.datalogDebug, { program: editor.document.getText() });
        const title = `Rules in ${editor.document.uri.path.split('/').pop()}`;
        debugPanel.show(title, { type: 'debug', title, uri: editor.document.uri.toString(), ...d });
      } catch (e) {
        void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
      }
    }),
    vscode.commands.registerCommand('oxilite.textSearch', async () => {
      if (!client) return;
      const text = await vscode.window.showInputBox({ prompt: 'Words to find in string literals (word* matches prefixes)' });
      if (!text) return;
      const query = `PREFIX oxl: <https://oxilite.dev/ns#>\nSELECT ?s ?p ?o WHERE { ?s ?p ?o FILTER(isLiteral(?o) && oxl:textMatch(?o, ${JSON.stringify(text)})) } LIMIT 500`;
      try {
        const payload = await client.sendRequest<QueryPayload>(Methods.query, { query });
        search.show(`Search: ${text}`, { type: 'result', title: `"${text}"`, payload });
      } catch (e) {
        void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
      }
    }),
    vscode.commands.registerCommand('oxilite.updateSnapshot', (item?: vscode.TestItem) => tests.updateSnapshot(item)),
    vscode.commands.registerCommand('oxilite.importFile', async (uri?: vscode.Uri) => {
      if (!client) return;
      const file =
        uri ??
        (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { RDF: ['ttl', 'nt', 'nq', 'trig', 'n3', 'rdf', 'owl', 'jsonld'] } }))?.[0];
      if (!file) return;
      const graph = await vscode.window.showInputBox({ prompt: 'Graph to load into (empty: the default graph, or the file\'s own graphs)' });
      if (graph === undefined) return;
      try {
        const r = await sendWithConfirmation<object, { added: number; ephemeral: boolean }>(
          client,
          Methods.import,
          { path: file.fsPath, graph: graph || undefined },
          connections.active,
        );
        if (r) {
          void vscode.window.showInformationMessage(
            `Imported ${r.added} triples into ${connections.active?.label ?? 'the store'}${r.ephemeral ? ' (the Project store drops them on the next reload)' : ''}.`,
          );
        }
      } catch (e) {
        void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
      }
    }),
    vscode.commands.registerCommand('oxilite.exportStore', () => exportTo(client, undefined)),
    vscode.commands.registerCommand('oxilite.exportGraph', (node?: { iri?: string }) => exportTo(client, node?.iri)),
  );
  await start();
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}

function selectionOrAll(editor: vscode.TextEditor): string {
  return editor.selection.isEmpty ? editor.document.getText() : editor.document.getText(editor.selection);
}

/** Runs a query; an update on a persistent store asks first and is re-sent confirmed. */
async function sendWithConfirmation<P extends object, R>(
  client: LanguageClient,
  method: string,
  params: P,
  active: Connection | undefined,
): Promise<R | undefined> {
  try {
    return await client.sendRequest<R>(method, params);
  } catch (e) {
    if (!(e instanceof ResponseError) || e.code !== NEEDS_CONFIRMATION) throw e;
    const estimate = (e.data as { estimate?: string | null } | undefined)?.estimate;
    const answer = await vscode.window.showWarningMessage(
      `This changes ${active?.path ?? 'a persistent store'}. Run it?`,
      { modal: true, detail: estimate ? `D1 bills written rows: ${estimate}.` : undefined },
      'Run',
    );
    if (answer !== 'Run') return undefined;
    return client.sendRequest<R>(method, { ...params, confirmed: true });
  }
}

async function exportTo(client: LanguageClient | undefined, graph: string | undefined): Promise<void> {
  if (!client) return;
  const target = await vscode.window.showSaveDialog({
    filters: graph ? { Turtle: ['ttl'], 'N-Triples': ['nt'], 'RDF/XML': ['rdf'] } : { 'N-Quads': ['nq'], TriG: ['trig'] },
  });
  if (!target) return;
  try {
    await client.sendRequest(Methods.export, { path: target.fsPath, graph });
    void vscode.window.showInformationMessage(`Exported to ${target.fsPath}.`);
  } catch (e) {
    void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
  }
}

/** The server binary, for MCP definitions. */
function serverCommand(context: vscode.ExtensionContext): string | undefined {
  const setting = vscode.workspace.getConfiguration('oxilite').get<string>('server.path', '');
  return findServer(setting, context.extensionPath)?.command;
}

/** The IRI under the cursor in the active editor, if any. */
async function iriAtCursor(client: LanguageClient): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const iri = await client.sendRequest<string | null>('oxilite/iriAt', {
      textDocument: { uri: editor.document.uri.toString() },
      position: editor.selection.active,
    });
    if (iri) return iri;
  }
  return vscode.window.showInputBox({ prompt: 'IRI to open', placeHolder: 'http://example.org/resource' });
}

function showValidation(item: vscode.StatusBarItem, r: ValidationReport): void {
  if (r.conforms === null) {
    item.hide();
    return;
  }
  const violations = r.results.filter((x) => x.severity === 'violation').length;
  item.text = r.conforms ? '$(pass) SHACL' : `$(error) SHACL ${r.results.length}`;
  item.tooltip = r.error ?? (r.conforms ? 'The data conforms to the shapes' : `${violations} violations, ${r.results.length} results — click for the report`);
  item.show();
}

async function pickConnection(list: Connection[]): Promise<Connection | undefined> {
  const picked = await vscode.window.showQuickPick(
    list.map((c) => ({ label: c.label, description: c.path, detail: `${c.triples} triples`, c })),
    { placeHolder: 'Connection' },
  );
  return picked?.c;
}

function showStatus(item: vscode.StatusBarItem, active: Connection | undefined, project: StoreStatus | undefined): void {
  const broken = project?.files.filter((f) => f.error).length ?? 0;
  const label = active?.label ?? 'Project store';
  const triples = active ? active.triples : (project?.triples ?? 0);
  const size = triples === null ? 'D1' : triples.toLocaleString();
  item.text = `$(database) ${label}: ${size}${broken ? ` $(error) ${broken}` : ''}`;
  item.tooltip = `oxilite: ${active?.path ?? ''}\nClick to switch connection`;
}
