// One results webview per query document, reused across runs.
// @lat: [[architecture#Views#Results grid]]
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { FromView, ToView } from '../shared/protocol';

export class ResultsPanels implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (m: FromView) => void = () => undefined,
  ) {}

  /** The panel for `document`, created beside the editor on first use. */
  show(document: vscode.TextDocument): vscode.WebviewPanel {
    const key = document.uri.toString();
    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Beside, true);
      return existing;
    }
    const webviewRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel(
      'oxilite.results',
      `Results: ${document.uri.path.split('/').pop()}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [webviewRoot] },
    );
    panel.webview.html = webviewHtml(panel.webview, webviewRoot);
    panel.webview.onDidReceiveMessage((m: FromView) => this.onMessage(m));
    panel.onDidDispose(() => this.panels.delete(key));
    this.panels.set(key, panel);
    return panel;
  }

  post(panel: vscode.WebviewPanel, message: ToView): void {
    void panel.webview.postMessage(message);
  }

  dispose(): void {
    for (const p of this.panels.values()) p.dispose();
    this.panels.clear();
  }
}

export function webviewHtml(webview: vscode.Webview, root: vscode.Uri): string {
  const script = webview.asWebviewUri(vscode.Uri.joinPath(root, 'results.js'));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(root, 'results.css'));
  const nonce = randomBytes(16).toString('hex');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>Results</title>
</head>
<body>
<div id="root"></div>
<script type="module" nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
