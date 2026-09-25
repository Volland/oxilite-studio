// Which connection a document runs on: pins in query files (`oxilite: connection = …`) and the
// connection references notebooks keep in their metadata. Pure, so it is tested without VS Code.
// @lat: [[architecture#Connections#Pinned documents]]
import * as path from 'node:path';
import type { Connection } from './protocol';

/** Where a document runs, independent of the machine it is on. */
export type ConnectionRef =
  | { kind: 'project' }
  | { kind: 'sqlite'; path: string; readOnly: boolean }
  | { kind: 'd1'; account: string; database: string };

export interface Pin {
  ref: ConnectionRef;
  /** The zero-based line the pin is on, for a CodeLens. */
  line: number;
}

/** Line-comment markers per language. */
const COMMENTS: Record<string, string[]> = {
  sparql: ['#'],
  turtle: ['#'],
  datalog: ['%', '#'],
  cypher: ['//'],
};

const PIN = /^oxilite:\s*connection\s*=\s*(.+?)\s*$/i;

/** A connection target as written in a pin: `project`, `d1:<account>/<database>`, or a SQLite
 * path optionally followed by `read-write` (pins open files read-only by default). */
export function parseTarget(target: string): ConnectionRef | undefined {
  const t = target.trim();
  if (!t) return undefined;
  if (t.toLowerCase() === 'project') return { kind: 'project' };
  const d1 = /^d1:([^/\s]+)\/(\S+)$/i.exec(t);
  if (d1) return { kind: 'd1', account: d1[1], database: d1[2] };
  const rw = /^(.*?)\s+(read-write|read-only)$/i.exec(t);
  const file = (rw ? rw[1] : t).replace(/^sqlite:/i, '').trim();
  if (!file) return undefined;
  return { kind: 'sqlite', path: file, readOnly: !rw || rw[2].toLowerCase() === 'read-only' };
}

/** The pin in a document's first comment block, if any. Blank lines are skipped; the first line
 * that is not a comment ends the search, so a pin cannot hide in the middle of a query. */
export function parsePin(text: string, languageId: string): Pin | undefined {
  const markers = COMMENTS[languageId];
  if (!markers) return undefined;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const marker = markers.find((m) => line.startsWith(m));
    if (!marker) return undefined;
    const m = PIN.exec(line.slice(marker.length).trim());
    if (m) {
      const ref = parseTarget(m[1]);
      return ref ? { ref, line: i } : undefined;
    }
  }
  return undefined;
}

/** A reference as stored in notebook metadata: `project`, `sqlite:<path>` or `d1:<a>/<d>`. */
export function refToString(ref: ConnectionRef): string {
  switch (ref.kind) {
    case 'project':
      return 'project';
    case 'sqlite':
      return `sqlite:${ref.path}${ref.readOnly ? '' : ' read-write'}`;
    case 'd1':
      return `d1:${ref.account}/${ref.database}`;
  }
}

export function refFromString(s: unknown): ConnectionRef | undefined {
  return typeof s === 'string' ? parseTarget(s) : undefined;
}

/** A short name for the target. */
export function refLabel(ref: ConnectionRef): string {
  switch (ref.kind) {
    case 'project':
      return 'Project store';
    case 'sqlite':
      return path.basename(ref.path);
    case 'd1':
      return `D1 ${ref.database.slice(0, 8)}`;
  }
}

/** The server's connection id for a reference; SQLite paths resolve against the workspace root. */
export function connectionId(ref: ConnectionRef, root: string | undefined): string {
  switch (ref.kind) {
    case 'project':
      return 'project';
    case 'sqlite':
      return `attached:${absolute(ref.path, root)}`;
    case 'd1':
      return `d1:${ref.account}/${ref.database}`;
  }
}

export function absolute(file: string, root: string | undefined): string {
  return path.isAbsolute(file) || !root ? file : path.join(root, file);
}

/** The reference to save for a connection: paths inside the workspace become relative, so a
 * notebook travels with its repository. */
export function refFromConnection(c: Connection, root: string | undefined): ConnectionRef | undefined {
  if (c.kind === 'project') return { kind: 'project' };
  if (c.kind === 'd1') {
    const m = /^d1:([^/]+)\/(.+)$/.exec(c.id);
    return m ? { kind: 'd1', account: m[1], database: m[2] } : undefined;
  }
  const rel = root ? path.relative(root, c.path) : c.path;
  const inside = root && !rel.startsWith('..') && !path.isAbsolute(rel);
  return { kind: 'sqlite', path: inside ? rel : c.path, readOnly: c.readOnly };
}
