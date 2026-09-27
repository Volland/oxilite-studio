// Writes to a persistent store ask the user first: the server refuses them with
// `NEEDS_CONFIRMATION` until they are re-sent confirmed.
// @lat: [[architecture#Connections]]
import * as vscode from 'vscode';
import { ResponseError, type LanguageClient } from 'vscode-languageclient/node';
import { NEEDS_CONFIRMATION, type Connection } from '../shared/protocol';

/** Runs a query; an update on a persistent store asks first and is re-sent confirmed. */
export async function sendWithConfirmation<P extends object, R>(
  client: LanguageClient,
  method: string,
  params: P,
  active: Connection | undefined,
): Promise<R | undefined> {
  try {
    return await client.sendRequest<R>(method, params);
  } catch (e) {
    if (!(e instanceof ResponseError) || e.code !== NEEDS_CONFIRMATION) throw e;
    const estimate = (e.data as { estimate?: string | null } | undefined)?.estimate;
    const answer = await vscode.window.showWarningMessage(
      `This changes ${active?.path ?? 'a persistent store'}. Run it?`,
      { modal: true, detail: estimate ? `D1 bills written rows: ${estimate}.` : undefined },
      'Run',
    );
    if (answer !== 'Run') return undefined;
    return client.sendRequest<R>(method, { ...params, confirmed: true });
  }
}
