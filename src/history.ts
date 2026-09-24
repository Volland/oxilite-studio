// Query history: every run is remembered per workspace, newest first; opening one restores it.
// @lat: [[architecture#Views#Query history]]
import * as vscode from 'vscode';

export interface HistoryEntry {
  query: string;
  language: string;
  connection: string;
  time: number;
  summary: string;
}

const KEY = 'oxilite.history';
const MAX = 200;

export class QueryHistory implements vscode.TreeDataProvider<HistoryEntry> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly memento: vscode.Memento) {}

  entries(): HistoryEntry[] {
    return this.memento.get<HistoryEntry[]>(KEY, []);
  }

  async add(entry: HistoryEntry): Promise<void> {
    const rest = this.entries().filter((e) => !(e.query === entry.query && e.connection === entry.connection));
    await this.memento.update(KEY, [entry, ...rest].slice(0, MAX));
    this.changed.fire();
  }

  async clear(): Promise<void> {
    await this.memento.update(KEY, []);
    this.changed.fire();
  }

  getTreeItem(e: HistoryEntry): vscode.TreeItem {
    const firstLine = e.query.split('\n').find((l) => l.trim() && !/^\s*(prefix|base|@prefix)\b/i.test(l))?.trim() ?? e.query.trim();
    const item = new vscode.TreeItem(firstLine.slice(0, 80));
    item.description = `${new Date(e.time).toLocaleString()} · ${e.summary}`;
    item.tooltip = new vscode.MarkdownString(`\`\`\`${e.language}\n${e.query}\n\`\`\`\n\n${e.connection}`);
    item.iconPath = new vscode.ThemeIcon('history');
    item.command = { command: 'oxilite.openHistoryEntry', title: 'Open', arguments: [e] };
    return item;
  }

  getChildren(): HistoryEntry[] {
    return this.entries();
  }
}
