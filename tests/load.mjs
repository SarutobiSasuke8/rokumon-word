// Test helpers. The game ships as one HTML file, so the tests read the scripts straight out of it:
// nothing is duplicated and there is no build step to drift from what players get.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const indexPath = fileURLToPath(new URL('../index.html', import.meta.url));
export const html = readFileSync(indexPath, 'utf8');

/** The pure rules block (`<script id="rw-core">`), evaluated with no DOM, storage or clock. */
export function loadCore() {
  const match = html.match(/<script id="rw-core">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('rw-core script block not found in index.html');
  const context = vm.createContext({});
  return vm.runInContext(`${match[1]}\n;RWCore`, context, { filename: 'index.html#rw-core' });
}

/** Every inline script in the page, in order. */
export function inlineScripts() {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}
