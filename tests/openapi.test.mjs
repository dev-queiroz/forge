import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { generateOpenApi } from '../packages/generators/dist/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');

const testModel = {
  contracts: [
    {
      id: 'User',
      name: 'User',
      namespace: '',
      fields: [
        { name: 'id', type: 'uuid', optional: false },
        { name: 'name', type: 'string', optional: false },
        { name: 'age', type: 'int', optional: true }
      ],
      invariants: []
    }
  ]
};

describe('OpenAPI Generator', () => {

  it('generates valid OpenAPI 3.0.3 schema with schemas and standard CRUD paths', () => {
    const output = JSON.parse(generateOpenApi(testModel));

    assert.equal(output.openapi, '3.0.3');
    assert.equal(output.info.title, 'Forge API');
    
    // Components schema verification
    const schemas = output.components.schemas;
    assert.ok(schemas.User);
    assert.equal(schemas.User.type, 'object');
    assert.deepEqual(schemas.User.required, ['id', 'name']);
    
    assert.deepEqual(schemas.User.properties.id, { type: 'string', format: 'uuid' });
    assert.deepEqual(schemas.User.properties.name, { type: 'string' });
    assert.deepEqual(schemas.User.properties.age, { type: 'integer' });

    // Paths verification
    const paths = output.paths;
    assert.ok(paths['/user']);
    assert.ok(paths['/user'].get);
    assert.ok(paths['/user'].post);
    
    assert.ok(paths['/user/{id}']);
    assert.ok(paths['/user/{id}'].get);
    assert.equal(paths['/user/{id}'].get.parameters[0].name, 'id');
  });

  it('CLI forge generate openapi command generates dist/openapi.json', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-openapi-cli-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'usuario.forge'),
      `namespace usuarios
      contract Usuario {
          id: uuid
          nome: string
      }`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'generate', 'openapi'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const fileContent = JSON.parse(await readFile(path.join(root, 'dist', 'openapi.json'), 'utf8'));
    assert.equal(fileContent.openapi, '3.0.3');
    assert.ok(fileContent.components.schemas.Usuario);
  });

  it('CLI forge compile --emit openapi flag generates dist/openapi.json', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-openapi-compile-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'usuario.forge'),
      `namespace usuarios
      contract Usuario {
          id: uuid
          nome: string
      }`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'compile', '--emit', 'openapi'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const fileContent = JSON.parse(await readFile(path.join(root, 'dist', 'openapi.json'), 'utf8'));
    assert.equal(fileContent.openapi, '3.0.3');
    assert.ok(fileContent.components.schemas.Usuario);
  });

});
