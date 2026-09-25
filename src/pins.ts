// Documents that run on their own connection: pinned query files and notebooks. Resolves a
// connection reference to a live connection, attaching it without making it active.
// @lat: [[architecture#Connections#Pinned documents]]
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { Methods, type Connection } from '../shared/protocol';
import { absolute, connectionId, parsePin, refLabel, type ConnectionRef } from '../shared/pin';

export const d1Secret = (account: string, database: string): string => `oxilite.d1.${account}.${database}`;

export function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** Attaches in flight, by connection id, so a background resolve and a run attach only once. */
const attaching = new Map<string, Promise<Connection>>();

/** The connection a reference names, attached (without becoming active) if it is not yet. */
export async function ensureConnection(
  client: LanguageClient,
  ref: ConnectionRef,
  current: () => Connection[],
  secrets: vscode.SecretStorage,
  attached: (list: Connection[]) => void,
): Promise<Connection> {
  const id = connectionId(ref, workspaceRoot());
  const existing = current().find((c) => c.id === id);
  if (existing) return existing;
  let pending = attaching.get(id);
  if (!pending) {
    pending = attach(client, ref, secrets, attached).finally(() => attaching.delete(id));
    attaching.set(id, pending);
  }
  return pending;
}

async function attach(
  client: LanguageClient,
  ref: ConnectionRef,
  secrets: vscode.SecretStorage,
  attached: (list: Connection[]) => void,
): Promise<Connection> {
  const root = workspaceRoot();
  const id = connectionId(ref, root);
  let list: Connection[];
  switch (ref.kind) {
    case 'project':
      throw new Error('the Project store is not running');
    case 'sqlite':
      list = await client.sendRequest<Connection[]>(Methods.attach, { path: absolute(ref.path, root), readOnly: ref.readOnly, activate: false });
      break;
    case 'd1': {
      const token = await secrets.get(d1Secret(ref.account, ref.database));
      if (!token) {
        throw new Error(`no token is saved for D1 ${ref.account}/${ref.database}: attach it once with "oxilite: Attach Cloudflare D1 Database…"`);
      }
      list = await client.sendRequest<Connection[]>(Methods.attachD1, {
        account: ref.account,
        database: ref.database,
        token,
        readOnly: true,
        activate: false,
      });
      break;
    }
  }
  attached(list);
  const found = list.find((c) => c.id === id);
  if (!found) throw new Error(`could not attach ${refLabel(ref)}`);
  return found;
}

/** "▶ Run on <connection>" above a pin, so it is clear where a file runs. */
export class PinLenses implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  refresh(): void {
    this.changed.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const pin = parsePin(document.getText(), document.languageId);
    if (!pin) return [];
    const range = new vscode.Range(pin.line, 0, pin.line, 0);
    const mode = pin.ref.kind === 'sqlite' ? (pin.ref.readOnly ? ' (read-only)' : ' (read-write)') : '';
    return [
      new vscode.CodeLens(range, { title: `▶ Run on ${refLabel(pin.ref)}${mode}`, command: 'oxilite.runQuery' }),
      new vscode.CodeLens(range, { title: 'Explain', command: 'oxilite.explainQuery' }),
    ];
  }
}

/**
 * Tells the server which connection each pinned document or notebook cell runs on, so completion,
 * hover and vocabulary warnings come from that store. Resolving in the background never creates a
 * database and never asks for anything: a pin whose target is missing just keeps the active one.
 */
export class DocumentConnections implements vscode.Disposable {
  /** What the server was last told, by document uri (null: the active connection). */
  private readonly sent = new Map<string, string | null>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly client: () => LanguageClient | undefined,
    private readonly resolve: (document: vscode.TextDocument) => Promise<string | null>,
  ) {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((d) => this.update(d)),
      vscode.workspace.onDidChangeTextDocument((e) => this.update(e.document, 400)),
      vscode.workspace.onDidCloseTextDocument((d) => this.sent.delete(d.uri.toString())),
    );
  }

  /** Re-resolves every open document, after a server start or a change of connections. */
  refreshAll(restarted = false): void {
    if (restarted) this.sent.clear();
    for (const d of vscode.workspace.textDocuments) this.update(d);
  }

  update(document: vscode.TextDocument, delay = 0): void {
    if (!['sparql', 'datalog', 'cypher'].includes(document.languageId)) return;
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.send(document);
      }, delay),
    );
  }

  private async send(document: vscode.TextDocument): Promise<void> {
    const client = this.client();
    if (!client || document.isClosed) return;
    const connection = await this.resolve(document).catch(() => null);
    const key = document.uri.toString();
    // A document the server was never told about already uses the active connection.
    if ((this.sent.has(key) ? this.sent.get(key) : null) === connection) return;
    this.sent.set(key, connection);
    await client.sendNotification(Methods.documentConnection, { uri: key, connection });
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    for (const d of this.disposables) d.dispose();
  }
}

/** A pin's target is safe to attach in the background: a SQLite file that exists, or D1 with a saved token. */
export async function attachableQuietly(ref: ConnectionRef, secrets: vscode.SecretStorage): Promise<boolean> {
  switch (ref.kind) {
    case 'project':
      return true;
    case 'sqlite':
      return fs.existsSync(absolute(ref.path, workspaceRoot()));
    case 'd1':
      return (await secrets.get(d1Secret(ref.account, ref.database))) !== undefined;
  }
}
