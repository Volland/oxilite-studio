// The graph view: Cytoscape over a node-link model, themed from VS Code, IRIs clickable.
// @lat: [[architecture#Views#Graph view]]
import cytoscape from 'cytoscape';
import { useEffect, useRef } from 'react';
import type { Graph } from '../../shared/graph';
import { post } from './host';

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}

/** Styles of the classes the schema registry's mapping graph uses (see `shared/registry.ts`). */
function registryStyles(fg: string, muted: string): cytoscape.StylesheetJson {
  const chart = (name: string, fallback: string) => cssVar(`--vscode-charts-${name}`, fallback);
  const warning = cssVar('--vscode-editorWarning-foreground', '#cca700');
  return [
    // Schemas sit above the graphs they map: their labels go on top, clear of the outgoing edges.
    { selector: 'node.schema', style: { shape: 'round-rectangle', width: 20, height: 20, 'text-valign': 'top', 'text-margin-y': -3 } },
    { selector: 'node.role-ontology', style: { 'background-color': chart('purple', '#b180d7') } },
    { selector: 'node.role-shacl', style: { 'background-color': chart('orange', '#d18616') } },
    { selector: 'node.role-shex', style: { 'background-color': chart('yellow', '#cca700') } },
    { selector: 'node.role-ontology.role-shacl', style: { 'background-color': chart('purple', '#b180d7'), 'border-width': 3, 'border-color': chart('orange', '#d18616') } },
    { selector: 'node.data', style: { 'background-color': chart('blue', '#3794ff'), width: 16, height: 16 } },
    { selector: 'node.all', style: { shape: 'diamond', 'background-color': chart('green', '#89d185'), width: 22, height: 22, 'font-weight': 'bold' } },
    { selector: 'node.system', style: { shape: 'hexagon', 'background-color': muted } },
    { selector: 'node.inactive', style: { opacity: 0.45, 'border-width': 1.5, 'border-style': 'dashed', 'border-color': fg } },
    { selector: 'node.missing', style: { 'background-opacity': 0, 'border-width': 1.5, 'border-style': 'dashed', 'border-color': warning, color: warning } },
    { selector: 'edge.imports', style: { 'line-style': 'dashed', 'line-color': chart('purple', '#b180d7'), 'target-arrow-color': chart('purple', '#b180d7') } },
    { selector: 'edge.via-all', style: { 'line-style': 'dotted', 'line-color': chart('green', '#89d185'), 'target-arrow-color': chart('green', '#89d185') } },
    { selector: 'edge.unresolved', style: { 'line-style': 'dotted', 'line-color': warning, 'target-arrow-color': warning } },
    { selector: 'edge.inactive', style: { opacity: 0.35 } },
    { selector: 'node:selected', style: { 'border-width': 3, 'border-style': 'solid', 'border-color': cssVar('--vscode-focusBorder', '#007fd4') } },
  ];
}

/** A node-link drawing. With `onSelect`, tapping a node selects it (and the background clears
 * the selection) instead of opening the resource view. */
export function GraphView({ graph, onSelect, selected }: { graph: Graph; onSelect?: (id: string | undefined) => void; selected?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | undefined>(undefined);
  const select = useRef(onSelect);
  select.current = onSelect;
  const selectable = onSelect !== undefined;
  useEffect(() => {
    if (!box.current) return;
    const fg = cssVar('--vscode-foreground', '#ccc');
    const accent = cssVar('--vscode-textLink-foreground', '#3794ff');
    const muted = cssVar('--vscode-descriptionForeground', '#999');
    const background = cssVar('--vscode-editor-background', '#1e1e1e');
    const cy = cytoscape({
      container: box.current,
      elements: [
        ...graph.nodes.map((n) => ({ data: { id: n.id, label: n.label, kind: n.kind }, classes: n.classes })),
        ...graph.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label, inferred: e.inferred ? 1 : 0 }, classes: e.classes })),
      ],
      style: [
        { selector: 'node', style: { label: 'data(label)', color: fg, 'font-size': 10, 'text-wrap': 'wrap', 'text-max-width': '160px', 'background-color': accent, width: 14, height: 14, 'text-valign': 'bottom', 'text-margin-y': 3 } },
        { selector: 'node[kind = "literal"]', style: { shape: 'round-rectangle', 'background-color': muted, width: 10, height: 10 } },
        { selector: 'node[kind = "blank"]', style: { 'background-color': muted } },
        { selector: 'edge', style: { label: 'data(label)', color: muted, 'font-size': 9, width: 1.2, 'line-color': muted, 'target-arrow-color': muted, 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'curve-style': 'bezier', 'text-rotation': 'autorotate', 'text-background-color': background, 'text-background-opacity': 0.85, 'text-background-padding': '2px' } },
        { selector: 'edge[inferred = 1]', style: { 'line-style': 'dashed', 'line-color': accent, 'target-arrow-color': accent } },
        ...registryStyles(fg, muted),
      ],
      // Laid out once the container has a size (below): a notebook output may not have one yet.
      layout: { name: 'preset' },
      maxZoom: 1.5,
      minZoom: 0.4,
      wheelSensitivity: 0.3,
    });
    if (selectable) {
      cy.on('tap', (e) => {
        const t = e.target as cytoscape.Core | cytoscape.SingularElementReturnValue;
        select.current?.(t !== cy && (t as cytoscape.SingularElementReturnValue).isNode() ? (t as cytoscape.NodeSingular).id() : undefined);
      });
    } else {
      cy.autounselectify(true);
      cy.on('tap', 'node[kind = "iri"]', (e) => post({ type: 'openResource', iri: e.target.id() }));
    }
    cyRef.current = cy;
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
      cyRef.current = undefined;
      cy.destroy();
    };
  }, [graph, selectable]);
  // Keep the drawing's selection in step with the view's.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !selectable) return;
    cy.nodes(':selected').unselect();
    if (selected) cy.getElementById(selected).select();
  }, [graph, selected, selectable]);
  return (
    <>
      {graph.omitted > 0 && <p className="note">{graph.omitted} nodes left out to keep the drawing readable.</p>}
      <div className="graph" ref={box} />
    </>
  );
}
