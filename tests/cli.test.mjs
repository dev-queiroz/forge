import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');

describe('forge compile', () => {
  it('generates Zod artifacts alongside existing generators', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'usuario.forge'),
      `namespace usuarios

contract Usuario {
    id: uuid
    nome: string
    email?: string
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /generated 3 file\(s\)/);

    const zodSource = await readFile(path.join(root, 'generated', 'zod', 'Usuario.ts'), 'utf8');
    assert.equal(
      zodSource,
      `import { z } from "zod";

export const UsuarioSchema = z.object({
  id: z.string(),
  nome: z.string(),
  email: z.string().optional(),
});

export type Usuario = z.infer<typeof UsuarioSchema>;
`
    );

    await readFile(path.join(root, 'generated', 'typescript', 'Usuario.ts'), 'utf8');
    await readFile(path.join(root, 'generated', 'json-schema', 'Usuario.schema.json'), 'utf8');
  });
});
