// How views talk to whatever hosts them: a webview panel or a notebook renderer sets `post`.
import type { FromView } from '../../shared/protocol';

let sink: (m: FromView) => void = () => undefined;

export function setPost(p: (m: FromView) => void): void {
  sink = p;
}

export function post(m: FromView): void {
  sink(m);
}
