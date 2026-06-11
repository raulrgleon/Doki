import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadGlobalScript(filename, exportName) {
  const code = readFileSync(join(root, filename), 'utf8');
  const fn = new Function(`${code}\nreturn ${exportName};`);
  return fn();
}

export const RAW_MATCHES = loadGlobalScript('matches-data.js', 'RAW_MATCHES');
export const TEAMS = loadGlobalScript('teams.js', 'TEAMS');
