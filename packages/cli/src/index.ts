#!/usr/bin/env node

import { existsSync, rmSync, statSync, watch } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import fg from 'fast-glob';
import { DatabaseSchemaBuilder } from '@forge/compiler';
import { generateAll, generateClient, generateNest, generateOpenApi, generatePrisma, writeNestProject } from '@forge/generators';
import { DiagnosticsError, parseForgeFilesToSemanticModel, type ForgeDiagnostic, type ForgeSourceFile, type SemanticModel } from '@forge/language';

type Target = 'typescript' | 'zod' | 'json-schema' | 'prisma' | 'openapi' | 'nest' | 'client';

interface ForgeConfig {
  contracts: string;
  output: string;
  targets: Target[];
}

interface PlannedFile {
  path: string;
  content: string;
}

interface DoctorIssue {
  message: string;
}

interface DoctorStats {
  contracts: number;
  enums: number;
  relations: number;
  invariants: number;
  crossFileImports: number;
}

const defaultTargets: Target[] = ['typescript', 'zod', 'json-schema', 'prisma'];

async function main(): Promise<void> {
  const command = process.argv[2];
  const root = process.cwd();

  try {
    if (command === '--help' || command === '-h' || command === undefined) {
      printUsage();
      process.exitCode = command === undefined ? 1 : 0;
      return;
    }
    if (command === '--version' || command === '-v') {
      console.log('1.0.0');
      return;
    }
    if (command === 'init') return await init(root);
    if (command === 'compile') return await compile(root);
    if (command === 'validate') return await validate(root);
    if (command === 'check') return await check(root);
    if (command === 'format') return await format(root);
    if (command === 'doctor') return await doctor(root);
    if (command === 'dev') return await dev(root);
    if (command === 'clean') return await clean(root);
    if (command === 'diff') return await diff(root);
    if (command === 'migrate') return await migrate(root);
    if (command === 'generate' && process.argv[3] === 'openapi') return await generateOpenApiCmd(root);
    if (command === 'generate' && process.argv[3] === 'nest') return await generateNestCmd(root);
    if (command === 'generate' && process.argv[3] === 'client') return await generateClientCmd(root);

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
  await writeIfMissing(path.join(root, 'forge.config.json'), `${JSON.stringify({
    contracts: 'contracts/**/*.forge',
    output: 'generated',
    targets: defaultTargets
  }, null, 2)}\n`);

  await writeIfMissing(path.join(root, 'contracts', 'example.forge'), `namespace example

enum UserStatus {
  active
  suspended
}

contract User {
  id: uuid @primary @default(uuid())
  email: string @unique @index
  name: string
  status: UserStatus @default(active)
  createdAt: datetime @default(now()) @readonly

  invariant email != ""
}
`);

  console.log('✓ Forge project initialized.');
  console.log('  - contracts/ directory created');
  console.log('  - generated/ directory created');
  console.log('  - forge.config.json created');
  console.log('  - example contract created');
}

async function validate(root: string): Promise<void> {
  const files = await readContractFiles(root);
  if (files.length === 0) {
    console.log('No contract files found.');
    return;
  }

  await loadSemanticModel(root);
  for (const file of files) console.log(`✓ ${path.relative(root, file)}`);
  console.log(`✓ All ${files.length} contract file(s) are valid.`);
}

async function check(root: string): Promise<void> {
  const config = await readConfig(root);
  const model = await loadSemanticModel(root);
  validateTargetCompatibility(model, config.targets);
  console.log(`✓ Forge check passed (${model.contracts.length} contract(s), ${model.enums?.length ?? 0} enum(s), ${config.targets.length} target(s)).`);
}

async function format(root: string): Promise<void> {
  const patterns = process.argv.slice(3).filter(arg => !arg.startsWith('-'));
  const files = patterns.length > 0
    ? await readContractFilesFromPatterns(root, patterns)
    : await readContractFiles(root);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    await writeFile(file, formatForgeSource(source), 'utf8');
  }
  console.log(`✓ Formatted ${files.length} Forge file(s).`);
}

