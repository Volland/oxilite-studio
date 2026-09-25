// oxilite notebooks (`.oxnb`): SPARQL, Datalog and Cypher cells run on the connection of the
// notebook's kernel (one kernel per connection), remembered in the notebook's metadata. Outputs
// are the serializable payloads the results panel shows, with the connection that produced them.
// @lat: [[architecture#Views#Notebooks]]
import * as vscode from 'vscode';
import { ResponseError, type LanguageClient } from 'vscode-languageclient/node';
import { Methods, NEEDS_CONFIRMATION, type Connection, type QueryPayload } from '../shared/protocol';
import { refFromConnection, refFromString, refToString, type ConnectionRef } from '../shared/pin';
import { summarize } from '../shared/terms';
import { ensureConnection, workspaceRoot } from './pins';

export const NOTEBOOK_TYPE = 'oxilite-notebook';
export const MIME = 'application/vnd.oxilite.result+json';
const EXTENSION_ID = 'pavlyshyn.oxilite-studio';

interface SavedOutput {
  title: string;
  payload: QueryPayload;
  /** The connection that produced it. */
  connection?: string;
}

interface RawCell {
  kind: 'markdown' | 'code';
  language: string;
  value: string;
  outputs?: SavedOutput[];
}

interface RawNotebook {
  cells: RawCell[];
  metadata?: Record<string, unknown>;
}

/** JSON on disk, outputs included, so a saved notebook reopens with its results. */
export class OxNotebookSerializer implements vscode.NotebookSerializer {
  deserializeNotebook(content: Uint8Array): vscode.NotebookData {
    const text = new TextDecoder().decode(content);
    const raw: RawNotebook = text.trim() ? JSON.parse(text) : { cells: [] };
    const cells = raw.cells.map((c) => {
      const cell = new vscode.NotebookCellData(
        c.kind === 'markdown' ? vscode.NotebookCellKind.Markup : vscode.NotebookCellKind.Code,
        c.value,
        c.kind === 'markdown' ? 'markdown' : c.language,
      );
      cell.outputs = (c.outputs ?? []).map((o) => output(o));
      return cell;
    });
    const data = new vscode.NotebookData(cells);
    data.metadata = raw.metadata;
    return data;
  }

  serializeNotebook(data: vscode.NotebookData): Uint8Array {
    const raw: RawNotebook = {
      metadata: data.metadata,
      cells: data.cells.map((c) => ({
        kind: c.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'code',
        language: c.languageId,
        value: c.value,
        outputs: (c.outputs ?? []).flatMap((o) =>
          o.items
            .filter((i) => i.mime === MIME)
            .map((i) => JSON.parse(new TextDecoder().decode(i.data)) as SavedOutput),
        ),
      })),
    };
    return new TextEncoder().encode(JSON.stringify(raw, null, 1));
  }
}

function output(o: SavedOutput): vscode.NotebookCellOutput {
  return new vscode.NotebookCellOutput([
    vscode.NotebookCellOutputItem.json(o, MIME),
    vscode.NotebookCellOutputItem.text(`${summarize(o.payload)}${o.connection ? ` · ${o.connection}` : ''}`),
  ]);
}

/** The connection reference a notebook's metadata names, if any. */
export function notebookRef(notebook: vscode.NotebookDocument): ConnectionRef | undefined {
  const meta = notebook.metadata as { oxilite?: { connection?: unknown } } | undefined;
  return refFromString(meta?.oxilite?.connection);
}

/** One notebook kernel per connection, so a notebook runs on the connection it chose whatever
 * is active; the choice is saved in the notebook and restored when it is opened. */
export class OxNotebookKernels implements vscode.Disposable {
  private readonly kernels = new Map<string, vscode.NotebookController>();
  private readonly order = new Map<string, number>();
  private connections: Connection[] = [];
  /** Notebooks waiting for a kernel that does not exist yet, by connection id. */
  private readonly preferred = new Map<string, Set<vscode.NotebookDocument>>();
  private readonly disposables: vscode.Disposable[] = [];
  /** The kernel each open notebook has selected, by notebook uri. */
  private readonly selected = new Map<string, string>();

  constructor(
    private readonly client: () => LanguageClient | undefined,
    private readonly secrets: vscode.SecretStorage,
    private readonly attached: (list: Connection[]) => void,
  ) {
    this.disposables.push(
      vscode.workspace.onDidOpenNotebookDocument((nb) => void this.restore(nb)),
      vscode.window.onDidChangeActiveNotebookEditor((editor) => editor && void this.restore(editor.notebook)),
    );
  }

