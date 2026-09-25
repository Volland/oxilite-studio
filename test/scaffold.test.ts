import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePin } from '../shared/pin';
import { gitignoreAdditions, namespace, scaffold, slug, validBase } from '../shared/scaffold';

const binary = process.env.OXILITE_BIN ?? path.resolve(__dirname, '../oxilite/target/release/oxilite');

describe('new project scaffold', () => {
  // @lat: [[tests#New project#Names and namespaces are normalized]]
  it('normalizes names and base IRIs', () => {
    expect(slug('  My Knowledge Graph! ')).toBe('my-knowledge-graph');
    expect(slug('***')).toBe('project');
    expect(namespace('https://example.org/kg')).toBe('https://example.org/kg/');
    expect(namespace('https://example.org/kg#')).toBe('https://example.org/kg#');
    expect(validBase('https://example.org/kg')).toBe(true);
    expect(validBase('urn:example:kg')).toBe(true);
    expect(validBase('example.org/kg')).toBe(false);
    expect(validBase('https://example.org/a b')).toBe(false);
  });

  // @lat: [[tests#New project#The database query is pinned]]
  it('pins the database query and extends an existing .gitignore', () => {
    const files = scaffold({ name: 'kg', base: 'https://example.org/kg/', reasoning: 'rdfs', database: 'db/kg.sqlite' });
    const pinned = files.find((f) => f.path === 'queries/database.rq')!;
    expect(parsePin(pinned.content, 'sparql')?.ref).toEqual({ kind: 'sqlite', path: 'db/kg.sqlite', readOnly: false });
    expect(scaffold({ name: 'kg', base: 'https://example.org/kg/', reasoning: 'rdfs' }).some((f) => f.path === 'queries/database.rq')).toBe(false);
    const ignore = files.find((f) => f.path === '.gitignore')!.content;
    expect(gitignoreAdditions('node_modules/\n.oxilite/\n', ignore)).toEqual(['*.sqlite-wal', '*.sqlite-shm']);
  });

  // @lat: [[tests#New project#A new project passes oxilite check]]
  it.skipIf(!fs.existsSync(binary))('passes oxilite check under every reasoning profile', () => {
    for (const reasoning of ['none', 'rdfs', 'owlql', 'owl2rl'] as const) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `oxilite-scaffold-${reasoning}-`));
      try {
        for (const f of scaffold({ name: 'My "KG"', base: 'https://example.org/my-kg', reasoning })) {
          fs.mkdirSync(path.dirname(path.join(dir, f.path)), { recursive: true });
          fs.writeFileSync(path.join(dir, f.path), f.content);
        }
        // A failing check exits with status 1, which throws.
        const report = JSON.parse(execFileSync(binary, ['check', '--json', dir], { encoding: 'utf8' }));
        expect(report.passed).toBe(true);
        expect(report.tests.map((t: { passed: boolean }) => t.passed)).toEqual([true, true]);
      } catch (e) {
        const out = (e as { stdout?: string }).stdout;
        throw new Error(`oxilite check failed with reasoning ${reasoning}:\n${out ?? String(e)}`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });
});
