import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { generateNest } from '../packages/generators/generated/index.js';

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
        { name: 'age', type: 'int', optional: true },
        { name: 'createdAt', type: 'datetime', optional: false, readonly: true }
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
    assert.match(packageJson.content, /"zod":/);

    const tsconfig = files.find(f => f.path === 'tsconfig.json');
    assert.ok(tsconfig);
    assert.match(tsconfig.content, /"strict": true/);
    assert.match(tsconfig.content, /"strictNullChecks": true/);
    assert.match(tsconfig.content, /"noImplicitAny": true/);

    // Verify module, controller, service
    const moduleFile = files.find(f => f.path === 'src/users/users.module.ts');
    assert.ok(moduleFile);
    assert.match(moduleFile.content, /class UsersModule/);

    const controllerFile = files.find(f => f.path === 'src/users/users.controller.ts');
    assert.ok(controllerFile);
    assert.match(controllerFile.content, /@Controller\('users'\)/);
    assert.match(controllerFile.content, /new ZodValidationPipe\(CreateUserSchema\)/);
    assert.match(controllerFile.content, /new ZodValidationPipe\(UpdateUserSchema\)/);

    const serviceFile = files.find(f => f.path === 'src/users/users.service.ts');
    assert.ok(serviceFile);
    assert.match(serviceFile.content, /class UsersService/);
    assert.ok(!serviceFile.content.includes('as any'), 'Service should use typed Prisma delegates');

    // Verify DTOs
    const userDtoFile = files.find(f => f.path === 'src/users/dto/user.dto.ts');
    assert.ok(userDtoFile);
    assert.match(userDtoFile.content, /id: string;/);
    assert.match(userDtoFile.content, /name: string;/);
    assert.match(userDtoFile.content, /age\?: number \| null;/);

    const createDtoFile = files.find(f => f.path === 'src/users/dto/create-user.dto.ts');
    assert.ok(createDtoFile);
    assert.ok(!createDtoFile.content.includes('id:'), 'Create DTO should not contain ID');
    assert.ok(!createDtoFile.content.includes('createdAt:'), 'Create DTO should not contain readonly fields');
    assert.match(createDtoFile.content, /name: string;/);

    const updateDtoFile = files.find(f => f.path === 'src/users/dto/update-user.dto.ts');
    assert.ok(updateDtoFile);
    assert.match(updateDtoFile.content, /class UpdateUserDto extends PartialType\(CreateUserDto\)/);

    const schemaFile = files.find(f => f.path === 'src/users/dto/user.schema.ts');
    assert.ok(schemaFile);
    assert.match(schemaFile.content, /export const CreateUserSchema/);
    assert.match(schemaFile.content, /export const UpdateUserSchema/);

    const validationPipe = files.find(f => f.path === 'src/common/validation/zod-validation.pipe.ts');
    assert.ok(validationPipe);
    assert.match(validationPipe.content, /class ZodValidationPipe/);
    assert.match(validationPipe.content, /field === 'body' \? issue\.message : `\$\{field\}: \$\{issue\.message\}`/);

    const prismaFilter = files.find(f => f.path === 'src/common/filters/prisma-exception.filter.ts');
    assert.ok(prismaFilter);
    assert.match(prismaFilter.content, /class PrismaExceptionFilter/);
  });

  it('uses the semantic primary field for generated Nest routes and Prisma where clauses', () => {
    const files = generateNest({
      contracts: [
        {
          id: 'Product',
          name: 'Product',
          namespace: '',
          fields: [
            { name: 'sku', type: 'string', optional: false, primary: true },
            { name: 'name', type: 'string', optional: false }
          ],
          invariants: []
        },
        {
          id: 'Invoice',
          name: 'Invoice',
          namespace: '',
          fields: [
            { name: 'number', type: 'int', optional: false, primary: true },
            { name: 'total', type: 'decimal', optional: false }
          ],
          invariants: []
        }
      ]
    });

    const productController = files.find(f => f.path === 'src/products/products.controller.ts');
    assert.ok(productController);
    assert.match(productController.content, /@Get\(':sku'\)/);
    assert.match(productController.content, /@Param\('sku'\) sku: string/);

    const productService = files.find(f => f.path === 'src/products/products.service.ts');
    assert.ok(productService);
    assert.match(productService.content, /findUnique\(\{ where: \{ sku \} \}\)/);

    const createProductDto = files.find(f => f.path === 'src/products/dto/create-product.dto.ts');
    assert.ok(createProductDto);
    assert.match(createProductDto.content, /sku: string;/);

    const productSchema = files.find(f => f.path === 'src/products/dto/product.schema.ts');
    assert.ok(productSchema);
    assert.match(productSchema.content, /sku: z\.string\(\)/);

    const invoiceController = files.find(f => f.path === 'src/invoices/invoices.controller.ts');
    assert.ok(invoiceController);
    assert.match(invoiceController.content, /this\.invoicesService\.findOne\(Number\(number\)\)/);

    const invoiceService = files.find(f => f.path === 'src/invoices/invoices.service.ts');
    assert.ok(invoiceService);
    assert.match(invoiceService.content, /findOne\(number: number\)/);
    assert.match(invoiceService.content, /findUnique\(\{ where: \{ number \} \}\)/);
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
