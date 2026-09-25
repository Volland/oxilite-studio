import { describe, expect, it } from 'vitest';
import { connectionId, parsePin, refFromConnection, refFromString, refLabel, refToString } from '../shared/pin';
import type { Connection } from '../shared/protocol';

describe('pins', () => {
  // @lat: [[tests#Pins#Each language pins in its own comments]]
  it('finds a pin in the first comment block, in each language\'s comments', () => {
    expect(parsePin('# oxilite: connection = project\nSELECT * {}', 'sparql')).toEqual({ ref: { kind: 'project' }, line: 0 });
    expect(parsePin('\n// A report\n// oxilite: connection = d1:acc/db123\nMATCH (n) RETURN n', 'cypher')).toEqual({
      ref: { kind: 'd1', account: 'acc', database: 'db123' },
      line: 2,
    });
    expect(parsePin('% oxilite: connection = data/prod.sqlite\n', 'datalog')?.ref).toEqual({ kind: 'sqlite', path: 'data/prod.sqlite', readOnly: true });
    expect(parsePin('# oxilite: connection = data/prod.sqlite read-write', 'sparql')?.ref).toEqual({ kind: 'sqlite', path: 'data/prod.sqlite', readOnly: false });
  });

  // @lat: [[tests#Pins#A pin cannot hide below the query]]
  it('ignores pins after the first non-comment line and in unknown languages', () => {
    expect(parsePin('SELECT * {}\n# oxilite: connection = project', 'sparql')).toBeUndefined();
    expect(parsePin('// oxilite: connection = project', 'sparql')).toBeUndefined();
    expect(parsePin('# oxilite: connection = project', 'markdown')).toBeUndefined();
    expect(parsePin('# oxilite: connection =   ', 'sparql')).toBeUndefined();
  });

  // @lat: [[tests#Pins#References round-trip and resolve]]
  it('round-trips references, resolves ids and saves relative paths', () => {
    for (const s of ['project', 'sqlite:data/prod.sqlite', 'sqlite:data/prod.sqlite read-write', 'd1:acc/db']) {
      expect(refToString(refFromString(s)!)).toBe(s);
    }
    expect(connectionId({ kind: 'sqlite', path: 'data/prod.sqlite', readOnly: true }, '/w')).toBe('attached:/w/data/prod.sqlite');
    expect(connectionId({ kind: 'sqlite', path: '/abs/x.sqlite', readOnly: true }, '/w')).toBe('attached:/abs/x.sqlite');
    const attached: Connection = { id: 'attached:/w/data/prod.sqlite', kind: 'sqlite', label: 'prod.sqlite', path: '/w/data/prod.sqlite', readOnly: false, active: false, triples: 3 };
    expect(refFromConnection(attached, '/w')).toEqual({ kind: 'sqlite', path: 'data/prod.sqlite', readOnly: false });
    expect(refFromConnection({ ...attached, path: '/elsewhere/a.sqlite' }, '/w')).toEqual({ kind: 'sqlite', path: '/elsewhere/a.sqlite', readOnly: false });
    expect(refFromConnection({ ...attached, id: 'd1:acc/db', kind: 'd1' }, '/w')).toEqual({ kind: 'd1', account: 'acc', database: 'db' });
    expect(refLabel({ kind: 'd1', account: 'a', database: '0123456789' })).toBe('D1 01234567');
  });
});