async function doctor(root: string): Promise<void> {
  const started = Date.now();
  console.log('Forge Doctor Report');
  console.log('===================\n');

  const configPath = path.join(root, 'forge.config.json');
  if (!existsSync(configPath)) {
    console.log('✗ forge.config.json not found');
    console.log('\nStatus: errors');
    process.exitCode = 1;
    return;
  }
  console.log('✓ Forge configuration');

  const config = await readConfig(root);
  const files = await readContractFiles(root);
  if (files.length === 0) {
    console.log('⚠ No contract files found');
    console.log('\nStatus: warnings');
    return;
  }

  const warnings: DoctorIssue[] = [];
  const errors: DoctorIssue[] = [];
  let model: SemanticModel;
  try {
    model = await loadSemanticModel(root);
    validateTargetCompatibility(model, config.targets);
  } catch (error) {
    handleError(error);
    console.log('\nStatus: errors');
    process.exitCode = 1;
    return;
  }

  const sources = await loadProjectSources(root);
  const stats = collectDoctorStats(model, sources);
  warnings.push(...collectDoctorWarnings(model));
  warnings.push(...await collectDriftWarnings(root, config, model));

  console.log(`✓ Contracts: ${stats.contracts}`);
  console.log(`✓ Enums: ${stats.enums}`);
  console.log(`✓ Relations: ${stats.relations}`);
  console.log(`✓ Invariants: ${stats.invariants}`);
  console.log(`✓ Cross-file imports: ${stats.crossFileImports}`);
  console.log(`✓ Targets: ${config.targets.join(', ')}`);

  printDoctorSection('Warnings', warnings, 'No warnings.');
  printDoctorSection('Errors', errors, 'No errors.');

  const status = errors.length > 0 ? 'errors' : warnings.length > 0 ? 'warnings' : 'healthy';
  console.log(`\nStatus: ${status} (${Date.now() - started}ms)`);
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

async function dev(root: string): Promise<void> {
  const config = await readConfig(root);
  const ignoredSegments = new Set(['.git', 'node_modules', config.output.split(/[\\/]/)[0], 'dist']);
  await runDevCompile(root, 'Initial compile');
  console.log(`Watching ${path.relative(root, root) || '.'} for Forge changes...`);
  console.log('Press Ctrl+C to stop.');

  let timer: NodeJS.Timeout | undefined;
  watch(root, { recursive: true }, (_event, filename) => {
    const changedFile = normalizeWatchFilename(filename);
    if (!isRelevantDevChange(changedFile, ignoredSegments)) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      console.log(`\nChange detected: ${changedFile}`);
      await runDevCompile(root, 'Recompile');
    }, 150);
  });

  await new Promise(() => undefined);
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
    console.log('✓ Cleaned: dist/');
  }
  console.log('✓ Clean complete.');
}

async function migrate(root: string): Promise<void> {
  const started = Date.now();
  const args = process.argv.slice(3);
  if (args.length === 0 || args.includes('--help')) {
    printMigrateUsage();
    process.exitCode = args.length === 0 ? 1 : 0;
    return;
  }

  const config = await readConfig(root);
  const model = await loadSemanticModel(root);
  await writePlannedFiles(root, createGenerationPlan(root, config, model, ['prisma']));
  const schemaPath = path.join(config.output, 'prisma', 'schema.prisma').replace(/\\/g, '/');
  const prismaArgs = buildPrismaMigrateArgs(args, schemaPath);
  console.log(`✓ Prisma schema generated at ${schemaPath}.`);
  console.log(`Running Prisma Migrate: prisma ${prismaArgs.join(' ')}`);

  const result = runPrisma(prismaArgs, root);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }

  console.log(`✓ Migration command completed in ${Date.now() - started}ms.`);
}

