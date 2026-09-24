// The Store Explorer: graphs, classes, properties, files and prefixes, fetched lazily.
// @lat: [[architecture#Views#Store Explorer]]
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { Methods, type ExplorerNode } from '../shared/protocol';

const ICONS: Record<ExplorerNode['kind'], string> = {
  folder: 'folder',
  graph: 'type-hierarchy',
  class: 'symbol-class',
  property: 'symbol-property',
  data: 'file',
  ontology: 'symbol-namespace',
  shapes: 'shield',
  rules: 'symbol-function',
  prefix: 'symbol-constant',
};

export class ExplorerView implements vscode.TreeDataProvider<ExplorerNode> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly client: () => LanguageClient | undefined) {}

  refresh(): void {
    this.changed.fire();
  }

  getTreeItem(n: ExplorerNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      n.label,
      n.collapsible ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    item.description = n.description;
    item.tooltip = n.iri ?? n.uri ?? n.description;
    item.iconPath = new vscode.ThemeIcon(ICONS[n.kind] ?? 'circle-outline');
    item.contextValue = n.kind;
    if (n.uri) {
      item.command = { command: 'vscode.open', title: 'Open', arguments: [vscode.Uri.parse(n.uri)] };
    } else if (n.iri) {
      item.command = { command: 'oxilite.openResource', title: 'Open resource', arguments: [n.iri] };
    }
    return item;
  }

  async getChildren(n?: ExplorerNode): Promise<ExplorerNode[]> {
    const client = this.client();
    if (!client) return [];
    try {
      return await client.sendRequest<ExplorerNode[]>(Methods.explorer, { node: n?.id ?? 'root' });
    } catch {
      return [];
    }
  }
}
