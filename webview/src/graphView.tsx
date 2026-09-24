// The graph view: Cytoscape over a node-link model, themed from VS Code, IRIs clickable.
// @lat: [[architecture#Views#Graph view]]
import cytoscape from 'cytoscape';
import { useEffect, useRef } from 'react';
import type { Graph } from '../../shared/graph';
import { post } from './host';

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}

export function GraphView({ graph }: { graph: Graph }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current) return;
    const fg = cssVar('--vscode-foreground', '#ccc');
    const accent = cssVar('--vscode-textLink-foreground', '#3794ff');
    const muted = cssVar('--vscode-descriptionForeground', '#999');
    const cy = cytoscape({
      container: box.current,
      elements: [
        ...graph.nodes.map((n) => ({ data: { id: n.id, label: n.label, kind: n.kind } })),
        ...graph.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label, inferred: e.inferred ? 1 : 0 } })),
      ],
      style: [
        { selector: 'node', style: { label: 'data(label)', color: fg, 'font-size': 10, 'background-color': accent, width: 14, height: 14, 'text-valign': 'bottom', 'text-margin-y': 3 } },
        { selector: 'node[kind = "literal"]', style: { shape: 'round-rectangle', 'background-color': muted, width: 10, height: 10 } },
        { selector: 'node[kind = "blank"]', style: { 'background-color': muted } },
        { selector: 'edge', style: { label: 'data(label)', color: muted, 'font-size': 9, width: 1, 'line-color': muted, 'target-arrow-color': muted, 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'text-rotation': 'autorotate' } },
        { selector: 'edge[inferred = 1]', style: { 'line-style': 'dashed', 'line-color': accent, 'target-arrow-color': accent } },
      ],
      layout: { name: graph.nodes.length > 300 ? 'grid' : 'cose', animate: false } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.3,
    });
    cy.on('tap', 'node[kind = "iri"]', (e) => post({ type: 'openResource', iri: e.target.id() }));
    return () => cy.destroy();
  }, [graph]);
  return (
    <>
      {graph.omitted > 0 && <p className="note">{graph.omitted} nodes left out to keep the drawing readable.</p>}
      <div className="graph" ref={box} />
    </>
  );
}
