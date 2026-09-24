// The notebook renderer: draws oxilite results in notebook outputs with the panel components.
// @lat: [[architecture#Views#Notebooks]]
import { createRoot, type Root } from 'react-dom/client';
import type { ActivationFunction } from 'vscode-notebook-renderer';
import type { QueryPayload } from '../../shared/protocol';
import { ResultView, setPost } from './components';
import css from './results.css?inline';

const roots = new WeakMap<HTMLElement, Root>();

export const activate: ActivationFunction = (context) => {
  if (context.postMessage) setPost((m) => context.postMessage!(m));
  return {
    renderOutputItem(item, element) {
      if (!element.querySelector('style[data-oxilite]')) {
        const style = document.createElement('style');
        style.dataset.oxilite = '';
        style.textContent = css;
        element.appendChild(style);
      }
      let host = element.querySelector<HTMLDivElement>('div[data-oxilite]');
      if (!host) {
        host = document.createElement('div');
        host.dataset.oxilite = '';
        host.className = 'notebook-output';
        element.appendChild(host);
      }
      const { title, payload } = item.json() as { title: string; payload: QueryPayload };
      let root = roots.get(host);
      if (!root) {
        root = createRoot(host);
        roots.set(host, root);
      }
      root.render(<ResultView title={title} payload={payload} />);
    },
    disposeOutputItem() {},
  };
};
