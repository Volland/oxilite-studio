// Starts `oxilite studio-server` as a language client.
// @lat: [[architecture#Process model]]
import * as vscode from 'vscode';
import { LanguageClient, type LanguageClientOptions, type ServerOptions } from 'vscode-languageclient/node';
import { findServer } from './serverPath';

const RDF_FILES = '**/*.{ttl,nt,nq,trig,n3,rdf,owl,dl,shex,sm,shapemap,toml}';

export const LANGUAGES = ['sparql', 'turtle', 'datalog', 'cypher', 'shex'];

export function createClient(context: vscode.ExtensionContext): LanguageClient | undefined {
  const setting = vscode.workspace.getConfiguration('oxilite').get<string>('server.path', '');
  const server = findServer(setting, context.extensionPath);
  if (!server) {
    void vscode.window.showErrorMessage(
      'oxilite studio: no server binary found. Set "oxilite.server.path" to an oxilite binary (0.3 or later).',
    );
    return undefined;
  }
  const serverOptions: ServerOptions = { command: server.command, args: ['studio-server'] };
  const clientOptions: LanguageClientOptions = {
    documentSelector: LANGUAGES.flatMap((language) => [
      { language, scheme: 'file' },
      { language, scheme: 'untitled' },
      { language, scheme: 'vscode-notebook-cell' },
    ]),
    synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher(RDF_FILES) },
  };
  return new LanguageClient('oxilite', 'oxilite studio', serverOptions, clientOptions);
}
