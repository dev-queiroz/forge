import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');
const npmCmd = 'npm';
const npxCmd = 'npx';

describe('Generated NestJS backend E2E', () => {
  it('installs, generates Prisma Client, compiles TypeScript and imports the generated app module', { timeout: 240_000 }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-nest-e2e-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(path.join(root, 'forge.config.json'), JSON.stringify({
      contracts: 'contracts/**/*.forge',
      output: 'generated',
      targets: ['nest']
    }, null, 2), 'utf8');
    await writeFile(
      path.join(root, 'contracts', 'commerce.forge'),
      `namespace commerce

enum OrderStatus {
  pending
  paid
  cancelled
}

contract Product {
  sku: string @primary
  name: string
  price: decimal
  stock: int
  tags: string[]
  metadata: json?
  createdAt: datetime @default(now()) @readonly

  invariant price > 0
  invariant stock >= 0
  invariant price * stock > 100
}

contract Order {
  id: uuid @primary @default(uuid())
  productSku: string
  product: Product @foreign(productSku)
  quantity: int @default(1)
  status: OrderStatus @default(pending)
  note: string?
  total: decimal

  invariant quantity > 0
  invariant total > 0
}
`,
      'utf8'
    );

    const compile = spawnSync(process.execPath, [cliPath, 'compile', '--target', 'nest'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    assert.equal(compile.status, 0, compile.stderr || compile.stdout);

    const backend = path.join(root, 'dist', 'backend');
    const prismaSchema = await readFile(path.join(backend, 'prisma', 'schema.prisma'), 'utf8');
    assert.match(prismaSchema, /model Product/);
    assert.match(prismaSchema, /orders Order\[\] @relation\("Order_product"\)/);
    assert.match(prismaSchema, /product Product @relation\("Order_product", fields: \[productSku\], references: \[sku\]\)/);

    const install = runTool(npmCmd, ['install', '--silent', '--no-audit', '--no-fund'], {
      cwd: backend,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024
    });
    assertProcessOk(install, 'npm install');

    const prismaCli = path.join(backend, 'node_modules', 'prisma', 'build', 'index.js');
    const env = {
      ...process.env,
      DATABASE_URL: 'postgresql://forge:forge@localhost:5432/forge',
      FORGE_PRISMA_BIN: process.execPath,
      FORGE_PRISMA_BIN_ARGS: JSON.stringify([prismaCli])
    };
    const migrateDiff = spawnSync(process.execPath, [cliPath, 'migrate', 'diff', '--from-empty', '--script'], {
      cwd: root,
      env,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024
    });
    assertProcessOk(migrateDiff, 'forge migrate diff');
    assert.match(migrateDiff.stdout, /CREATE TABLE/);

    const prismaGenerate = runTool(npxCmd, ['prisma', 'generate'], {
      cwd: backend,
      env,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024
    });
    assertProcessOk(prismaGenerate, 'npx prisma generate');

    const tsc = runTool(npxCmd, ['tsc', '-p', 'tsconfig.json'], {
      cwd: backend,
      env,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024
    });
    assertProcessOk(tsc, 'npx tsc -p tsconfig.json');

    const importAppModule = spawnSync(process.execPath, ['-e', "require('./dist/app.module.js');"], {
      cwd: backend,
      env,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    assertProcessOk(importAppModule, 'node import app.module');

    const validateGeneratedSchema = spawnSync(process.execPath, ['-e', `
const { CreateProductSchema, UpdateProductSchema } = require('./dist/products/dto/product.schema.js');
const { ZodValidationPipe } = require('./dist/common/validation/zod-validation.pipe.js');
const valid = CreateProductSchema.safeParse({
  sku: 'sku-1',
  name: 'Keyboard',
  price: '11.5',
  stock: 10,
  tags: ['hardware'],
  metadata: { color: 'black' }
});
if (!valid.success) {
  console.error(valid.error);
  process.exit(1);
}
const invalid = CreateProductSchema.safeParse({
  sku: 'sku-2',
  name: 'Cable',
  price: 5,
  stock: 10,
  tags: []
});
if (invalid.success || invalid.error.issues[0].message !== 'price * stock must be greater than 100') {
  console.error(invalid);
  process.exit(1);
}
const partial = UpdateProductSchema.safeParse({ name: 'Renamed' });
if (!partial.success) {
  console.error(partial.error);
  process.exit(1);
}
const pipe = new ZodValidationPipe(CreateProductSchema);
const transformed = pipe.transform({
  sku: 'sku-3',
  name: 'Mouse',
  price: 20,
  stock: 8,
  tags: []
});
if (transformed.price !== 20) {
  console.error(transformed);
  process.exit(1);
}
try {
  pipe.transform({ sku: 'sku-4', price: 20, stock: 8, tags: [] });
  process.exit(1);
} catch (error) {
  const response = error.getResponse();
  if (response.message !== 'Validation failed' || response.issues[0].field !== 'name' || !response.issues[0].message.includes('name:')) {
    console.error(response);
    process.exit(1);
  }
}
`], {
      cwd: backend,
      env,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    assertProcessOk(validateGeneratedSchema, 'node validate generated Nest Zod schemas');
  });
});

function runTool(command, args, options) {
  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', command, ...args], options);
  }

  return spawnSync(command, args, options);
}

function assertProcessOk(result, label) {
  assert.equal(
    result.status,
    0,
    [
      `${label} failed`,
      result.error ? `error: ${result.error.message}` : undefined,
      result.signal ? `signal: ${result.signal}` : undefined,
      result.stdout ? `stdout:\n${result.stdout}` : undefined,
      result.stderr ? `stderr:\n${result.stderr}` : undefined
    ].filter(Boolean).join('\n\n')
  );
}
