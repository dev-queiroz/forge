#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import fg from 'fast-glob';
import { generateAll, generateOpenApi } from '@forge/generators';
import { parseForgeToSemanticModel, DiagnosticsError, type SemanticModel } from '@forge/language';

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === 'init') {
    await init(process.cwd());
    return;
  }

  if (command === 'compile') {
    await compile(process.cwd());
    return;
  }

  if (command === 'generate' && process.argv[3] === 'openapi') {
    await generateOpenApiCmd(process.cwd());
    return;
  }

  printUsage();
  process.exitCode = 1;
}

async function init(root: string): Promise<void> {
  await ensureDirectory(path.join(root, 'contracts'));
  await ensureDirectory(path.join(root, 'generated'));
  await writeIfMissing(
    path.join(root, 'forge.config.json'),
    `${JSON.stringify({ contracts: 'contracts/**/*.forge', output: 'generated' }, null, 2)}\n`
  );
  console.log('Forge project initialized.');
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

  const hasEmitOpenApi = process.argv.includes('--emit') && process.argv.includes('openapi');
  if (hasEmitOpenApi) {
    const openapiContent = generateOpenApi(model);
    const target = path.join(root, 'dist', 'openapi.json');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, openapiContent, 'utf8');
    console.log(`Compiled ${files.length} Forge file(s), generated ${generatedFiles.length} file(s) and OpenAPI spec at dist/openapi.json.`);
  } else {
    console.log(`Compiled ${files.length} Forge file(s), generated ${generatedFiles.length} file(s).`);
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
  console.log(`Generated OpenAPI spec at dist/openapi.json.`);
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
    await writeFile(file, content, 'utf8');
  }
}

function pathToFileUri(filePath: string): string {
  return `file:///${filePath.replace(/\\/g, '/')}`;
}

function printUsage(): void {
  console.log('Usage: forge <init|compile|generate openapi> [--emit openapi]');
}

main().catch(error => {
  if (error instanceof DiagnosticsError) {
    for (const d of error.diagnostics) {
      console.error(`${d.file ?? ""}:${d.line ?? ""}:${d.column ?? ""}\n`);
      console.error(d.message + '\n');
      if (d.hint) {
        console.error(`Hint:\n${d.hint}\n`);
      }
    }
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
