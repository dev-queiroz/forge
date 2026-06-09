#!/usr/bin/env node

import { existsSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import fg from 'fast-glob';
import { generateAll, generateOpenApi, generateNest, writeNestProject, generatePrisma } from '@forge/generators';
import { parseForgeToSemanticModel, DiagnosticsError, type SemanticModel } from '@forge/language';
import { DatabaseSchemaBuilder } from '@forge/compiler';

async function main(): Promise<void> {
  const command = process.argv[2];
  const root = process.cwd();

  try {
    if (command === 'init') {
      await init(root);
      return;
    }

    if (command === 'compile') {
      await compile(root);
      return;
    }

    if (command === 'validate') {
      await validate(root);
      return;
    }

    if (command === 'format') {
      await format(root);
      return;
    }

    if (command === 'doctor') {
      await doctor(root);
      return;
    }

    if (command === 'dev') {
      await dev(root);
      return;
    }

    if (command === 'clean') {
      await clean(root);
      return;
    }

    if (command === 'generate' && process.argv[3] === 'openapi') {
      await generateOpenApiCmd(root);
      return;
    }

    if (command === 'generate' && process.argv[3] === 'nest') {
      await generateNestCmd(root);
      return;
    }

    printUsage();
    process.exitCode = 1;
  } catch (error) {
    handleError(error);
    process.exitCode = 1;
  }
}

async function init(root: string): Promise<void> {
  await ensureDirectory(path.join(root, 'contracts'));
  await ensureDirectory(path.join(root, 'generated'));
  await writeIfMissing(
    path.join(root, 'forge.config.json'),
    `${JSON.stringify({ contracts: 'contracts/**/*.forge', output: 'generated' }, null, 2)}\n`
  );

  // Create an example contract
  await writeIfMissing(
    path.join(root, 'contracts', 'example.forge'),
    `namespace example

/// A user account
contract User {
  /// Unique identifier
  id: uuid @primary

  /// Email address
  email: string @unique @index

  /// User's name
  name: string

  /// Account created timestamp
  createdAt: datetime @default(now()) @readonly

  invariant email != ""
}
`
  );

  console.log('✓ Forge project initialized.');
  console.log('  - contracts/ directory created');
  console.log('  - generated/ directory created');
  console.log('  - forge.config.json created');
  console.log('  - example contract created');
}

async function validate(root: string): Promise<void> {
  const config = await readConfig(root);
  const files = await fg(config.contracts, { cwd: root, absolute: true, onlyFiles: true });

  if (files.length === 0) {
    console.log('No contract files found.');
    return;
  }

  let hasErrors = false;
  for (const file of files) {
    try {
      const source = await readFile(file, 'utf8');
      await parseForgeToSemanticModel(source, { uri: pathToFileUri(file) });
      console.log(`✓ ${path.relative(root, file)}`);
    } catch (error) {
      hasErrors = true;
      throw error;
    }
  }

  if (!hasErrors) {
    console.log(`✓ All ${files.length} contract file(s) are valid.`);
  }
}

async function format(root: string): Promise<void> {
  console.log('✓ Format support coming in v1.1');
  // Placeholder for format command
}

async function doctor(root: string): Promise<void> {
  console.log('Forge Doctor Report');
  console.log('===================\n');

  // Check for forge.config.json
  const configPath = path.join(root, 'forge.config.json');
  if (existsSync(configPath)) {
    console.log('✓ forge.config.json found');
  } else {
    console.log('✗ forge.config.json not found');
    return;
  }

  // Check for contracts directory
  const config = await readConfig(root);
  const contractsDir = path.dirname(config.contracts.split('**')[0]);
  if (existsSync(path.join(root, contractsDir))) {
    console.log(`✓ Contracts directory exists: ${contractsDir}`);
  } else {
    console.log(`✗ Contracts directory not found: ${contractsDir}`);
    return;
  }

  // Check for contract files
  const files = await fg(config.contracts, { cwd: root, absolute: true, onlyFiles: true });
  if (files.length > 0) {
    console.log(`✓ Found ${files.length} contract file(s)`);
  } else {
    console.log('⚠ No contract files found');
    return;
  }

  // Validate contracts
  let validCount = 0;
  let errorCount = 0;
  for (const file of files) {
    try {
      const source = await readFile(file, 'utf8');
      await parseForgeToSemanticModel(source, { uri: pathToFileUri(file) });
      validCount++;
    } catch {
      errorCount++;
    }
  }

  console.log(`✓ ${validCount} valid contract file(s)`);
  if (errorCount > 0) {
    console.log(`✗ ${errorCount} contract file(s) with errors`);
  }

  // Check for output directory
  const outputPath = path.join(root, config.output);
  if (existsSync(outputPath)) {
    console.log(`✓ Generated artifacts found: ${config.output}`);
  } else {
    console.log(`⚠ No generated artifacts found (run 'forge compile' to generate)`);
  }
}

async function dev(root: string): Promise<void> {
  console.log('Watch mode is not yet implemented.');
  console.log('For now, run: forge compile && forge compile (repeat)');
  // TODO: Implement watch mode with chokidar
}

async function clean(root: string): Promise<void> {
  const config = await readConfig(root);
  const outputPath = path.join(root, config.output);
  const distPath = path.join(root, 'dist');

  if (existsSync(outputPath)) {
    rmSync(outputPath, { recursive: true, force: true });
    console.log(`✓ Cleaned: ${config.output}/`);
  }

  if (existsSync(distPath)) {
    rmSync(distPath, { recursive: true, force: true });
    console.log(`✓ Cleaned: dist/`);
  }

  console.log('✓ Clean complete.');
}

async function compile(root: string): Promise<void> {
  const config = await readConfig(root);
  const files = await fg(config.contracts, { cwd: root, absolute: true, onlyFiles: true });
  const models: SemanticModel[] = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    models.push(await parseForgeToSemanticModel(source, { uri: pathToFileUri(file) }));
  }

  const model: SemanticModel = {
    contracts: models.flatMap(item => item.contracts)
  };

  const outputRoot = path.join(root, config.output);
  const generatedFiles = generateAll(model);
  for (const file of generatedFiles) {
    const target = path.join(outputRoot, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }

  // Generate Prisma schema from DatabaseSchema IR
  const dbSchemaBuilder = new DatabaseSchemaBuilder();
  const dbSchema = dbSchemaBuilder.build(model);
  const prismaFiles = generatePrisma(dbSchema);
  for (const file of prismaFiles) {
    const target = path.join(outputRoot, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }

  const hasEmitOpenApi = process.argv.includes('--emit') && process.argv.includes('openapi');
  const hasEmitNest = process.argv.includes('--emit') && process.argv.includes('nest');

  if (hasEmitOpenApi) {
    const openapiContent = generateOpenApi(model);
    const target = path.join(root, 'dist', 'openapi.json');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, openapiContent, 'utf8');
    console.log(`✓ Compiled ${files.length} Forge file(s), generated ${generatedFiles.length} file(s), Prisma schema, and OpenAPI spec at dist/openapi.json.`);
  } else if (hasEmitNest) {
    const nestFiles = generateNest(model);
    await writeNestProject(path.join(root, 'dist', 'backend'), nestFiles);
    console.log(`✓ Compiled ${files.length} Forge file(s), generated ${generatedFiles.length} file(s), Prisma schema, and NestJS project at dist/backend.`);
  } else {
    console.log(`✓ Compiled ${files.length} Forge file(s), generated ${generatedFiles.length} file(s) and Prisma schema.`);
  }
}

async function generateOpenApiCmd(root: string): Promise<void> {
  const config = await readConfig(root);
  const files = await fg(config.contracts, { cwd: root, absolute: true, onlyFiles: true });
  const models: SemanticModel[] = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    models.push(await parseForgeToSemanticModel(source, { uri: pathToFileUri(file) }));
  }

  const model: SemanticModel = {
    contracts: models.flatMap(item => item.contracts)
  };

  const openapiContent = generateOpenApi(model);
  const target = path.join(root, 'dist', 'openapi.json');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, openapiContent, 'utf8');
  console.log(`✓ Generated OpenAPI spec at dist/openapi.json.`);
}

