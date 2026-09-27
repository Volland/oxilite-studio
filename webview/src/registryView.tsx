// The Schema Registry view: the mapping graph between named graphs, the registrations, what
// applies to each graph, and the edits, which the extension carries out.
// @lat: [[architecture#Views#Schema registry view]]
import { useMemo, useState, type ReactNode } from 'react';
import type { Registry, RegistryOp } from '../../shared/protocol';
import {
  ALL_GRAPHS,
  dataGraphs,
  effectiveSchemas,
  graphLabel,
  mappingGraph,
  reasoningReadsEveryGraph,
  ROLE_NAMES,
  schemaGraphs,
  SYSTEM_GRAPHS,
  type Applying,
  type SchemaGraph,
} from '../../shared/registry';
import { GraphView } from './graphView';
import { post } from './host';

type Tab = 'graph' | 'table' | 'graphs';

const edit = (op: RegistryOp | 'refresh' | 'openManifest', graph?: string) => post({ type: 'registry', op, graph });

function Tabs({ tab, set }: { tab: Tab; set: (t: Tab) => void }) {
  const item = (t: Tab, label: string) => (
    <button type="button" className={tab === t ? 'link on' : 'link'} onClick={() => { set(t); }}>{label}</button>
  );
  return <span className="toggle">{item('graph', 'mapping graph')} · {item('table', 'registrations')} · {item('graphs', 'per graph')}</span>;
}

function GraphLink({ iri, select }: { iri: string; select: (g: string) => void }) {
  return <button type="button" className="link" title={iri} onClick={() => { select(iri); }}>{graphLabel(iri)}</button>;
}

function Roles({ roles }: { roles: SchemaGraph['roles'] }) {
  return <>{roles.map((r) => <span key={r} className={`badge role role-${r}`}>{ROLE_NAMES[r]}</span>)}</>;
}

function Via({ a, select }: { a: Applying; select: (g: string) => void }) {
  if (a.via === 'direct') return null;
  if (a.via === 'all') return <span className="via">all graphs</span>;
  const from = a.through ?? [];
  return (
    <span className="via">
      imported by{' '}
      {from.map((g, i) => (
        <span key={g}>{i > 0 && ' → '}<GraphLink iri={g} select={select} /></span>
      ))}
    </span>
  );
}

export function RegistryView({ title, registry }: { title: string; registry: Registry }) {
  const [tab, setTab] = useState<Tab>('graph');
  const [selected, setSelected] = useState<string | undefined>();
  const [expandAll, setExpandAll] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const schemas = useMemo(() => schemaGraphs(registry), [registry]);
  const data = useMemo(() => dataGraphs(registry), [registry]);
  const graph = useMemo(() => mappingGraph(registry, { expandAll, showSystem }), [registry, expandAll, showSystem]);
  const writable = !registry.readOnly;
  const fallback = reasoningReadsEveryGraph(registry);

  return (
    <>
      <header>
        {title}: {schemas.length} schema {schemas.length === 1 ? 'graph' : 'graphs'}, {data.length} data {data.length === 1 ? 'graph' : 'graphs'}
        <Tabs tab={tab} set={setTab} />
      </header>
      <div className="toolbar">
        <button type="button" className="action" onClick={() => { edit('refresh'); }}>Refresh</button>
        {writable && <button type="button" className="action" onClick={() => { edit('register'); }}>Register graph…</button>}
        {writable && !registry.systemGraphs.current && (
          <button type="button" className="action secondary" onClick={() => { edit('installSystemGraphs'); }}>
            {registry.systemGraphs.present.length ? 'Refresh system graphs' : 'Install system graphs'}
          </button>
        )}
        {tab === 'graph' && (
          <span className="options">
            <label><input type="checkbox" checked={expandAll} onChange={(e) => { setExpandAll(e.target.checked); }} /> expand All graphs</label>
            <label><input type="checkbox" checked={showSystem} onChange={(e) => { setShowSystem(e.target.checked); }} /> system graphs</label>
          </span>
        )}
      </div>
      <Notices registry={registry} fallback={fallback} />
      {tab === 'graph' && (
        <>
          <Legend />
          {graph.nodes.length ? (
            <GraphView graph={graph} onSelect={setSelected} selected={selected} />
          ) : (
            <p className="note">This connection has no named graphs yet.</p>
          )}
        </>
      )}
      {tab === 'table' && <Registrations schemas={schemas} select={setSelected} selected={selected} />}
      {tab === 'graphs' && <PerGraph registry={registry} schemas={schemas} select={setSelected} selected={selected} fallback={fallback} />}
      {selected && (
        <Details
          id={selected}
          registry={registry}
          schemas={schemas}
          select={setSelected}
          writable={writable}
          close={() => { setSelected(undefined); }}
        />
      )}
    </>
  );
}

