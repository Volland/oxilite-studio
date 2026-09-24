// One results webview per query document, reused across runs.
// @lat: [[architecture#Views#Results grid]]
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { FromView, ToView } from '../shared/protocol';

/** Holds a panel's latest message until its webview says it is ready to receive. */
export class Mailbox {
  private ready = false;
  private pending: ToView | undefined;

  constructor(private readonly panel: vscode.WebviewPanel) {}

  post(message: ToView): void {
    if (this.ready) void this.panel.webview.postMessage(message);
    else this.pending = message;
  }

  opened(): void {
    this.ready = true;
    if (this.pending) void this.panel.webview.postMessage(this.pending);
    this.pending = undefined;
  }
}

export class ResultsPanels implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly mailboxes = new WeakMap<vscode.WebviewPanel, Mailbox>();

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
    const mailbox = new Mailbox(panel);
    this.mailboxes.set(panel, mailbox);
    panel.webview.onDidReceiveMessage((m: FromView) => (m.type === 'ready' ? mailbox.opened() : this.onMessage(m)));
    panel.webview.html = webviewHtml(panel.webview, webviewRoot);
    panel.onDidDispose(() => this.panels.delete(key));
    this.panels.set(key, panel);
    return panel;
  }

  post(panel: vscode.WebviewPanel, message: ToView): void {
    this.mailboxes.get(panel)?.post(message);
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
