// The Connections view: the Project store and attached stores, with the active one marked.
// @lat: [[architecture#Connections]]
import * as vscode from 'vscode';
import type { Connection } from '../shared/protocol';

export class ConnectionsView implements vscode.TreeDataProvider<Connection> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly listChanged = new vscode.EventEmitter<Connection[]>();
  /** The connections list changed (notebook kernels follow it). */
  readonly onDidChangeConnections = this.listChanged.event;
  private items: Connection[] = [];

  set(items: Connection[]): void {
    this.items = items;
    this.changed.fire();
    this.listChanged.fire(items);
  }

  get active(): Connection | undefined {
    return this.items.find((c) => c.active);
  }

  get all(): Connection[] {
    return this.items;
  }

  getTreeItem(c: Connection): vscode.TreeItem {
    const item = new vscode.TreeItem(c.label);
    const size = c.triples === null ? '' : `${c.triples.toLocaleString()} triples`;
    const billed = c.billing ? `${c.billing.rowsRead} read, ${c.billing.rowsWritten} written` : '';
    item.description = [size, billed, c.readOnly ? 'read-only' : '', c.active ? 'active' : ''].filter(Boolean).join(' · ');
    item.tooltip = c.path;
    item.iconPath = new vscode.ThemeIcon(c.kind === 'project' ? 'folder-library' : c.kind.startsWith('d1') ? 'cloud' : 'database', c.active ? new vscode.ThemeColor('charts.green') : undefined);
    item.contextValue = c.kind === 'project' ? 'connection.project' : 'connection.attached';
    item.command = { command: 'oxilite.activateConnection', title: 'Activate', arguments: [c] };
    return item;
  }

  getChildren(): Connection[] {
    return this.items;
  }
}