async function generateNestCmd(root: string): Promise<void> {
  const config = await readConfig(root);
  const files = await fg(config.contracts, { cwd: root, absolute: true, onlyFiles: true });
  const models: SemanticModel[] = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    models.push(await parseForgeToSemanticModel(source, { uri: pathToFileUri(file) }));
  }

  const model: SemanticModel = {
    contracts: models.flatMap(item => item.contracts)
  };

  const nestFiles = generateNest(model);
  await writeNestProject(path.join(root, 'dist', 'backend'), nestFiles);
  console.log(`✓ Generated NestJS project at dist/backend.`);
}

async function readConfig(root: string): Promise<{ contracts: string; output: string }> {
  const configPath = path.join(root, 'forge.config.json');
  if (!existsSync(configPath)) {
    return { contracts: 'contracts/**/*.forge', output: 'generated' };
  }

  const raw = JSON.parse(await readFile(configPath, 'utf8')) as Partial<{ contracts: string; output: string }>;
  return {
    contracts: raw.contracts ?? 'contracts/**/*.forge',
    output: raw.output ?? 'generated'
  };
}

async function ensureDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
}

async function writeIfMissing(file: string, content: string): Promise<void> {
  if (!existsSync(file)) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, 'utf8');
  }
}

function pathToFileUri(filePath: string): string {
  return `file:///${filePath.replace(/\\/g, '/')}`;
}

function printUsage(): void {
  console.log(`Forge CLI v1.0

Usage: forge <command> [options]

Commands:
  init              Initialize a new Forge project
  compile           Compile contracts and generate artifacts
  validate          Validate contracts without generating code
  format            Format contract files
  doctor            Diagnose project health
  dev               Watch and rebuild on changes
  clean             Remove generated artifacts
  generate openapi  Generate OpenAPI specification
  generate nest     Generate NestJS backend project

Options:
  --emit <target>   Emit specific target (openapi, nest)
  --help            Show this help message
  --version         Show version

Examples:
  forge init
  forge compile
  forge compile --emit nest
  forge validate
  forge doctor
  forge clean
`);
}

function handleError(error: unknown): void {
  if (error instanceof DiagnosticsError) {
    for (const d of error.diagnostics) {
      const location = `${d.file ?? 'unknown'}:${d.line ?? ''}:${d.column ?? ''}`;
      const severity = d.severity === 'error' ? '✗' : '⚠';
      console.error(`${severity} ${location}`);
      console.error(`  [${d.code}] ${d.message}`);
      if (d.hint) {
        console.error(`  Hint: ${d.hint}\n`);
      }
    }
  } else {
    console.error('✗ Error:', error instanceof Error ? error.message : error);
  }
}

main();
