import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { parseForgeFilesToSemanticModel } from '../packages/language/dist/index.js';
import { generateClient } from '../packages/generators/generated/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');

describe('Client SDK Generator', () => {
  it('generates a fetch-based typed client from the semantic model', async () => {
    const model = await parseForgeFilesToSemanticModel([
      {
        uri: 'file:///contracts/product.forge',
        source: `enum ProductStatus {
  draft
  active
}

contract Product {
  sku: string @primary
  name: string
  status: ProductStatus @default(active)
  createdAt: datetime @default(now()) @readonly
}
`
      }
    ]);

    const [client] = generateClient(model);
    assert.equal(client.path, 'client/index.ts');
    assert.doesNotMatch(client.content, /import type/);
    assert.match(client.content, /export const ProductStatus/);
    assert.match(client.content, /export type ProductStatus/);
    assert.match(client.content, /export interface Product/);
    assert.match(client.content, /export interface CreateProductInput/);
    assert.match(client.content, /sku: string;/);
    assert.match(client.content, /status\?: ProductStatus;/);
    const createInput = client.content.match(/export interface CreateProductInput \{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.doesNotMatch(createInput, /createdAt:/);
    assert.match(client.content, /findMany\(\): Promise<Entity\[\]>/);
    assert.match(client.content, /createForgeClient/);
    assert.match(client.content, /products: createResourceClient<Product, CreateProductInput, UpdateProductInput>/);
  });

  it('CLI compile emits the client target', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-client-cli-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid @primary
  email: string
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'compile', '--target', 'typescript,client'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Generated 2 file\(s\)/);
    const client = await readFile(path.join(root, 'generated', 'client', 'index.ts'), 'utf8');
    assert.match(client, /users: createResourceClient<User, CreateUserInput, UpdateUserInput>/);
  });

  it('CLI generate client writes the client SDK', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-client-generate-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'product.forge'),
      `contract Product {
  sku: string @primary
  name: string
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'generate', 'client'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Generated TypeScript client/);
    const client = await readFile(path.join(root, 'generated', 'client', 'index.ts'), 'utf8');
    assert.match(client, /export interface Product/);
    assert.match(client, /products: createResourceClient<Product, CreateProductInput, UpdateProductInput>/);
  });
});
