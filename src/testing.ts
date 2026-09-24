// Test Explorer for the knowledge-graph tests in oxilite.toml, run by the server.
// @lat: [[architecture#Views#Test Explorer]]
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { Methods, type KgTest, type KgTestOutcome } from '../shared/protocol';

export class KgTests implements vscode.Disposable {
  private readonly controller = vscode.tests.createTestController('oxilite', 'oxilite knowledge-graph tests');

  constructor(private readonly client: () => LanguageClient | undefined) {
    this.controller.refreshHandler = () => this.refresh();
    this.controller.createRunProfile('Run', vscode.TestRunProfileKind.Run, (request, token) => this.run(request, token), true);
  }

  async refresh(): Promise<void> {
    const client = this.client();
    if (!client) return;
    const tests = await client.sendRequest<KgTest[]>(Methods.tests).catch(() => [] as KgTest[]);
    const items = tests.map((t) => {
      const item = this.controller.createTestItem(t.name, t.name, t.uri ? vscode.Uri.parse(t.uri) : undefined);
      if (t.uri) item.range = new vscode.Range(t.line, 0, t.line, 0);
      item.description = t.snapshot ? 'query' : undefined;
      return item;
    });
    this.controller.items.replace(items);
  }

  private async run(request: vscode.TestRunRequest, token: vscode.CancellationToken): Promise<void> {
    const client = this.client();
    if (!client) return;
    const run = this.controller.createTestRun(request);
    const queue: vscode.TestItem[] = [];
    if (request.include) queue.push(...request.include);
    else this.controller.items.forEach((i) => queue.push(i));
    for (const item of queue) {
      if (token.isCancellationRequested || request.exclude?.includes(item)) continue;
      run.started(item);
      try {
        const o = await client.sendRequest<KgTestOutcome>(Methods.runTest, { name: item.id });
        if (o.passed) {
          run.passed(item, o.millis);
        } else {
          const message =
            o.expected !== null && o.actual !== null
              ? vscode.TestMessage.diff(o.message, o.expected, o.actual)
              : new vscode.TestMessage(o.message);
          if (item.uri && item.range) message.location = new vscode.Location(item.uri, item.range);
          run.failed(item, message, o.millis);
        }
      } catch (e) {
        run.errored(item, new vscode.TestMessage(e instanceof Error ? e.message : String(e)));
      }
    }
    run.end();
  }

  async updateSnapshot(item: vscode.TestItem | undefined): Promise<void> {
    const client = this.client();
    const name = item?.id ?? (await vscode.window.showQuickPick(this.names(), { placeHolder: 'Test to snapshot' }));
    if (!client || !name) return;
    try {
      const r = await client.sendRequest<{ path: string }>(Methods.updateSnapshot, { name });
      void vscode.window.showInformationMessage(`Wrote ${r.path}.`);
    } catch (e) {
      void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
  }

  private names(): string[] {
    const out: string[] = [];
    this.controller.items.forEach((i) => out.push(i.id));
    return out;
  }

  dispose(): void {
    this.controller.dispose();
  }
}
