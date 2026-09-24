// The panel host: renders what the extension posts, and keeps the last message across reloads.
// @lat: [[architecture#Views#Results grid]]
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { ToView } from '../../shared/protocol';
import { summarize } from '../../shared/terms';
import { DebugView, GraphPage, PlanView, ReportView, ResourceView, ResultView, setPost, WhyView } from './components';
import { vscode } from './vscode';
import './results.css';

setPost((m) => vscode().postMessage(m));

function App() {
  const [message, setMessage] = useState<ToView | undefined>(() => vscode().getState() as ToView | undefined);
  useEffect(() => {
    const listener = (e: MessageEvent<ToView>) => {
      setMessage(e.data);
      // The payload is plain JSON, so the last result survives a reload of the webview.
      if (e.data.type !== 'running') vscode().setState(e.data);
    };
    window.addEventListener('message', listener);
    // Tell the extension it can send: a message posted before this would be lost.
    vscode().postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, []);

  if (!message) return <p className="note">Run a query with Cmd/Ctrl+Enter.</p>;
  if (message.type === 'running') return <p className="note">Running {message.title}…</p>;
  if (message.type === 'error') return <pre className="error">{message.message}</pre>;
  if (message.type === 'plan') return <PlanView title={message.title} plan={message.plan} />;
  if (message.type === 'resource') return <ResourceView d={message.description} />;
  if (message.type === 'report') return <ReportView report={message.report} />;
  if (message.type === 'why') return <WhyView tree={message.tree} />;
  if (message.type === 'graph') return <GraphPage title={message.title} graph={message.graph} />;
  if (message.type === 'debug') return <DebugView title={message.title} uri={message.uri} rules={message.rules} plan={message.plan} cap={message.cap} />;
  if (message.payload.kind === 'update') {
    return <header>{message.title}: {summarize(message.payload)}</header>;
  }
  return <ResultView title={message.title} payload={message.payload} />;
}


createRoot(document.getElementById('root')!).render(<App />);
