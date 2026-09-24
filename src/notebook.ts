// oxilite notebooks (`.oxnb`): SPARQL, Datalog and Cypher cells run against the active
// connection; outputs are the same serializable payloads the results panel shows, saved in
// the notebook and drawn by the oxilite renderer.
// @lat: [[architecture#Views#Notebooks]]
import * as vscode from 'vscode';
import { ResponseError, type LanguageClient } from 'vscode-languageclient/node';
import { Methods, NEEDS_CONFIRMATION, type QueryPayload } from '../shared/protocol';
import { summarize } from '../shared/terms';

export const NOTEBOOK_TYPE = 'oxilite-notebook';
export const MIME = 'application/vnd.oxilite.result+json';

interface RawCell {
  kind: 'markdown' | 'code';
  language: string;
  value: string;
  outputs?: { title: string; payload: QueryPayload }[];
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
      cell.outputs = (c.outputs ?? []).map((o) => output(o.title, o.payload));
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
            .map((i) => JSON.parse(new TextDecoder().decode(i.data)) as { title: string; payload: QueryPayload }),
        ),
      })),
    };
    return new TextEncoder().encode(JSON.stringify(raw, null, 1));
  }
}

function output(title: string, payload: QueryPayload): vscode.NotebookCellOutput {
  return new vscode.NotebookCellOutput([
    vscode.NotebookCellOutputItem.json({ title, payload }, MIME),
    vscode.NotebookCellOutputItem.text(summarize(payload)),
  ]);
}

export class OxNotebookController implements vscode.Disposable {
  private readonly controller: vscode.NotebookController;
  private order = 0;

  constructor(
    private readonly client: () => LanguageClient | undefined,
    private readonly confirmLabel: () => string,
  ) {
    this.controller = vscode.notebooks.createNotebookController('oxilite-kernel', NOTEBOOK_TYPE, 'oxilite');
    this.controller.supportedLanguages = ['sparql', 'datalog', 'cypher'];
    this.controller.supportsExecutionOrder = true;
    this.controller.executeHandler = (cells) => this.execute(cells);
  }

  private async execute(cells: vscode.NotebookCell[]): Promise<void> {
    for (const cell of cells) {
      const run = this.controller.createNotebookCellExecution(cell);
      run.executionOrder = ++this.order;
      run.start(Date.now());
      const client = this.client();
      try {
        if (!client) throw new Error('the oxilite server is not running');
        const method = cell.document.languageId === 'datalog' ? Methods.datalog : cell.document.languageId === 'cypher' ? Methods.cypher : Methods.query;
        const params = { query: cell.document.getText(), limit: 1000 };
        let payload: QueryPayload;
        try {
          payload = await client.sendRequest<QueryPayload>(method, params);
        } catch (e) {
          if (!(e instanceof ResponseError) || e.code !== NEEDS_CONFIRMATION) throw e;
          const ok = await vscode.window.showWarningMessage(`This cell changes ${this.confirmLabel()}. Run it?`, { modal: true }, 'Run');
          if (ok !== 'Run') throw new Error('cancelled');
          payload = await client.sendRequest<QueryPayload>(method, { ...params, confirmed: true });
        }
        await run.replaceOutput([output(`cell ${run.executionOrder}`, payload)]);
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
    this.controller.dispose();
  }
}