async function compile(root: string): Promise<void> {
  const started = Date.now();
  const config = await readConfig(root);
  const files = await readContractFiles(root);
  const model = await loadSemanticModel(root);
  const targets = getRequestedTargets(config);
  validateTargetCompatibility(model, targets);

  const plannedFiles = createGenerationPlan(root, config, model, targets);
  const writtenFiles = await writePlannedFiles(root, plannedFiles);

  console.log(`✓ Compiled ${files.length} Forge file(s), ${model.contracts.length} contract(s), ${model.enums?.length ?? 0} enum(s).`);
  console.log(`✓ Generated ${writtenFiles} file(s) for target(s): ${targets.join(', ')} in ${Date.now() - started}ms.`);
}

async function writePlannedFiles(root: string, plannedFiles: PlannedFile[]): Promise<number> {
  let writtenFiles = 0;
  for (const file of plannedFiles) {
    const target = path.join(root, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
    writtenFiles++;
  }
  return writtenFiles;
}

async function runDevCompile(root: string, label: string): Promise<boolean> {
  try {
    await compile(root);
    console.log(`✓ ${label} succeeded at ${new Date().toLocaleTimeString()}.`);
    return true;
  } catch (error) {
    console.error(`✗ ${label} failed at ${new Date().toLocaleTimeString()}.`);
    handleError(error);
    return false;
  }
}

function isRelevantDevChange(filename: string | undefined, ignoredSegments: Set<string>): boolean {
  if (!filename) return false;
  const segments = filename.split('/');
  if (segments.some(segment => ignoredSegments.has(segment))) return false;
  return filename === 'forge.config.json' || filename.endsWith('.forge');
}

function normalizeWatchFilename(filename: string | Buffer | null): string | undefined {
  if (!filename) return undefined;
  return String(filename).replace(/\\/g, '/');
}

function buildPrismaMigrateArgs(args: string[], schemaPath: string): string[] {
  const command = args[0];
  const rest = args.slice(1);
  if (command === 'diff') {
    const hasTarget = rest.includes('--to-schema-datamodel') || rest.includes('--to-schema-datasource');
    return ['migrate', 'diff', ...(hasTarget ? rest : [...rest, '--to-schema-datamodel', schemaPath])];
  }

  const hasSchema = rest.includes('--schema') || rest.some(arg => arg.startsWith('--schema='));
  return ['migrate', command, ...(hasSchema ? rest : [...rest, '--schema', schemaPath])];
}

function runPrisma(args: string[], root: string): ReturnType<typeof spawnSync> {
  const override = process.env.FORGE_PRISMA_BIN;
  if (override) {
    const prefix = process.env.FORGE_PRISMA_BIN_ARGS ? JSON.parse(process.env.FORGE_PRISMA_BIN_ARGS) as string[] : [];
    return spawnSync(override, [...prefix, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  }

  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx', 'prisma', ...args], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024
    });
  }

  return spawnSync('npx', ['prisma', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

function createGenerationPlan(root: string, config: ForgeConfig, model: SemanticModel, targets: Target[]): PlannedFile[] {
  const files: PlannedFile[] = [];
  const outputRoot = path.relative(root, path.join(root, config.output)).replace(/\\/g, '/') || config.output;

  for (const file of generateAll(model).filter(item => shouldEmitGeneratedFile(item.path, targets))) {
    files.push({ path: joinOutputPath(outputRoot, file.path), content: file.content });
  }

  if (targets.includes('prisma')) {
    const dbSchema = new DatabaseSchemaBuilder().build(model);
    for (const file of generatePrisma(dbSchema)) {
      files.push({ path: joinOutputPath(outputRoot, file.path), content: file.content });
    }
  }

  if (targets.includes('openapi')) {
    files.push({ path: 'dist/openapi.json', content: generateOpenApi(model) });
  }

  if (targets.includes('nest')) {
    for (const file of generateNest(model)) {
      files.push({ path: joinOutputPath('dist/backend', file.path), content: file.content });
    }
  }

  return files;
}

function joinOutputPath(root: string, filePath: string): string {
  return path.posix.join(root.replace(/\\/g, '/'), filePath.replace(/\\/g, '/'));
}

function collectDoctorStats(model: SemanticModel, sources: ForgeSourceFile[]): DoctorStats {
  return {
    contracts: model.contracts.length,
    enums: model.enums?.length ?? 0,
    relations: model.contracts.reduce((count, contract) => count + contract.fields.filter(field => field.typeRef?.kind === 'contract').length, 0),
    invariants: model.contracts.reduce((count, contract) => count + contract.invariants.length, 0),
    crossFileImports: sources.reduce((count, source) => count + findRelativeImports(source.source).length, 0)
  };
}

function collectDoctorWarnings(model: SemanticModel): DoctorIssue[] {
  return [
    ...collectPrimaryWarnings(model),
    ...collectRelationWarnings(model),
    ...collectIndexWarnings(model),
    ...collectOptionalInvariantWarnings(model)
  ].sort((left, right) => left.message.localeCompare(right.message));
}

function collectPrimaryWarnings(model: SemanticModel): DoctorIssue[] {
  return model.contracts
    .filter(contract => !contract.fields.some(field => field.primary))
    .map(contract => ({ message: `Contract '${contract.name}' has no @primary field; generators will fall back to id/first field where needed.` }));
}

function collectRelationWarnings(model: SemanticModel): DoctorIssue[] {
  const warnings: DoctorIssue[] = [];
  for (const contract of model.contracts) {
    for (const field of contract.fields.filter(item => item.typeRef?.kind === 'contract')) {
      const target = model.contracts.find(item => item.name === field.type);
      const hasInverse = target?.fields.some(targetField => targetField.typeRef?.kind === 'contract' && targetField.type === contract.name);
      if (!hasInverse) {
        warnings.push({ message: `Relation '${contract.name}.${field.name}' points to '${field.type}' without an inverse field declared.` });
      }
    }
  }
  return warnings;
}

function collectIndexWarnings(model: SemanticModel): DoctorIssue[] {
  const warnings: DoctorIssue[] = [];
  for (const contract of model.contracts) {
    for (const field of contract.fields) {
      const explicitUnique = field.modifiers?.unique !== undefined;
      const explicitIndex = field.modifiers?.index !== undefined;
      if (field.primary && (explicitUnique || explicitIndex)) {
        warnings.push({ message: `Field '${contract.name}.${field.name}' is @primary; @unique/@index is redundant.` });
      } else if (explicitUnique && explicitIndex) {
        warnings.push({ message: `Field '${contract.name}.${field.name}' is both @unique and @index; the explicit index may be redundant.` });
      }
    }
  }
  return warnings;
}

function collectOptionalInvariantWarnings(model: SemanticModel): DoctorIssue[] {
  const warnings: DoctorIssue[] = [];
  for (const contract of model.contracts) {
    const optionalFields = new Set(contract.fields.filter(field => field.optional).map(field => field.name));
    for (const invariant of contract.invariants) {
      const fields = collectInvariantFieldNames(invariant);
      const optionalReferences = fields.filter(field => optionalFields.has(field));
      if (optionalReferences.length > 0) {
        warnings.push({
          message: `Invariant '${invariant.expression}' in '${contract.name}' references optional field(s): ${optionalReferences.join(', ')}.`
        });
      }
    }
  }
  return warnings;
}

function collectInvariantFieldNames(invariant: { comparisons?: Array<{ left: any; right: any }> }): string[] {
  const fields = new Set<string>();
  for (const comparison of invariant.comparisons ?? []) {
    collectInvariantOperandFieldNames(comparison.left, fields);
    collectInvariantOperandFieldNames(comparison.right, fields);
  }
  return Array.from(fields).sort((left, right) => left.localeCompare(right));
}

function collectInvariantOperandFieldNames(operand: any, fields: Set<string>): void {
  if (operand?.kind === 'field' && operand.field) {
    fields.add(operand.field);
  }
  for (const term of operand?.terms ?? []) {
    collectInvariantOperandFieldNames(term.operand, fields);
  }
}

async function collectDriftWarnings(root: string, config: ForgeConfig, model: SemanticModel): Promise<DoctorIssue[]> {
  const warnings: DoctorIssue[] = [];
  const expectedFiles = createGenerationPlan(root, config, model, config.targets);
  for (const file of expectedFiles) {
    const absolute = path.join(root, file.path);
    if (!existsSync(absolute)) {
      warnings.push({ message: `Generated artifact '${file.path}' is missing; run forge compile.` });
      continue;
    }
    const current = await readFile(absolute, 'utf8');
    if (normalizeNewlines(current) !== normalizeNewlines(file.content)) {
      warnings.push({ message: `Generated artifact '${file.path}' is out of date; run forge compile.` });
    }
  }
  return warnings;
}

function printDoctorSection(title: string, issues: DoctorIssue[], emptyMessage: string): void {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  if (issues.length === 0) {
    console.log(`✓ ${emptyMessage}`);
    return;
  }

  for (const issue of issues) {
    console.log(`⚠ ${issue.message}`);
  }
}

async function generateOpenApiCmd(root: string): Promise<void> {
  const model = await loadSemanticModel(root);
  await writeDistFile(root, 'openapi.json', generateOpenApi(model));
  console.log('✓ Generated OpenAPI spec at dist/openapi.json.');
}

async function generateNestCmd(root: string): Promise<void> {
  const model = await loadSemanticModel(root);
  await writeNestProject(path.join(root, 'dist', 'backend'), generateNest(model));
  console.log('✓ Generated NestJS project at dist/backend.');
}

async function generateClientCmd(root: string): Promise<void> {
  const config = await readConfig(root);
  const model = await loadSemanticModel(root);
  const files = generateClient(model);
  for (const file of files) {
    const target = path.join(root, config.output, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }
  console.log(`✓ Generated TypeScript client at ${config.output}/client.`);
}

async function diff(root: string): Promise<void> {
  const config = await readConfig(root);
  const model = await loadSemanticModel(root);
  const nextSchema = generatePrisma(new DatabaseSchemaBuilder().build(model))[0].content;
  const currentPath = path.join(root, config.output, 'prisma', 'schema.prisma');

  if (!existsSync(currentPath)) {
    console.log('No existing Prisma schema found.');
    console.log('Run forge compile to create the baseline.');
    console.log('\nGenerated Prisma schema preview');
    console.log('===============================');
    console.log(nextSchema.trimEnd());
    return;
  }

  const currentSchema = await readFile(currentPath, 'utf8');
  if (normalizeNewlines(currentSchema) === normalizeNewlines(nextSchema)) {
    console.log('✓ No Prisma schema changes.');
    return;
  }

  const diff = diffPrismaSchemas(normalizeNewlines(currentSchema), normalizeNewlines(nextSchema));
  console.log('Database changes');
  console.log('================');
  for (const change of diff.changes) {
    console.log(change);
  }

  if (diff.breaking.length > 0) {
    console.log('\nBreaking changes');
    console.log('================');
    for (const change of diff.breaking) {
      console.log(`⚠ ${change}`);
    }
  }
}

async function readConfig(root: string): Promise<ForgeConfig> {
  const configPath = path.join(root, 'forge.config.json');
  if (!existsSync(configPath)) {
    return { contracts: 'contracts/**/*.forge', output: 'generated', targets: defaultTargets };
  }

  const raw = JSON.parse(await readFile(configPath, 'utf8')) as Partial<ForgeConfig>;
  return {
    contracts: raw.contracts ?? 'contracts/**/*.forge',
    output: raw.output ?? 'generated',
    targets: normalizeTargets(raw.targets ?? defaultTargets)
  };
}

async function readContractFiles(root: string): Promise<string[]> {
  const config = await readConfig(root);
  return fg(toContractGlob(root, config.contracts), { cwd: root, absolute: true, onlyFiles: true });
}

async function readContractFilesFromPatterns(root: string, patterns: string[]): Promise<string[]> {
  const globs = patterns.map(pattern => toContractGlob(root, pattern));
  return fg(globs, { cwd: root, absolute: true, onlyFiles: true });
}

async function loadSemanticModel(root: string): Promise<SemanticModel> {
  const sources = await loadProjectSources(root);
  return parseForgeFilesToSemanticModel(sources);
}

async function loadProjectSources(root: string): Promise<ForgeSourceFile[]> {
  const files = await readContractFiles(root);
  const visited = new Set<string>();
  const sources: ForgeSourceFile[] = [];

  for (const file of files) {
    await loadSourceWithImports(root, path.resolve(file), visited, sources);
  }

  return sources;
}

async function loadSourceWithImports(
  root: string,
  file: string,
  visited: Set<string>,
  sources: ForgeSourceFile[]
): Promise<void> {
  const resolvedFile = path.resolve(file);
  if (visited.has(resolvedFile)) return;
  visited.add(resolvedFile);

  if (!existsSync(resolvedFile)) {
    throw importDiagnostic(root, resolvedFile, `Import not found: ${path.relative(root, resolvedFile)}`);
  }

  const source = await readFile(resolvedFile, 'utf8');
  sources.push({ source, uri: pathToFileUri(resolvedFile) });

  for (const importPath of findRelativeImports(source)) {
    const importedFile = path.resolve(path.dirname(resolvedFile), importPath);
    if (isOutsideRoot(root, importedFile)) {
      throw importDiagnostic(root, resolvedFile, `Import escapes project root: ${importPath}`, source, importPath);
    }
    if (!existsSync(importedFile)) {
      throw importDiagnostic(root, resolvedFile, `Import not found: ${importPath}`, source, importPath);
    }
    await loadSourceWithImports(root, importedFile, visited, sources);
  }
}

function findRelativeImports(source: string): string[] {
  const imports: string[] = [];
  const importRegex = /^\s*import\s+[\w\s,]+\s+from\s+"([^"]+)"/gm;
  for (const match of source.matchAll(importRegex)) {
    imports.push(match[1]);
  }
  return imports;
}

function importDiagnostic(
  root: string,
  file: string,
  message: string,
  source?: string,
  importPath?: string
): DiagnosticsError {
  const location = source && importPath ? findImportLocation(source, importPath) : undefined;
  const diagnostic: ForgeDiagnostic = {
    code: 'FORGE_IMPORT_001',
    severity: 'error',
    message,
    file: path.relative(root, file).replace(/\\/g, '/'),
    line: location?.line,
    column: location?.column,
    sourceLine: location?.sourceLine,
    underline: location?.underline,
    hint: 'Check that the import path exists and stays inside the project root.'
  };
  return new DiagnosticsError([diagnostic]);
}

function findImportLocation(source: string, importPath: string): { line: number; column: number; sourceLine: string; underline: string } | undefined {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index++) {
    const column = lines[index].indexOf(importPath);
    if (column >= 0) {
      return {
        line: index + 1,
        column: column + 1,
        sourceLine: lines[index],
        underline: `${' '.repeat(column)}${'^'.repeat(importPath.length)}`
      };
    }
  }
  return undefined;
}

function isOutsideRoot(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative.startsWith('..') || path.isAbsolute(relative);
}

function getRequestedTargets(config: ForgeConfig): Target[] {
  const targetIndex = process.argv.indexOf('--target');
  if (targetIndex >= 0 && process.argv[targetIndex + 1]) {
    return parseTargets(process.argv[targetIndex + 1]);
  }

  const emitIndex = process.argv.indexOf('--emit');
  if (emitIndex >= 0 && process.argv[emitIndex + 1]) {
    return Array.from(new Set([...config.targets, ...parseTargets(process.argv[emitIndex + 1])]));
  }

  return config.targets;
}

function parseTargets(raw: string): Target[] {
  return normalizeTargets(raw.split(',').map(item => item.trim()).filter(Boolean));
}

function normalizeTargets(targets: string[]): Target[] {
  const valid = new Set<Target>(['typescript', 'zod', 'json-schema', 'prisma', 'openapi', 'nest', 'client']);
  return targets.map(target => {
    if (!valid.has(target as Target)) {
      throw new Error(`Unknown target '${target}'. Valid targets: ${Array.from(valid).join(', ')}`);
    }
    return target as Target;
  });
}

function toContractGlob(root: string, configuredPath: string): string {
  if (configuredPath.includes('*')) return configuredPath;
  const absolute = path.isAbsolute(configuredPath) ? configuredPath : path.join(root, configuredPath);
  if (existsSync(absolute)) {
    if (statSync(absolute).isFile()) {
      return configuredPath;
    }
    return path.join(configuredPath, '**/*.forge').replace(/\\/g, '/');
  }
  return configuredPath;
}

function shouldEmitGeneratedFile(filePath: string, targets: Target[]): boolean {
  return targets.some(target => filePath.startsWith(`${target}/`));
}

function validateTargetCompatibility(model: SemanticModel, targets: Target[]): void {
  void model;
  void targets;
}

function formatForgeSource(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n').map(line => line.trim());
  let indent = 0;
  const rendered: string[] = [];

  for (const line of lines) {
    if (line.length === 0) {
      if (rendered.at(-1) !== '') rendered.push('');
      continue;
    }
    if (line === '}') indent = Math.max(0, indent - 1);
    rendered.push(`${'  '.repeat(indent)}${line}`);
    if (line.endsWith('{')) indent++;
  }

  return `${rendered.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

interface PrismaSchemaSummary {
  models: Map<string, Map<string, string>>;
}

interface PrismaSchemaDiff {
  changes: string[];
  breaking: string[];
}

function diffPrismaSchemas(before: string, after: string): PrismaSchemaDiff {
  const previous = parsePrismaSchema(before);
  const next = parsePrismaSchema(after);
  const changes: string[] = [];
  const breaking: string[] = [];
  const modelNames = Array.from(new Set([...previous.models.keys(), ...next.models.keys()])).sort();

  for (const modelName of modelNames) {
    const previousModel = previous.models.get(modelName);
    const nextModel = next.models.get(modelName);

    if (!previousModel && nextModel) {
      changes.push(`+ model ${modelName}`);
      for (const [fieldName, signature] of sortedEntries(nextModel)) {
        changes.push(`+ ${modelName}.${fieldName} ${signature}`);
      }
      continue;
    }

    if (previousModel && !nextModel) {
      changes.push(`- model ${modelName}`);
      breaking.push(`Model '${modelName}' will be removed.`);
      continue;
    }

    if (!previousModel || !nextModel) continue;

    const fieldNames = Array.from(new Set([...previousModel.keys(), ...nextModel.keys()])).sort();
    for (const fieldName of fieldNames) {
      const oldSignature = previousModel.get(fieldName);
      const newSignature = nextModel.get(fieldName);

      if (!oldSignature && newSignature) {
        changes.push(`+ ${modelName}.${fieldName} ${newSignature}`);
        if (isRequiredPrismaField(newSignature)) {
          breaking.push(`Field '${modelName}.${fieldName}' is a new required database field.`);
        }
      } else if (oldSignature && !newSignature) {
        changes.push(`- ${modelName}.${fieldName} ${oldSignature}`);
        breaking.push(`Field '${modelName}.${fieldName}' will be removed.`);
      } else if (oldSignature && newSignature && oldSignature !== newSignature) {
        changes.push(`~ ${modelName}.${fieldName} ${oldSignature} -> ${newSignature}`);
        if (isBreakingFieldChange(oldSignature, newSignature)) {
          breaking.push(`Field '${modelName}.${fieldName}' changes from '${oldSignature}' to '${newSignature}'.`);
        }
      }
    }
  }

  return { changes: changes.length > 0 ? changes : ['~ Schema changed.'], breaking };
}

function parsePrismaSchema(schema: string): PrismaSchemaSummary {
  const models = new Map<string, Map<string, string>>();
  const modelRegex = /model\s+(\w+)\s+\{([\s\S]*?)\}/g;

  for (const match of schema.matchAll(modelRegex)) {
    const modelName = match[1];
    const fields = new Map<string, string>();
    const body = match[2].split('\n');

    for (const rawLine of body) {
      const line = rawLine.trim();
      if (!line || line.startsWith('@@')) continue;
      const [fieldName, ...signatureParts] = line.split(/\s+/);
      if (!fieldName || signatureParts.length === 0) continue;
      fields.set(fieldName, signatureParts.join(' '));
    }

    models.set(modelName, fields);
  }

  return { models };
}

function sortedEntries<T>(map: Map<string, T>): Array<[string, T]> {
  return Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function isRequiredPrismaField(signature: string): boolean {
  const type = signature.split(/\s+/)[0] ?? '';
  return !type.endsWith('?') && !type.endsWith('[]') && !signature.includes('@default(');
}

function isBreakingFieldChange(before: string, after: string): boolean {
  const beforeType = before.split(/\s+/)[0] ?? '';
  const afterType = after.split(/\s+/)[0] ?? '';
  if (beforeType !== afterType) return true;
  return beforeType.endsWith('?') && !afterType.endsWith('?');
}

async function writeDistFile(root: string, name: string, content: string): Promise<void> {
  const target = path.join(root, 'dist', name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
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
  check             Validate contracts, config and target compatibility
  format            Format contract files
  doctor            Diagnose project health
  dev               Watch and rebuild on changes
  clean             Remove generated artifacts
  diff              Print the current schema shape
  migrate           Run Prisma Migrate using the generated Prisma schema
  generate openapi  Generate OpenAPI specification
  generate nest     Generate NestJS backend project
  generate client   Generate TypeScript client SDK

Options:
  --target <target> Generate target(s): typescript,zod,json-schema,prisma,openapi,nest,client
  --emit <target>   Backwards-compatible alias for adding openapi or nest
  --help            Show this help message
  --version         Show version

Examples:
  forge init
  forge compile
  forge compile --target typescript,zod,prisma
  forge compile --emit nest
  forge check
  forge migrate dev --name init
  forge migrate deploy
  forge generate client
  forge dev
`);
}

function printMigrateUsage(): void {
  console.log(`Forge Migrate

Usage:
  forge migrate dev --name <name>
  forge migrate deploy
  forge migrate status
  forge migrate diff --from-empty --script

Forge first generates ${'`'}generated/prisma/schema.prisma${'`'} from the current semantic model, then delegates to Prisma Migrate.

Examples:
  forge migrate dev --name init
  forge migrate deploy
  forge migrate diff --from-empty --script
`);
}

function handleError(error: unknown): void {
  if (error instanceof DiagnosticsError) {
    for (const d of error.diagnostics) {
      const location = `${d.file ?? 'unknown'}:${d.line ?? ''}:${d.column ?? ''}`;
      const severity = d.severity === 'error' ? '✗' : '⚠';
      console.error(`${severity} ${location}`);
      console.error(`  [${d.code}] ${d.message}`);
      if (d.sourceLine) {
        console.error(`  ${d.line} │ ${d.sourceLine}`);
        if (d.underline) console.error(`    │ ${d.underline}`);
      }
      if (d.hint) console.error(`  Hint: ${d.hint}\n`);
    }
  } else {
    console.error('✗ Error:', error instanceof Error ? error.message : error);
  }
}

main();