function Notices({ registry, fallback }: { registry: Registry; fallback: boolean }) {
  return (
    <>
      {registry.ephemeral && (
        <p className="notice">
          The Project store's registry comes from <code>oxilite.toml</code> (<code>role = "ontology"</code>, <code>applies_to</code>) and is rebuilt on reload; edits here last until then.{' '}
          <button type="button" className="link" onClick={() => { edit('openManifest'); }}>Open oxilite.toml</button>
        </p>
      )}
      {registry.readOnly && <p className="notice">This connection is read-only: the registry can be viewed, not changed.</p>}
      {fallback && <p className="notice">No ontology is registered, so query-time reasoning reads the axioms of every graph but the system graphs.</p>}
      {registry.problems.length > 0 && (
        <div className="notice problem">
          {registry.problems.length} registry {registry.problems.length === 1 ? 'problem' : 'problems'} (checks of <code>oxl:RegistrationShape</code>; oxilite ignores the values):
          <ul>{registry.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
    </>
  );
}

function Legend() {
  return (
    <p className="legend">
      <span><i className="swatch role-ontology" /> ontology</span>
      <span><i className="swatch role-shacl" /> shapes</span>
      <span><i className="swatch role-shex" /> ShEx</span>
      <span><i className="swatch data" /> data</span>
      <span><i className="swatch all" /> all graphs</span>
      <span><i className="swatch missing" /> no triples / not registered</span>
      <span className="dim">faded: inactive · dashed edge: imports · click a graph for details</span>
    </p>
  );
}

function Registrations({ schemas, select, selected }: { schemas: SchemaGraph[]; select: (g: string) => void; selected?: string }) {
  if (!schemas.length) return <p className="note">No graph is registered as schema. Use "Register graph…" or <code>oxilite registry register</code>.</p>;
  return (
    <div className="scroller">
      <table className="registry">
        <thead>
          <tr><th>graph</th><th>roles</th><th>state</th><th>applies to</th><th>imports</th><th>version</th><th>triples</th><th>loaded</th></tr>
        </thead>
        <tbody>
          {schemas.map((s) => (
            <tr key={s.graph} className={`${s.active ? '' : 'inactive'} ${selected === s.graph ? 'selected' : ''}`} onClick={() => { select(s.graph); }}>
              <td title={s.graph}>{graphLabel(s.graph)}</td>
              <td><Roles roles={s.roles} /></td>
              <td>{s.active ? 'active' : 'inactive'}</td>
              <td>{s.appliesTo.length ? s.appliesTo.map(graphLabel).join(', ') : 'all graphs'}</td>
              <td>{s.imports.map(graphLabel).join(', ')}</td>
              <td>{s.version ?? ''}</td>
              <td>{s.triples?.toLocaleString() ?? ''}</td>
              <td>{s.loadedAt?.replace('T', ' ').replace(/(\.\d+)?Z$/, '') ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerGraph({ registry, schemas, select, selected, fallback }: { registry: Registry; schemas: SchemaGraph[]; select: (g: string) => void; selected?: string; fallback: boolean }) {
  const rows = dataGraphs(registry).map((d) => ({ d, applying: effectiveSchemas(registry, d.graph, schemas) }));
  if (!rows.length) return <p className="note">No data graphs.</p>;
  const cell = (applying: Applying[], role: 'ontology' | 'shacl' | 'shex') => {
    const list = applying.filter((a) => a.roles.includes(role));
    return (
      <td>
        {list.map((a) => (
          <div key={a.schema}>
            <GraphLink iri={a.schema} select={select} /> <Via a={a} select={select} />
          </div>
        ))}
        {!list.length && (role === 'ontology' && fallback ? <span className="via">every graph's axioms</span> : <span className="dim">none</span>)}
      </td>
    );
  };
  return (
    <div className="scroller">
      <table className="registry">
        <thead>
          <tr><th>data graph</th><th>triples</th><th>ontologies (reasoning)</th><th>shapes</th><th>ShEx</th></tr>
        </thead>
        <tbody>
          {rows.map(({ d, applying }) => (
            <tr key={d.graph} className={`${d.missing ? 'missing' : ''} ${selected === d.graph ? 'selected' : ''}`}>
              <td><GraphLink iri={d.graph} select={select} /></td>
              <td>{d.missing ? 'none' : (d.triples?.toLocaleString() ?? '')}</td>
              {cell(applying, 'ontology')}
              {cell(applying, 'shacl')}
              {cell(applying, 'shex')}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        Reasoning is per graph: a quad is entailed with the ontologies that apply to its graph. The shape index Cypher uses is keyed by class and ignores these mappings.
      </p>
    </div>
  );
}

function Details({ id, registry, schemas, select, writable, close }: {
  id: string;
  registry: Registry;
  schemas: SchemaGraph[];
  select: (g: string) => void;
  writable: boolean;
  close: () => void;
}) {
  const schema = schemas.find((s) => s.graph === id);
  const data = dataGraphs(registry).find((d) => d.graph === id);
  const button = (op: RegistryOp, label: string, danger = false) =>
    writable && <button type="button" className={danger ? 'action danger' : 'action'} onClick={() => { edit(op, id); }}>{label}</button>;
  let body: ReactNode;
  if (schema) {
    // Where it takes effect: directly, through All graphs, or as an import.
    const reaches = dataGraphs(registry).filter((d) => effectiveSchemas(registry, d.graph, schemas).some((a) => a.schema === id));
    body = (
      <>
        <p><Roles roles={schema.roles} /> <span className="dim">{schema.active ? 'active' : 'inactive: registered and hidden, contributes nothing'}</span></p>
        <table className="plain">
          <tbody>
            <tr><td>applies to</td><td>{schema.appliesTo.length ? schema.appliesTo.map((g) => <span key={g}><GraphLink iri={g} select={select} /> </span>) : 'every graph (oxl:AllGraphs)'}</td></tr>
            <tr><td>takes effect in</td><td>{reaches.length ? reaches.map((d) => <span key={d.graph}><GraphLink iri={d.graph} select={select} /> </span>) : <span className="dim">no data graph</span>}</td></tr>
            {schema.imports.length > 0 && (
              <tr><td>imports</td><td>{schema.imports.map((i) => {
                const target = schemas.find((s) => s.roles.includes('ontology') && (s.graph === i || s.iri === i));
                return <span key={i}>{target ? <GraphLink iri={target.graph} select={select} /> : <span title="no registered ontology answers to it: recorded and ignored">{graphLabel(i)} (not registered)</span>} </span>;
              })}</td></tr>
            )}
            {schema.iri && <tr><td>ontology IRI</td><td>{schema.iri}</td></tr>}
            {schema.version && <tr><td>version</td><td>{schema.version}</td></tr>}
            {schema.sha256 && <tr><td>sha256</td><td><code>{schema.sha256}</code></td></tr>}
            {schema.loadedAt && <tr><td>registered</td><td>{schema.loadedAt}</td></tr>}
            <tr><td>triples</td><td>{schema.triples?.toLocaleString() ?? 'not counted'}</td></tr>
          </tbody>
        </table>
        <p className="actions">
          {button('map', 'Change targets…')}
          {schema.roles.length < 3 && button('addRole', 'Add role…')}
          {schema.active ? button('deactivate', 'Deactivate') : button('activate', 'Activate')}
          {button('unregister', 'Unregister')}
          {button('drop', 'Drop graph…', true)}
        </p>
      </>
    );
  } else if (id === ALL_GRAPHS) {
    const global = schemas.filter((s) => s.appliesTo.length === 0);
    body = (
      <>
        <p>Schemas without targets, or with <code>oxl:appliesTo oxl:AllGraphs</code>, apply to every graph.</p>
        <p>{global.map((s) => <span key={s.graph}><GraphLink iri={s.graph} select={select} /> </span>)}</p>
      </>
    );
  } else if (SYSTEM_GRAPHS.includes(id)) {
    body = <p>A system graph oxilite maintains itself. It never contributes axioms or shapes. {registry.systemGraphs.current ? 'Installed at the current vocabulary version.' : 'Not at the current vocabulary version.'}</p>;
  } else if (data) {
    const applying = effectiveSchemas(registry, id, schemas);
    body = (
      <>
        <p className="dim">{data.missing ? 'Named as a target, but the graph holds no triples.' : `Data graph, ${data.triples?.toLocaleString() ?? 'not counted'} triples.`}</p>
        <table className="plain">
          <tbody>
            {applying.map((a) => (
              <tr key={a.schema}><td><GraphLink iri={a.schema} select={select} /></td><td><Roles roles={a.roles} /></td><td><Via a={a} select={select} /></td></tr>
            ))}
          </tbody>
        </table>
        {!applying.length && <p className="dim">No active schema applies to this graph.</p>}
        <p className="actions">{!data.missing && button('register', 'Register as schema graph…')}</p>
      </>
    );
  } else {
    body = <p>An import that no registered ontology answers to, by graph name or <code>oxl:ontologyIri</code>. oxilite records it and fetches nothing; load and register the ontology to use it.</p>;
  }
  return (
    <section className="details">
      <h3>
        {graphLabel(id)} <span className="iri">{id}</span>
        <span className="toggle">
          {id !== ALL_GRAPHS && <><button type="button" className="link" onClick={() => { post({ type: 'openResource', iri: id }); }}>resource</button>{' · '}</>}
          <button type="button" className="link" onClick={close}>close</button>
        </span>
      </h3>
      {body}
    </section>
  );
}
