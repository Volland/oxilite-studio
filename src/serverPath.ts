// Finds the `oxilite` binary that runs `studio-server`.
// @lat: [[architecture#Packaging]]
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ServerLocation {
  command: string;
  source: 'setting' | 'bundled';
}

/** The `oxilite.server.path` setting wins; otherwise the binary bundled in the VSIX under `bin/`. */
export function findServer(setting: string, extensionPath: string, platform = process.platform): ServerLocation | undefined {
  if (setting.trim()) return { command: setting.trim(), source: 'setting' };
  const bundled = path.join(extensionPath, 'bin', platform === 'win32' ? 'oxilite.exe' : 'oxilite');
  return fs.existsSync(bundled) ? { command: bundled, source: 'bundled' } : undefined;
}
