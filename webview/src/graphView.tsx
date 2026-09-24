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
    const background = cssVar('--vscode-editor-background', '#1e1e1e');
    const cy = cytoscape({
      container: box.current,
      elements: [
        ...graph.nodes.map((n) => ({ data: { id: n.id, label: n.label, kind: n.kind } })),
        ...graph.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label, inferred: e.inferred ? 1 : 0 } })),
      ],
      style: [
        { selector: 'node', style: { label: 'data(label)', color: fg, 'font-size': 10, 'text-wrap': 'wrap', 'text-max-width': '160px', 'background-color': accent, width: 14, height: 14, 'text-valign': 'bottom', 'text-margin-y': 3 } },
        { selector: 'node[kind = "literal"]', style: { shape: 'round-rectangle', 'background-color': muted, width: 10, height: 10 } },
        { selector: 'node[kind = "blank"]', style: { 'background-color': muted } },
        { selector: 'edge', style: { label: 'data(label)', color: muted, 'font-size': 9, width: 1.2, 'line-color': muted, 'target-arrow-color': muted, 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'curve-style': 'bezier', 'text-rotation': 'autorotate', 'text-background-color': background, 'text-background-opacity': 0.85, 'text-background-padding': '2px' } },
        { selector: 'edge[inferred = 1]', style: { 'line-style': 'dashed', 'line-color': accent, 'target-arrow-color': accent } },
      ],
      // Laid out once the container has a size (below): a notebook output may not have one yet.
      layout: { name: 'preset' },
      maxZoom: 1.5,
      minZoom: 0.4,
      wheelSensitivity: 0.3,
    });
    cy.on('tap', 'node[kind = "iri"]', (e) => post({ type: 'openResource', iri: e.target.id() }));
    // Lay out when the container first has a size, and again when it grows a lot.
    let laidOut = { w: 0, h: 0 };
    const layout = () => {
      const { width, height } = box.current!.getBoundingClientRect();
      if (width < 50 || height < 50) return;
      if (laidOut.w && Math.abs(width - laidOut.w) < 80 && Math.abs(height - laidOut.h) < 80) return;
      laidOut = { w: width, h: height };
      cy.resize();
      // Small graphs read best as layers following edge direction; larger ones as a force layout.
      const n = graph.nodes.length;
      const options =
        n > 300 ? { name: 'grid', padding: 30 }
        : n > 40 ? { name: 'cose', animate: false, padding: 30, idealEdgeLength: () => 110, nodeRepulsion: () => 60000 }
        : { name: 'breadthfirst', directed: true, padding: 30, spacingFactor: 1.3, avoidOverlap: true };
      cy.layout(options as cytoscape.LayoutOptions).run();
      cy.fit(undefined, 30);
    };
    const observer = new ResizeObserver(layout);
    observer.observe(box.current);
    layout();
    return () => {
      observer.disconnect();
      cy.destroy();
    };
  }, [graph]);
  return (
    <>
      {graph.omitted > 0 && <p className="note">{graph.omitted} nodes left out to keep the drawing readable.</p>}
      <div className="graph" ref={box} />
    </>
  );
}
