// A single reusable webview panel (resource view, SHACL report) on the shared webview bundle.
// @lat: [[architecture#Views]]
import * as vscode from 'vscode';
import type { FromView, ToView } from '../shared/protocol';
import { webviewHtml } from './resultsPanel';

export class SinglePanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly viewType: string,
    private readonly onMessage: (m: FromView) => void,
  ) {}

  show(title: string, message: ToView): void {
    if (!this.panel) {
      const root = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
      this.panel = vscode.window.createWebviewPanel(
        this.viewType,
        title,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [root] },
      );
      this.panel.webview.html = webviewHtml(this.panel.webview, root);
      this.panel.webview.onDidReceiveMessage((m: FromView) => this.onMessage(m));
      this.panel.onDidDispose(() => (this.panel = undefined));
    }
    this.panel.title = title;
    this.panel.reveal(vscode.ViewColumn.Beside, true);
    void this.panel.webview.postMessage(message);
  }

  /** Updates the panel only if it is open. */
  update(title: string, message: ToView): void {
    if (this.panel) this.show(title, message);
  }

  dispose(): void {
    this.panel?.dispose();
  }
}

/** Opens a location sent by a webview. */
export async function openLocation(location: { uri: string; range: { start: { line: number; character: number } } }): Promise<void> {
  const pos = new vscode.Position(location.range.start.line, location.range.start.character);
  await vscode.window.showTextDocument(vscode.Uri.parse(location.uri), {
    selection: new vscode.Range(pos, pos),
    viewColumn: vscode.ViewColumn.One,
  });
}
