// "New Project" and "New SQLite Database": scaffold a project folder, and create a database file
// that becomes an attached connection.
// @lat: [[architecture#Project manifest#New project and new database]]
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { Methods, type Connection, type Profile } from '../shared/protocol';
import { refFromConnection, refToString } from '../shared/pin';
import { gitignoreAdditions, namespace, scaffold, slug, validBase } from '../shared/scaffold';
import { workspaceRoot } from './pins';

export const PROFILES: { label: Profile; detail: string }[] = [
  { label: 'none', detail: 'Asserted triples only' },
  { label: 'rdfs', detail: 'Query-time RDFS: subclasses, subproperties, domains and ranges' },
  { label: 'owlql', detail: 'Query-time RDFS plus inverse, symmetric and transitive properties' },
  { label: 'owl2rl', detail: 'Materialized OWL 2 RL closure (recomputed when data changes)' },
];

type Client = () => LanguageClient | undefined;
type OnAttached = (list: Connection[]) => void;

/** Asks where and what, writes the scaffold without overwriting anything, and opens the result. */
export async function newProject(client: Client, onAttached: OnAttached): Promise<void> {
  const root = workspaceRoot();
  const folder = await pickFolder(root);
  if (!folder) return;
  if (await exists(vscode.Uri.joinPath(folder, 'oxilite.toml'))) {
    void vscode.window.showErrorMessage(`${folder.fsPath} already has an oxilite.toml.`);
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: 'Project name',
    value: path.basename(folder.fsPath),
    ignoreFocusOut: true,
  });
  if (name === undefined) return;
  const base = await vscode.window.showInputBox({
    prompt: 'Namespace for the project\'s classes and properties (bound to the prefix ex:)',
    value: `https://example.org/${slug(name)}/`,
    validateInput: (v) => (validBase(v) ? undefined : 'An absolute IRI, such as https://example.org/kg/'),
    ignoreFocusOut: true,
  });
  if (base === undefined) return;
  const reasoning = await vscode.window.showQuickPick(PROFILES, { placeHolder: 'Reasoning profile', ignoreFocusOut: true });
  if (!reasoning) return;
  const store = await vscode.window.showQuickPick(
    [
      { label: 'Files only', detail: 'Queries run on the Project store, rebuilt from the files', db: false },
      { label: 'Files and a SQLite database', detail: `Also creates db/${slug(name)}.sqlite and a query pinned to it`, db: true },
    ],
    { placeHolder: 'Where the data lives', ignoreFocusOut: true },
  );
  if (!store) return;

  const database = store.db ? `db/${slug(name)}.sqlite` : undefined;
  const skipped: string[] = [];
  for (const f of scaffold({ name, base: namespace(base), reasoning: reasoning.label, database })) {
    const uri = vscode.Uri.joinPath(folder, ...f.path.split('/'));
    if (await exists(uri)) {
      if (f.path === '.gitignore') {
        const current = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
        const add = gitignoreAdditions(current, f.content);
        if (add.length) await write(uri, `${current.replace(/\n?$/, '\n')}${add.join('\n')}\n`);
      } else {
        skipped.push(f.path);
      }
      continue;
    }
    await write(uri, f.content);
  }
  if (database) {
    // Created and detached again: the example query stays on the Project store, and
    // queries/database.rq attaches the database when it is opened.
    try {
      await createDatabase(client(), vscode.Uri.joinPath(folder, ...database.split('/')), false, onAttached);
    } catch (e) {
      void vscode.window.showErrorMessage(`Could not create ${database}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const note = skipped.length ? ` Kept existing ${skipped.join(', ')}.` : '';
  if (folder.fsPath === root) {
    await vscode.commands.executeCommand('oxilite.reloadStore');
    await vscode.window.showTextDocument(vscode.Uri.joinPath(folder, 'queries', 'example.rq'));
    void vscode.window.showInformationMessage(`Created the ${name} project: run the query with Cmd/Ctrl+Enter.${note}`);
    return;
  }
  const open = await vscode.window.showInformationMessage(`Created the ${name} project in ${folder.fsPath}.${note}`, 'Open Folder', 'Open in New Window');
  if (open) await vscode.commands.executeCommand('vscode.openFolder', folder, { forceNewWindow: open === 'Open in New Window' });
}

/** Asks for a new database file, creates it as an attached read-write connection and makes it active. */
export async function newDatabase(client: Client, onAttached: OnAttached): Promise<void> {
  const c = client();
  if (!c) return;
  const root = workspaceRoot();
  const file = await vscode.window.showSaveDialog({
    defaultUri: root ? vscode.Uri.file(path.join(root, 'db', 'store.sqlite')) : undefined,
    filters: { 'SQLite databases': ['sqlite', 'sqlite3', 'db'] },
    saveLabel: 'Create',
    title: 'New SQLite database',
  });
  if (!file) return;
  if (await exists(file)) {
    // The dialog has asked to replace it, but a database is never truncated from here.
    const answer = await vscode.window.showWarningMessage(
      `${path.basename(file.fsPath)} already exists. Attach it as it is?`,
      { modal: true, detail: 'Its contents are kept; delete the file first to start empty.' },
      'Attach',
    );
    if (answer !== 'Attach') return;
  }
  let connection: Connection | undefined;
  try {
    connection = await createDatabase(c, file, true, onAttached);
  } catch (e) {
    void vscode.window.showErrorMessage(`Could not create ${file.fsPath}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const next = await vscode.window.showInformationMessage(
    `${path.basename(file.fsPath)} is the active connection.`,
    'Import RDF File…',
    'New Pinned Query',
  );
  if (next === 'Import RDF File…') await vscode.commands.executeCommand('oxilite.importFile');
  if (next === 'New Pinned Query' && connection) {
    const ref = refFromConnection(connection, root);
    const target = ref ? refToString(ref).replace(/^sqlite:/, '') : connection.path;
    const content = `# oxilite: connection = ${target}\n# Runs on this database whichever connection is active.\n\nSELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 100\n`;
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'sparql', content }));
  }
}

/** Attaching a path that does not exist creates the database; `keep` leaves it attached and active. */
async function createDatabase(
  client: LanguageClient | undefined,
  file: vscode.Uri,
  keep: boolean,
  onAttached: OnAttached,
): Promise<Connection | undefined> {
  if (!client) throw new Error('the oxilite server is not running');
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(file.fsPath)));
  const list = await client.sendRequest<Connection[]>(Methods.attach, { path: file.fsPath, readOnly: false });
  const created = list.find((c) => c.path === file.fsPath) ?? list.find((c) => c.active);
  if (keep) {
    onAttached(list);
    return created;
  }
  if (created) onAttached(await client.sendRequest<Connection[]>(Methods.detach, { id: created.id }));
  return created;
}

async function pickFolder(root: string | undefined): Promise<vscode.Uri | undefined> {
  if (root && !(await exists(vscode.Uri.file(path.join(root, 'oxilite.toml'))))) {
    const where = await vscode.window.showQuickPick(
      [
        { label: 'This workspace folder', description: root, here: true },
        { label: 'Another folder…', here: false },
      ],
      { placeHolder: 'Create the project in' },
    );
    if (!where) return undefined;
    if (where.here) return vscode.Uri.file(root);
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Create Project Here',
    title: 'Folder for the new oxilite project (existing files are kept)',
  });
  return picked?.[0];
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function write(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
}
