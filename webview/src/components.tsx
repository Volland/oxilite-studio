// The views shared by webview panels and notebook outputs. They render serializable payloads
// and talk to their host only through `post`, which each host sets.
// @lat: [[architecture#Views]]
import { useMemo, useRef, useState } from 'react';
import { getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Description, LocationJson, Plan, ProofNode, Term, ToView, ValidationReport, ValidationResultJson } from '../../shared/protocol';
import { formatTerm, summarize, toTable } from '../../shared/terms';
import { fromDescription, graphOf, type Graph } from '../../shared/graph';
import { GraphView } from './graphView';
import { post } from './host';

export { setPost } from './host';

type Row = (Term | null)[];

/** A result as a table, or as a graph when it has one. */
export function ResultView({ title, payload }: { title: string; payload: Extract<ToView, { type: 'result' }>['payload'] }) {
  const graph = useMemo(() => graphOf(payload), [payload]);
  const [asGraph, setAsGraph] = useState(false);
  return (
    <>
      <header>
        {title}: {summarize(payload)}
        {graph && (
          <span className="toggle">
            <button type="button" className={asGraph ? 'link' : 'link on'} onClick={() => { setAsGraph(false); }}>table</button>
            {' · '}
            <button type="button" className={asGraph ? 'link on' : 'link'} onClick={() => { setAsGraph(true); }}>graph</button>
          </span>
        )}
      </header>
      {asGraph && graph ? <GraphView graph={graph} /> : <Grid {...toTable(payload)} />}
    </>
  );
}

