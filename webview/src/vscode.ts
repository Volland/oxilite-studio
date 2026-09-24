// The webview side of the VS Code API, acquired on first use (a notebook renderer has none).
interface VsCodeApi<S> {
  getState(): S | undefined;
  setState(state: S): void;
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi<S>(): VsCodeApi<S>;

let api: VsCodeApi<unknown> | undefined;

export function vscode(): VsCodeApi<unknown> {
  api ??= acquireVsCodeApi<unknown>();
  return api;
}
