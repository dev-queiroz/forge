import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');

describe('Prisma CLI Integration', () => {

  it('CLI forge compile generates Prisma schema automatically', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-prisma-compile-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
          id: uuid
          name: string
          email: string
      }`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);

    // Verify Prisma schema was generated
    const schemaPath = path.join(root, 'generated', 'prisma', 'schema.prisma');
    const schemaContent = await readFile(schemaPath, 'utf8');

    assert.ok(schemaContent.includes('model User'));
    assert.ok(schemaContent.includes('id String @id'));
    assert.ok(schemaContent.includes('name String'));
    assert.ok(schemaContent.includes('email String'));
    assert.ok(schemaContent.includes('generator client'));
    assert.ok(schemaContent.includes('datasource db'));
  });

  it('generates Prisma schema for multiple contracts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-prisma-multi-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
          id: uuid
          name: string
      }`,
      'utf8'
    );
    await writeFile(
      path.join(root, 'contracts', 'post.forge'),
      `contract Post {
          id: uuid
          title: string
          published: boolean
      }`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);

    const schemaPath = path.join(root, 'generated', 'prisma', 'schema.prisma');
    const schemaContent = await readFile(schemaPath, 'utf8');

    // Both models should be present
    assert.ok(schemaContent.includes('model User'));
    assert.ok(schemaContent.includes('model Post'));
    assert.ok(schemaContent.includes('title String'));
    assert.ok(schemaContent.includes('published Boolean'));
  });

  it('generates nullable fields in Prisma schema', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-prisma-nullable-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
          id: uuid
          name: string
          nickname?: string
          age?: int
      }`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);

    const schemaPath = path.join(root, 'generated', 'prisma', 'schema.prisma');
    const schemaContent = await readFile(schemaPath, 'utf8');

    assert.ok(schemaContent.includes('name String'));
    assert.ok(schemaContent.includes('nickname String?'));
    assert.ok(schemaContent.includes('age Int?'));
  });

  it('generates correct Prisma output path structure', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-prisma-path-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
          id: uuid
      }`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);

    // Should be generated at generated/prisma/schema.prisma
    const schemaPath = path.join(root, 'generated', 'prisma', 'schema.prisma');
    const schemaContent = await readFile(schemaPath, 'utf8');

    assert.ok(schemaContent.length > 0);
    assert.ok(schemaContent.includes('model User'));
  });

  it('preserves schema through multiple compile runs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-prisma-persist-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
          id: uuid
          email: string
      }`,
      'utf8'
    );

    // First compile
    const result1 = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(result1.status, 0, result1.stderr);

    // Verify output
    const schemaPath = path.join(root, 'generated', 'prisma', 'schema.prisma');
    const content1 = await readFile(schemaPath, 'utf8');

    // Second compile
    const result2 = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(result2.status, 0, result2.stderr);

    const content2 = await readFile(schemaPath, 'utf8');

    // Content should be consistent
    assert.equal(content1, content2);
  });

});
