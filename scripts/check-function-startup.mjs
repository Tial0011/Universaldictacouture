// Exercise the server entry points as well as Vite. Lambda can disable
// require(ESM), even when the build machine supports it.
import { readdir } from 'node:fs/promises';
const directory = new URL('../netlify/functions/', import.meta.url);
for (const name of await readdir(directory)) {
  if (!name.endsWith('.js')) continue;
  const entry = await import(new URL(name, directory));
  if (typeof entry.default !== 'function' && typeof entry.handler !== 'function') {
    throw new Error(`No function handler exported: ${name}`);
  }
  console.log(`Function startup OK: ${name}`);
}
