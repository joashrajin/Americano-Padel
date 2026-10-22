// Assembles the Spacefast publish folder: the static app from public/ plus the
// functions, routing and config from spacefast/.

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}dist/spacefast`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(`${root}public`, out, { recursive: true });
cpSync(`${root}spacefast`, out, { recursive: true });

console.log(`Built ${out}`);