export function Grid({ columns, rows }: { columns: string[]; rows: Row[] }) {
  const defs = useMemo<ColumnDef<Row>[]>(
    () => columns.map((c, i) => ({ id: `${i}`, header: c, accessorFn: (row) => row[i] ?? null })),
    [columns],
  );
  const table = useReactTable({ data: rows, columns: defs, getCoreRowModel: getCoreRowModel() });
  const scroller = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;
  const virtual = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 24,
    overscan: 20,
  });
  const items = virtual.getVirtualItems();
  const padTop = items.length ? items[0].start : 0;
  const padBottom = items.length ? virtual.getTotalSize() - items[items.length - 1].end : 0;

  return (
    <div className="scroller" ref={scroller}>
      <table>
        <thead>
          <tr>
            <th className="index">#</th>
            {table.getFlatHeaders().map((h) => (
              <th key={h.id}>?{String(h.column.columnDef.header)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 && <tr style={{ height: padTop }} />}
          {items.map((item) => {
            const row = tableRows[item.index];
            return (
              <tr key={row.id}>
                <td className="index">{item.index + 1}</td>
                {row.getVisibleCells().map((cell) => {
                  const term = cell.getValue() as Term | null;
                  return (
                    <td key={cell.id} className={term?.termType ?? 'unbound'} title={term?.value}>
                      <TermView term={term} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {padBottom > 0 && <tr style={{ height: padBottom }} />}
        </tbody>
      </table>
    </div>
  );
}

/** A term; IRIs open the resource view. */
function TermView({ term }: { term: Term | null }) {
  if (term?.termType === 'NamedNode') {
    return (
      <button type="button" className="link" onClick={() => { post({ type: 'openResource', iri: term.value }); }}>
        {formatTerm(term)}
      </button>
    );
  }
  return <>{formatTerm(term)}</>;
}

function openLocation(location: LocationJson) {
  post({ type: 'openLocation', location });
}

function where(l: LocationJson): string {
  return `${decodeURIComponent(l.uri.replace(/^.*\//, ''))}:${l.range.start.line + 1}`;
}

function Badge({ inferred, producers, why }: { inferred: boolean; producers: string[] | null; why?: () => void }) {
  if (!inferred) return null;
  return (
    <>
      <span className="badge" title={producers?.length ? `inferred by ${producers.join(', ')}` : 'inferred by query-time reasoning'}>
        inferred{producers?.length ? `: ${producers.join(', ')}` : ''}
      </span>{' '}
      {why && <button type="button" className="link" onClick={() => { why(); }}>why?</button>}
    </>
  );
}

/** A justification tree: each inference with its rule, down to asserted statements. */
export function WhyView({ tree }: { tree: ProofNode }) {
  return (
    <div className="page">
      <h2>Why?</h2>
      <ul className="proof"><ProofItem node={tree} /></ul>
    </div>
  );
}

function ProofItem({ node }: { node: ProofNode }) {
  const t = node.triple;
  const text = `${formatTerm(t.s)} ${formatTerm(t.p)} ${formatTerm(t.o)}`;
  return (
    <li>
      <span className={`status ${node.status}`}>{node.status}</span> <code>{text}</code>
      {node.location && (
        <> <button type="button" className="link" onClick={() => { openLocation(node.location!); }}>{where(node.location)}</button></>
      )}
      {node.rule && <div className="rule">by {node.producer ? `${node.producer}: ` : ''}<code>{node.rule}</code></div>}
      {node.note && <div className="note">{node.note}</div>}
      {node.premises && node.premises.length > 0 && (
        <ul>{node.premises.map((p, i) => <ProofItem key={i} node={p} />)}</ul>
      )}
    </li>
  );
}

/** Everything the store says about one IRI, asserted and inferred, with where it is defined. */
export function ResourceView({ d }: { d: Description }) {
  const [asGraph, setAsGraph] = useState(false);
  const graph = useMemo(() => fromDescription(d), [d]);
  if (asGraph) {
    return (
      <>
        <header>
          {d.iri}
          <span className="toggle">
            <button type="button" className="link" onClick={() => { setAsGraph(false); }}>statements</button> · <button type="button" className="link on">graph</button>
          </span>
        </header>
        <GraphView graph={graph} />
      </>
    );
  }
  return (
    <div className="page">
      <span className="toggle">
        <button type="button" className="link on">statements</button> · <button type="button" className="link" onClick={() => { setAsGraph(true); }}>graph</button>
      </span>
      <h2>{formatTerm({ termType: 'NamedNode', value: d.iri })}</h2>
      <p className="iri">{d.iri}</p>
      {d.definitions.length > 0 && (
        <p>
          Defined in{' '}
          {d.definitions.map((l, i) => (
            <button type="button" key={i} className="link" onClick={() => openLocation(l)}>{where(l)} </button>
          ))}
        </p>
      )}
      <h3>Outgoing ({d.outgoing.length})</h3>
      <table className="plain">
        <tbody>
          {d.outgoing.map((r, i) => (
            <tr key={i} className={r.inferred ? 'inferred' : ''}>
              <td><TermView term={r.p} /></td>
              <td><TermView term={r.o} /></td>
              <td><Badge inferred={r.inferred} producers={r.producers} why={() => post({ type: 'why', s: { termType: 'NamedNode', value: d.iri }, p: r.p, o: r.o })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Incoming ({d.incoming.length})</h3>
      <table className="plain">
        <tbody>
          {d.incoming.map((r, i) => (
            <tr key={i} className={r.inferred ? 'inferred' : ''}>
              <td><TermView term={r.s} /></td>
              <td><TermView term={r.p} /></td>
              <td><Badge inferred={r.inferred} producers={r.producers} why={() => post({ type: 'why', s: r.s, p: r.p, o: { termType: 'NamedNode', value: d.iri } })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.truncated && <p className="note">Only the first 500 statements each way are shown.</p>}
    </div>
  );
}

/** The SHACL report, grouped by shape (or constraint when the shape is anonymous). */
export function ReportView({ report }: { report: ValidationReport }) {
  const [by, setBy] = useState<'shape' | 'focus'>('shape');
  if (report.error) return <pre className="error">{report.error}</pre>;
  if (report.conforms === null) return <p className="note">No SHACL shapes in this project.</p>;
  const groups = new Map<string, ValidationResultJson[]>();
  for (const r of report.results) {
    const key = by === 'shape' ? (r.shape ?? r.component) : r.focus;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <div className="page">
      <h2>{report.conforms ? 'The data conforms' : `${report.results.length} validation results`}</h2>
      <p className="note">
        Validated {report.inferred ? 'asserted and inferred' : 'asserted'} triples. Group by{' '}
        <button type="button" className="link" onClick={() => { setBy('shape'); }}>shape</button> ·{' '}
        <button type="button" className="link" onClick={() => { setBy('focus'); }}>focus node</button>
      </p>
      {[...groups].map(([key, results]) => (
        <section key={key}>
          <h3>{key} ({results.length})</h3>
          <table className="plain">
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className={r.severity}>
                  <td>{r.severity}</td>
                  <td>{by === 'shape' ? r.focus : (r.shape ?? r.component)}</td>
                  <td>{r.path ?? ''}</td>
                  <td>{r.message}</td>
                  <td>
                    {r.location && <button type="button" className="link" onClick={() => { openLocation(r.location!); }}>{where(r.location)}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

const SQL_WORDS = /\b(SELECT|FROM|WHERE|AND|OR|NOT|CROSS JOIN|LEFT JOIN|JOIN|ON|UNION ALL|UNION|WITH RECURSIVE|WITH|AS|CASE|WHEN|THEN|ELSE|END|ORDER BY|GROUP BY|LIMIT|OFFSET|DISTINCT|EXISTS|IN|IS NULL|IS NOT NULL|INSERT|INTO|VALUES|DELETE)\b/g;

/** The explain output: comments (planner notes) dimmed, SQL keywords emphasised. */
export function PlanView({ title, plan }: { title: string; plan: Plan }) {
  return (
    <>
      <header>
        {title} ({plan.kind})
      </header>
      <pre className="plan">
        {plan.text.split('\n').map((line, i) =>
          line.trimStart().startsWith('--') ? (
            <div key={i} className="note-line">
              {line}
            </div>
          ) : (
            <div key={i}>
              {line.split(SQL_WORDS).map((part, j) => (j % 2 === 1 ? <b key={j}>{part}</b> : part))}
            </div>
          ),
        )}
      </pre>
    </>
  );
}



/** A drawing on its own (the ontology diagram). */
export function GraphPage({ title, graph }: { title: string; graph: Graph }) {
  return (
    <>
      <header>{title}</header>
      <GraphView graph={graph} />
    </>
  );
}

export interface RuleDebug {
  index: number;
  line: number;
  head: string;
  rule: string;
  bodyMatches: number | null;
  facts: number | null;
  error: string | null;
}

/** The Datalog debugger: rules with how often their body matches and their head's facts. */
export function DebugView({ title, uri, rules, plan, cap }: { title: string; uri: string; rules: RuleDebug[]; plan: string; cap: number }) {
  const flag = (r: RuleDebug) => (r.error ? 'error' : r.bodyMatches === 0 ? 'empty' : (r.bodyMatches ?? 0) >= cap ? 'exploding' : '');
  return (
    <div className="page">
      <h2>{title}</h2>
      <table className="plain debug">
        <thead>
          <tr><th>line</th><th>rule</th><th>body matches</th><th>head facts</th><th></th></tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.index} className={flag(r)}>
              <td>
                <button type="button" className="link" onClick={() => { post({ type: 'openLocation', location: { uri, range: { start: { line: r.line, character: 0 }, end: { line: r.line, character: 0 } } } }); }}>{r.line + 1}</button>
              </td>
              <td><code>{r.rule}</code></td>
              <td>{r.bodyMatches ?? ''}</td>
              <td>{r.facts ?? ''}</td>
              <td>{r.error ?? flag(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Strata and strategies</h3>
      <pre className="plan">{plan}</pre>
    </div>
  );
}
