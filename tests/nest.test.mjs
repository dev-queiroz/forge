import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { generateNest } from '../packages/generators/dist/index.js';

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

describe('NestJS Generator', () => {

  it('generates standard NestJS modules, controllers, services, and DTOs', () => {
    const files = generateNest(testModel);

    // Verify root configurations
    const packageJson = files.find(f => f.path === 'package.json');
    assert.ok(packageJson);
    assert.match(packageJson.content, /"name": "forge-nestjs-backend"/);

    const tsconfig = files.find(f => f.path === 'tsconfig.json');
    assert.ok(tsconfig);

    // Verify module, controller, service
    const moduleFile = files.find(f => f.path === 'src/users/users.module.ts');
    assert.ok(moduleFile);
    assert.match(moduleFile.content, /class UsersModule/);

    const controllerFile = files.find(f => f.path === 'src/users/users.controller.ts');
    assert.ok(controllerFile);
    assert.match(controllerFile.content, /@Controller\('users'\)/);

    const serviceFile = files.find(f => f.path === 'src/users/users.service.ts');
    assert.ok(serviceFile);
    assert.match(serviceFile.content, /class UsersService/);

    // Verify DTOs
    const userDtoFile = files.find(f => f.path === 'src/users/dto/user.dto.ts');
    assert.ok(userDtoFile);
    assert.match(userDtoFile.content, /id: string;/);
    assert.match(userDtoFile.content, /name: string;/);
    assert.match(userDtoFile.content, /age\?:? number;/);

    const createDtoFile = files.find(f => f.path === 'src/users/dto/create-user.dto.ts');
    assert.ok(createDtoFile);
    assert.ok(!createDtoFile.content.includes('id:'), 'Create DTO should not contain ID');
    assert.match(createDtoFile.content, /name: string;/);

    const updateDtoFile = files.find(f => f.path === 'src/users/dto/update-user.dto.ts');
    assert.ok(updateDtoFile);
    assert.match(updateDtoFile.content, /class UpdateUserDto extends PartialType\(CreateUserDto\)/);
  });

  it('CLI forge generate nest command generates dist/backend project', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-nest-cli-'));
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

    const result = spawnSync(process.execPath, [cliPath, 'generate', 'nest'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    
    // Check files generated
    const packageJsonContent = await readFile(path.join(root, 'dist', 'backend', 'package.json'), 'utf8');
    assert.match(packageJsonContent, /forge-nestjs-backend/);

    const controllerContent = await readFile(path.join(root, 'dist', 'backend', 'src', 'usuarios', 'usuarios.controller.ts'), 'utf8');
    assert.match(controllerContent, /class UsuariosController/);
  });

  it('CLI forge compile --emit nest flag generates dist/backend project', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-nest-compile-'));
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

    const result = spawnSync(process.execPath, [cliPath, 'compile', '--emit', 'nest'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    
    // Check files generated
    const packageJsonContent = await readFile(path.join(root, 'dist', 'backend', 'package.json'), 'utf8');
    assert.match(packageJsonContent, /forge-nestjs-backend/);

    const controllerContent = await readFile(path.join(root, 'dist', 'backend', 'src', 'usuarios', 'usuarios.controller.ts'), 'utf8');
    assert.match(controllerContent, /class UsuariosController/);
  });

});
