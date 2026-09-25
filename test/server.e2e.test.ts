// Drives the real `oxilite studio-server` over stdio with the same JSON-RPC library the
// language client uses, checking the payload shapes the views rely on.
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, type MessageConnection } from 'vscode-jsonrpc/node';
import { Methods, type Connection, type ExplorerNode, type ProofNode, type QueryPayload, type StoreStatus } from '../shared/protocol';
import { graphOf } from '../shared/graph';
import { formatTerm, toTable } from '../shared/terms';

// OXILITE_BIN, or a release build in the sibling oxilite checkout.
const binary = process.env.OXILITE_BIN ?? path.resolve(__dirname, '../oxilite/target/release/oxilite');
const run = fs.existsSync(binary) ? describe : describe.skip;

run('studio-server end to end', () => {
  let server: ChildProcess;
  let rpc: MessageConnection;
  let dir: string;
  const changed: StoreStatus[] = [];

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oxilite-studio-e2e-'));
    fs.writeFileSync(
      path.join(dir, 'people.ttl'),
      '@prefix ex: <http://ex.org/> .\nex:alice ex:knows ex:bob ; ex:age 42 .\nex:bob ex:name "Bob"@en .\n',
    );
    fs.writeFileSync(
      path.join(dir, 'reach.dl'),
      '@prefix ex: <http://ex.org/> .\nex:reaches(?x, ?y) :- ex:knows(?x, ?y).\n',
    );
    server = spawn(binary, ['studio-server', '--store', ':memory:']);
    rpc = createMessageConnection(new StreamMessageReader(server.stdout!), new StreamMessageWriter(server.stdin!));
    rpc.onNotification(Methods.storeChanged, (s: StoreStatus) => {
      changed.push(s);
    });
    rpc.listen();
    await rpc.sendRequest('initialize', {
      processId: process.pid,
      capabilities: {},
      workspaceFolders: [{ uri: pathToFileURL(dir).toString(), name: 'e2e' }],
    });
    await rpc.sendNotification('initialized', {});
  });

  afterAll(async () => {
    await rpc.sendRequest('shutdown');
    await rpc.sendNotification('exit');
    rpc.dispose();
    server.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // @lat: [[tests#Server end to end#Status reports the workspace]]
  it('loads the workspace and reports it', async () => {
    const status = await rpc.sendRequest<StoreStatus>(Methods.status);
    expect(status.triples).toBe(3);
    expect(status.files.map((f) => f.role).sort()).toEqual(['data', 'rules']);
    expect(status.files).toHaveLength(2);
    expect(changed.length).toBeGreaterThan(0);
  });

  // @lat: [[tests#Server end to end#Query payload renders]]
  it('returns payloads the grid can render', async () => {
    const payload = await rpc.sendRequest<QueryPayload>(Methods.query, {
      query: 'PREFIX ex: <http://ex.org/> SELECT ?name ?age WHERE { ?a ex:knows ?b ; ex:age ?age . ?b ex:name ?name }',
    });
    const table = toTable(payload);
    expect(table.columns).toEqual(['name', 'age']);
    expect(table.rows.map((r) => r.map(formatTerm))).toEqual([['"Bob"@en', '"42"^^xsd:integer']]);
    const graph = await rpc.sendRequest<QueryPayload>(Methods.query, { query: 'CONSTRUCT WHERE { ?s ?p ?o }' });
    // The asserted triples plus the one the workspace rule derives.
    expect(toTable(graph).rows).toHaveLength(4);
  });

  // @lat: [[tests#Server end to end#Rules, Cypher and why]]
  it('runs Datalog and Cypher, and explains a rule conclusion', async () => {
    const dl = await rpc.sendRequest<QueryPayload>(Methods.datalog, {
      query: '@prefix ex: <http://ex.org/> .\nex:r(?x, ?y) :- ex:knows(?x, ?y).\n?- ex:r(?a, ?b).\n',
    });
    expect(dl.kind).toBe('solutions');
    const cy = await rpc.sendRequest<QueryPayload>(Methods.cypher, { query: 'MATCH p = (a)-[:knows]->(b) RETURN p' });
    expect(cy.kind).toBe('cypher');
    expect(graphOf(cy)?.edges.map((e) => e.label)).toEqual(['knows']);
    const iri = (value: string) => ({ termType: 'NamedNode', value });
    const tree = await rpc.sendRequest<ProofNode>(Methods.why, {
      s: iri('http://ex.org/alice'),
      p: iri('http://ex.org/reaches'),
      o: iri('http://ex.org/bob'),
    });
    expect(tree.status).toBe('inferred');
    expect(tree.producer).toBe('reach.dl');
    expect(tree.premises?.[0].status).toBe('asserted');
    const root = await rpc.sendRequest<ExplorerNode[]>(Methods.explorer, { node: 'root' });
    expect(root.map((n) => n.id)).toContain('classes');
  });

  // @lat: [[tests#Server end to end#Attaching a new path creates the database]]
  it('creates a database when attaching a path that does not exist', async () => {
    const file = path.join(dir, 'db', 'new.sqlite');
    fs.mkdirSync(path.dirname(file));
    const list = await rpc.sendRequest<Connection[]>(Methods.attach, { path: file, readOnly: false });
    expect(fs.existsSync(file)).toBe(true);
    const created = list.find((c) => c.path === file)!;
    expect(created).toMatchObject({ active: true, readOnly: false, triples: 0 });
    // Updates on an attached store ask first; confirmed, they persist in the new file.
    const insert = { query: 'INSERT DATA { <http://ex.org/a> <http://ex.org/p> 1 }', connection: created.id };
    await expect(rpc.sendRequest(Methods.query, insert)).rejects.toThrow();
    await rpc.sendRequest(Methods.query, { ...insert, confirmed: true });
    const rows = await rpc.sendRequest<QueryPayload>(Methods.query, { query: 'SELECT * { ?s ?p ?o }', connection: created.id });
    expect(toTable(rows).rows).toHaveLength(1);
    const after = await rpc.sendRequest<Connection[]>(Methods.detach, { id: created.id });
    expect(after.find((c) => c.active)?.id).toBe('project');
  });

  // @lat: [[tests#Server end to end#Bad query rejects]]
  it('rejects a query that does not parse', async () => {
    await expect(rpc.sendRequest(Methods.query, { query: 'SELEC' })).rejects.toThrow();
  });
});