  /** Creates and disposes kernels to match the connections. */
  sync(connections: Connection[]): void {
    this.connections = connections;
    const ids = new Set(connections.map((c) => c.id));
    for (const [id, k] of this.kernels) {
      if (!ids.has(id)) {
        k.dispose();
        this.kernels.delete(id);
      }
    }
    for (const c of connections) {
      const existing = this.kernels.get(c.id);
      if (existing) {
        existing.label = `oxilite · ${c.label}`;
        continue;
      }
      // The Project store keeps the kernel id notebooks used before kernels were per connection.
      const kernelId = c.id === 'project' ? 'oxilite-kernel' : `oxilite-kernel:${c.id}`;
      const k = vscode.notebooks.createNotebookController(kernelId, NOTEBOOK_TYPE, `oxilite · ${c.label}`);
      k.description = c.kind === 'project' ? 'workspace files' : c.path;
      k.supportedLanguages = ['sparql', 'datalog', 'cypher'];
      k.supportsExecutionOrder = true;
      k.executeHandler = (cells, notebook) => this.execute(k, c.id, cells, notebook);
      k.onDidChangeSelectedNotebooks(({ notebook, selected }) => {
        const key = notebook.uri.toString();
        if (selected) {
          this.selected.set(key, kernelId);
          void this.remember(notebook, c.id);
        } else if (this.selected.get(key) === kernelId) this.selected.delete(key);
      });
      this.kernels.set(c.id, k);
      for (const nb of this.preferred.get(c.id) ?? []) k.updateNotebookAffinity(nb, vscode.NotebookControllerAffinity.Preferred);
      this.preferred.delete(c.id);
    }
    for (const nb of vscode.workspace.notebookDocuments) void this.restore(nb);
  }

  /** Re-attaches the connection a notebook names and prefers its kernel. */
  private async restore(notebook: vscode.NotebookDocument): Promise<void> {
    if (notebook.notebookType !== NOTEBOOK_TYPE) return;
    const ref = notebookRef(notebook);
    const client = this.client();
    if (!ref || !client) return;
    try {
      const c = ref.kind === 'project' ? this.connections.find((x) => x.id === 'project') : await ensureConnection(client, ref, () => this.connections, this.secrets, this.attached);
      if (!c) return;
      const k = this.kernels.get(c.id);
      if (k) {
        k.updateNotebookAffinity(notebook, vscode.NotebookControllerAffinity.Preferred);
        // With several kernels VS Code only suggests the preferred one, so pick it when the notebook has none yet.
        const editor = vscode.window.activeNotebookEditor;
        if (!this.selected.has(notebook.uri.toString()) && editor?.notebook === notebook) {
          await vscode.commands.executeCommand('notebook.selectKernel', { id: k.id, extension: EXTENSION_ID });
        }
      } else this.preferred.set(c.id, new Set([...(this.preferred.get(c.id) ?? []), notebook]));
    } catch (e) {
      void vscode.window.showWarningMessage(`${notebook.uri.path.split('/').pop()}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Saves the selected kernel's connection in the notebook's metadata. */
  private async remember(notebook: vscode.NotebookDocument, id: string): Promise<void> {
    const c = this.connections.find((x) => x.id === id);
    const ref = c && refFromConnection(c, workspaceRoot());
    if (!ref) return;
    const value = refToString(ref);
    const meta = { ...(notebook.metadata ?? {}) } as Record<string, unknown>;
    const current = (meta.oxilite as { connection?: string } | undefined)?.connection;
    if (current === value) return;
    meta.oxilite = { ...((meta.oxilite as object) ?? {}), connection: value };
    const edit = new vscode.WorkspaceEdit();
    edit.set(notebook.uri, [vscode.NotebookEdit.updateNotebookMetadata(meta)]);
    await vscode.workspace.applyEdit(edit);
  }

  private async execute(kernel: vscode.NotebookController, connection: string, cells: vscode.NotebookCell[], notebook: vscode.NotebookDocument): Promise<void> {
    const label = this.connections.find((c) => c.id === connection)?.label ?? connection;
    const key = notebook.uri.toString();
    for (const cell of cells) {
      const run = kernel.createNotebookCellExecution(cell);
      const n = (this.order.get(key) ?? 0) + 1;
      this.order.set(key, n);
      run.executionOrder = n;
      run.start(Date.now());
      const client = this.client();
      try {
        if (!client) throw new Error('the oxilite server is not running');
        const method = cell.document.languageId === 'datalog' ? Methods.datalog : cell.document.languageId === 'cypher' ? Methods.cypher : Methods.query;
        const params = { query: cell.document.getText(), limit: 1000, connection };
        let payload: QueryPayload;
        try {
          payload = await client.sendRequest<QueryPayload>(method, params);
        } catch (e) {
          if (!(e instanceof ResponseError) || e.code !== NEEDS_CONFIRMATION) throw e;
          const ok = await vscode.window.showWarningMessage(`This cell changes ${label}. Run it?`, { modal: true }, 'Run');
          if (ok !== 'Run') throw new Error('cancelled');
          payload = await client.sendRequest<QueryPayload>(method, { ...params, confirmed: true });
        }
        await run.replaceOutput([output({ title: `cell ${n} · ${label}`, payload, connection: label })]);
        run.end(true, Date.now());
      } catch (e) {
        await run.replaceOutput([
          new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.error(e instanceof Error ? e : new Error(String(e)))]),
        ]);
        run.end(false, Date.now());
      }
    }
  }

  dispose(): void {
    for (const k of this.kernels.values()) k.dispose();
    this.kernels.clear();
    for (const d of this.disposables) d.dispose();
  }
}
