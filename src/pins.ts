// Documents that run on their own connection: pinned query files and notebooks. Resolves a
// connection reference to a live connection, attaching it without making it active.
// @lat: [[architecture#Connections#Pinned documents]]
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { Methods, type Connection } from '../shared/protocol';
import { absolute, connectionId, parsePin, refLabel, type ConnectionRef } from '../shared/pin';

export const d1Secret = (account: string, database: string): string => `oxilite.d1.${account}.${database}`;

export function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** The connection a reference names, attached (without becoming active) if it is not yet. */
export async function ensureConnection(
  client: LanguageClient,
  ref: ConnectionRef,
  current: () => Connection[],
  secrets: vscode.SecretStorage,
  attached: (list: Connection[]) => void,
): Promise<Connection> {
  const root = workspaceRoot();
  const id = connectionId(ref, root);
  const existing = current().find((c) => c.id === id);
  if (existing) return existing;
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
