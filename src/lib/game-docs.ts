import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Read a markdown doc straight out of the repo. The rules files are the single
 * source of truth, so the pages that show them read the same bytes git holds.
 * Server components only.
 */
export function readGameDoc(repoRelativePath: string): Promise<string> {
  const safe = path
    .normalize(repoRelativePath)
    .replace(/^(\.\.(\/|\\|$))+/, '');
  return readFile(path.join(process.cwd(), safe), 'utf8');
}
