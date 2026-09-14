import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createForgeServices } from './forge-module.js';
import type { Contract, Field, Invariant, Model, Enum, Command, Event, ImportDeclaration } from './generated/ast.js';
import { type ForgeDiagnostic, normalizeLangiumError, formatUriToPath, type ErrorKind } from './diagnostics/normalize.js';
import { stabilizeDiagnostics, filterDiagnostics, MAX_ERRORS_PER_FILE, type StabilizedDiagnostic } from './diagnostics/stabilizer.js';

export { type ForgeDiagnostic, normalizeLangiumError, formatUriToPath, type ErrorKind };
export { stabilizeDiagnostics, filterDiagnostics, MAX_ERRORS_PER_FILE, type StabilizedDiagnostic };

export const primitiveTypes = [
  'string',
  'int',
  'float',
  'decimal',
  'boolean',
  'uuid',
  'datetime',
  'date',
  'bytes',
  'json'
] as const;

export type PrimitiveTypeName = typeof primitiveTypes[number];
export type TypeKind = 'primitive' | 'contract' | 'enum' | 'unresolved';

export interface SemanticModel {
  contracts: ContractModel[];
  enums?: EnumModel[];
  commands?: CommandModel[];
  events?: EventModel[];
  symbols?: SymbolTable;
}

export interface SymbolTable {
  contracts: Record<string, SymbolModel>;
  enums: Record<string, SymbolModel>;
}

export interface SymbolModel {
  name: string;
  namespace: string;
  qualifiedName: string;
  kind: 'contract' | 'enum';
  values?: string[];
  fileUri?: string;
}

export interface ContractModel {
  id: string;
  name: string;
  namespace: string;
  fields: FieldModel[];
  invariants: InvariantModel[];
  modifiers?: Record<string, string[]>;
}

export interface FieldModel {
  name: string;
  type: string;
  optional: boolean;
  location?: SourceLocation;
  modifiers?: Record<string, string>;
  isArray?: boolean;
  typeRef?: TypeModel;
  primary?: boolean;
  unique?: boolean;
  indexed?: boolean;
  readonly?: boolean;
  default?: LiteralValueModel;
  foreign?: ForeignKeyModel;
}

export interface SourceLocation {
  file?: string;
  line: number;
  column: number;
}

export interface TypeModel {
  name: string;
  kind: TypeKind;
  isArray: boolean;
  optional: boolean;
  namespace?: string;
  qualifiedName?: string;
  values?: string[];
}

export interface LiteralValueModel {
  raw: string;
  kind: 'string' | 'number' | 'boolean' | 'function' | 'identifier';
  value: string | number | boolean;
}

export interface ForeignKeyModel {
  raw: string;
  field?: string;
  targetContract?: string;
  targetField?: string;
}

export interface InvariantModel {
  expression: string;
  name?: string;
  comparisons?: InvariantComparisonModel[];
}

export interface InvariantComparisonModel {
  left: InvariantOperandModel;
  operator: string;
  right: InvariantOperandModel;
  logicalOperator?: '&&' | '||';
}

export interface InvariantOperandModel {
  raw: string;
  kind: 'field' | 'literal' | 'expression';
  field?: string;
  fieldType?: string;
  fieldTypeKind?: TypeKind;
  literal?: LiteralValueModel;
  terms?: InvariantTermPartModel[];
}

export interface InvariantTermPartModel {
  operator?: string;
  operand: InvariantOperandModel;
}

export interface EnumModel {
  name: string;
  namespace: string;
  values: EnumValueModel[];
}

export interface EnumValueModel {
  name: string;
  value?: string;
}

export interface CommandModel {
  name: string;
  namespace: string;
  inputs: CommandInputModel[];
  outputType: string;
  outputTypeRef?: TypeModel;
}

export interface CommandInputModel {
  name: string;
  type: string;
  typeRef?: TypeModel;
}

export interface EventModel {
  name: string;
  namespace: string;
  fields: EventFieldModel[];
}

export interface EventFieldModel {
  name: string;
  type: string;
  typeRef?: TypeModel;
}

export interface ParseForgeOptions {
  uri?: string;
}

export interface ForgeSourceFile {
  source: string;
  uri?: string;
}

interface DocumentContext {
  model: Model;
  uri?: string;
  source?: string;
  namespace: string;
  localSymbols: SymbolTable;
  scope: SymbolTable;
}

const allowedFieldModifiers = new Set(['primary', 'unique', 'default', 'foreign', 'index', 'readonly', 'optional']);
const modifiersRequiringValue = new Set(['default', 'foreign']);
const modifiersWithoutValue = new Set(['primary', 'unique', 'index', 'readonly', 'optional']);

export class DiagnosticsError extends Error {
  diagnostics: ForgeDiagnostic[];

  constructor(diagnostics: ForgeDiagnostic[]) {
    const message = diagnostics
      .map(d => `${d.file || 'unknown'}:${d.line || ''}:${d.column || ''} - [${d.code}] ${d.message}`)
      .join('\n');
    super(message);
    this.name = 'DiagnosticsError';
    this.diagnostics = diagnostics;
  }
}

export function createContractId(namespace: string, name: string): string {
  return namespace ? `${namespace}.${name}` : name;
}

export async function parseForge(source: string, options: ParseForgeOptions = {}): Promise<Model> {
  const services = createForgeServices(EmptyFileSystem);
  const parse = parseHelper<Model>(services.Forge);
  const document = await parse(source, { documentUri: options.uri ?? 'memory:///model.forge' });
  const lexerErrors = document.parseResult.lexerErrors;
  const parserErrors = document.parseResult.parserErrors;

  if (lexerErrors.length > 0 || parserErrors.length > 0) {
    const fileUri = options.uri ?? document.uri?.toString();
    const raw = [
      ...lexerErrors.map(error => normalizeLangiumError(error, fileUri)),
      ...parserErrors.map(error => normalizeLangiumError(error, fileUri))
    ];
    throw new DiagnosticsError(stabilizeDiagnostics(enrichDiagnostics(raw, source)));
  }

  return document.parseResult.value;
}

export async function parseForgeToSemanticModel(source: string, options: ParseForgeOptions = {}): Promise<SemanticModel> {
  const model = await parseForge(source, options);
  return toSemanticModelFromDocuments([{ model, uri: options.uri ?? model.$document?.uri?.toString(), source }]);
}

export async function parseForgeFilesToSemanticModel(files: ForgeSourceFile[]): Promise<SemanticModel> {
  const parsed: Array<{ model: Model; uri?: string; source?: string }> = [];
  const diagnostics: ForgeDiagnostic[] = [];

  for (const file of files) {
    try {
      parsed.push({ model: await parseForge(file.source, { uri: file.uri }), uri: file.uri, source: file.source });
    } catch (error) {
      if (error instanceof DiagnosticsError) {
        diagnostics.push(...enrichDiagnostics(error.diagnostics, file.source));
      } else {
        throw error;
      }
    }
  }

  if (diagnostics.length > 0) {
    throw new DiagnosticsError(stabilizeDiagnostics(diagnostics));
  }

  return toSemanticModelFromDocuments(parsed);
}

export function toSemanticModel(model: Model, fileUri?: string): SemanticModel {
  return toSemanticModelFromDocuments([{ model, uri: fileUri, source: undefined }]);
}

export function toSemanticModelFromDocuments(documents: Array<{ model: Model; uri?: string; source?: string }>): SemanticModel {
  const diagnostics: ForgeDiagnostic[] = [];
  const symbols = createEmptySymbolTable();
  const contexts: DocumentContext[] = documents.map(document => ({
    model: document.model,
    uri: document.uri,
    source: document.source,
    namespace: document.model.namespace?.name ?? '',
    localSymbols: createEmptySymbolTable(),
    scope: createEmptySymbolTable()
  }));

  for (const context of contexts) {
    declareSymbols(context.model, context.uri, context.localSymbols, diagnostics);
    mergeSymbolTable(symbols, context.localSymbols);
  }

  validateImportCycles(contexts, diagnostics);
  buildDocumentScopes(contexts, diagnostics);

  const contracts: ContractModel[] = [];
  const enums: EnumModel[] = [];
  const commands: CommandModel[] = [];
  const events: EventModel[] = [];

  for (const context of contexts) {
    for (const element of context.model.elements) {
      if (isContract(element)) {
        contracts.push(toContractModel(element, context.namespace, context.uri, context.scope, diagnostics));
      } else if (isEnum(element)) {
        enums.push(toEnumModel(element, context.namespace));
      } else if (isCommand(element)) {
        commands.push(toCommandModel(element, context.namespace, context.scope, diagnostics, context.uri));
      } else if (isEvent(element)) {
        events.push(toEventModel(element, context.namespace, context.scope, diagnostics, context.uri));
      }
    }
  }

  validateRelationships(contracts, diagnostics);

  const errors = diagnostics.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    throw new DiagnosticsError(stabilizeDiagnostics(enrichDiagnosticsForDocuments(errors, documents)));
  }

  return {
    contracts,
    enums: enums.length > 0 ? enums : undefined,
    commands: commands.length > 0 ? commands : undefined,
    events: events.length > 0 ? events : undefined,
    symbols
  };
}

function mergeSymbolTable(target: SymbolTable, source: SymbolTable): void {
  Object.assign(target.contracts, source.contracts);
  Object.assign(target.enums, source.enums);
}

function buildDocumentScopes(contexts: DocumentContext[], diagnostics: ForgeDiagnostic[]): void {
  const byUri = new Map(contexts.filter(context => context.uri).map(context => [normalizeUri(context.uri), context]));

  for (const context of contexts) {
    mergeSymbolTable(context.scope, context.localSymbols);

    for (const declaration of context.model.imports ?? []) {
      if (!declaration.path) continue;
      const importPath = stripQuotes(String(declaration.path));
      const imported = byUri.get(resolveImportUri(context.uri, String(declaration.path)));
      if (!imported) {
        diagnostics.push({
          code: 'FORGE_IMPORT_001',
          severity: 'error',
          message: `Import not found: ${importPath}.`,
          file: formatUriToPath(context.uri),
          ...getImportPathPosition(declaration, importPath),
          hint: 'Check that the imported file is included in this semantic compilation.'
        });
        continue;
      }

      for (const name of declaration.names ?? []) {
        const symbol = findExportedSymbol(imported.localSymbols, name);
        if (!symbol) {
          diagnostics.push(importNameDiagnostic(
            'FORGE_IMPORT_002',
            context.uri,
            declaration,
            name,
            `Imported name '${name}' does not exist in '${stripQuotes(String(declaration.path))}'.`,
            'Import a contract or enum declared by the target file.'
          ));
          continue;
        }

        const conflict = findVisibleSymbol(context.localSymbols, name) ?? findVisibleSymbol(context.scope, name);
        if (conflict && !isSameSymbol(conflict, symbol)) {
          diagnostics.push(importNameDiagnostic(
            'FORGE_IMPORT_003',
            context.uri,
            declaration,
            name,
            `Imported name '${name}' conflicts with visible ${conflict.kind} '${conflict.qualifiedName}'.`,
            'Rename one declaration or import it from a file where the name is unambiguous.'
          ));
          continue;
        }

        const table = symbol.kind === 'contract' ? context.scope.contracts : context.scope.enums;
        table[symbol.qualifiedName] = symbol;
        table[symbol.name] = symbol;
      }
    }
  }
}

function isSameSymbol(left: SymbolModel, right: SymbolModel): boolean {
  return left.kind === right.kind
    && left.qualifiedName === right.qualifiedName
    && normalizeUri(left.fileUri) === normalizeUri(right.fileUri);
}

function validateImportCycles(contexts: DocumentContext[], diagnostics: ForgeDiagnostic[]): void {
  const byUri = new Map(contexts.filter(context => context.uri).map(context => [normalizeUri(context.uri), context]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (context: DocumentContext, stack: string[]): void => {
    const uri = normalizeUri(context.uri);
    if (!uri || visited.has(uri)) return;

    if (visiting.has(uri)) {
      const cycle = [...stack.slice(stack.indexOf(uri)), uri].map(formatUriToPath).join(' -> ');
      diagnostics.push({
        code: 'FORGE_IMPORT_004',
        severity: 'error',
        message: `Import cycle detected: ${cycle}.`,
        file: formatUriToPath(context.uri),
        line: 1,
        column: 1,
        hint: 'Break the cycle by moving shared contracts/enums into a third file or removing one import.'
      });
      return;
    }

    visiting.add(uri);
    for (const declaration of context.model.imports ?? []) {
      if (!declaration.path) continue;
      const imported = byUri.get(resolveImportUri(context.uri, String(declaration.path)));
      if (imported) visit(imported, [...stack, uri]);
    }
    visiting.delete(uri);
    visited.add(uri);
  };

  for (const context of contexts) {
    visit(context, []);
  }
}

function findExportedSymbol(symbols: SymbolTable, name: string): SymbolModel | undefined {
  return symbols.contracts[name]
    ?? symbols.enums[name]
    ?? Object.values(symbols.contracts).find(symbol => symbol.name === name)
    ?? Object.values(symbols.enums).find(symbol => symbol.name === name);
}

function findVisibleSymbol(symbols: SymbolTable, name: string): SymbolModel | undefined {
  return symbols.contracts[name] ?? symbols.enums[name] ?? findExportedSymbol(symbols, name);
}

function importNameDiagnostic(
  code: string,
  fileUri: string | undefined,
  declaration: ImportDeclaration,
  name: string,
  message: string,
  hint: string
): ForgeDiagnostic {
  return {
    code,
    severity: 'error',
    message,
    file: formatUriToPath(fileUri),
    ...getImportNamePosition(declaration, name),
    hint
  };
}

function resolveImportUri(fromUri: string | undefined, rawPath: string): string {
  const importPath = stripQuotes(rawPath);
  if (!fromUri) return importPath;
  try {
    return normalizeUri(new URL(importPath, fromUri).toString());
  } catch {
    return importPath;
  }
}

function normalizeUri(uri: string | undefined): string {
  if (!uri) return '';
  return uri.replace(/\\/g, '/');
}

function enrichDiagnosticsForDocuments(
  diagnostics: ForgeDiagnostic[],
  documents: Array<{ uri?: string; source?: string }>
): ForgeDiagnostic[] {
  return diagnostics.map(diagnostic => {
    const document = documents.find(item => formatUriToPath(item.uri) === diagnostic.file);
    return document?.source ? enrichDiagnostic(diagnostic, document.source) : diagnostic;
  });
}

function enrichDiagnostics(diagnostics: ForgeDiagnostic[], source: string): ForgeDiagnostic[] {
  return diagnostics.map(diagnostic => enrichDiagnostic(diagnostic, source));
}

function enrichDiagnostic(diagnostic: ForgeDiagnostic, source: string): ForgeDiagnostic {
  if (!diagnostic.line) return diagnostic;
  const sourceLine = source.replace(/\r\n/g, '\n').split('\n')[diagnostic.line - 1];
  if (sourceLine === undefined) return diagnostic;
  const column = Math.max(1, diagnostic.column ?? 1);
  return {
    ...diagnostic,
    sourceLine,
    underline: `${' '.repeat(column - 1)}^`
  };
}

function createEmptySymbolTable(): SymbolTable {
  return { contracts: {}, enums: {} };
}

function declareSymbols(model: Model, fileUri: string | undefined, symbols: SymbolTable, diagnostics: ForgeDiagnostic[]): void {
  const namespace = model.namespace?.name ?? '';
  const localNames = new Set<string>();

  for (const element of model.elements) {
    if (!isContract(element) && !isEnum(element)) continue;

    const kind = isContract(element) ? 'contract' : 'enum';
    const name = element.name;
    const qualifiedName = createContractId(namespace, name);
    const table = kind === 'contract' ? symbols.contracts : symbols.enums;
    const duplicate = localNames.has(name) || table[qualifiedName] !== undefined;

    if (duplicate) {
      diagnostics.push({
        code: kind === 'contract' ? 'FORGE_SEMANTIC_002' : 'FORGE_SEMANTIC_005',
        severity: 'error',
        message: `${capitalize(kind)} '${name}' is already defined.`,
        file: formatUriToPath(fileUri),
        ...getNamePosition(element),
        hint: `Rename the ${kind} or remove the duplicate declaration.`
      });
      continue;
    }

    localNames.add(name);
    table[qualifiedName] = {
      name,
      namespace,
      qualifiedName,
      kind,
      values: isEnum(element) ? element.values.map(value => stripQuotes(String(value.value ?? value.name))) : undefined,
      fileUri
    };
  }
}

function toContractModel(
  contract: Contract,
  namespace: string,
  fileUri: string | undefined,
  symbols: SymbolTable,
  diagnostics: ForgeDiagnostic[]
): ContractModel {
  const fieldNames = new Set<string>();
  const fields: FieldModel[] = [];

  for (const member of contract.members) {
    if (!isField(member)) continue;
    if (fieldNames.has(member.name)) {
      diagnostics.push({
        code: 'FORGE_SEMANTIC_003',
        severity: 'error',
        message: `Duplicate field '${member.name}' in contract '${contract.name}'.`,
        file: formatUriToPath(fileUri),
        ...getNamePosition(member),
        hint: 'Rename the field or remove the duplicate declaration.'
      });
      continue;
    }

    fieldNames.add(member.name);
    fields.push(toFieldModel(member, namespace, symbols, diagnostics, fileUri));
  }

  const fieldMap = new Map(fields.map(field => [field.name, field]));
  const invariants = contract.members
    .filter(isInvariant)
    .map(invariant => toInvariantModel(invariant, contract.name, fieldMap, fileUri, diagnostics));

  applyLegacyPrimaryConvention(fields);
  validatePrimaryFields(contract.name, fields, fileUri, diagnostics);

  return {
    id: createContractId(namespace, contract.name),
    name: contract.name,
    namespace,
    fields,
    invariants
  };
}

function toFieldModel(
  field: Field,
  namespace: string,
  symbols: SymbolTable,
  diagnostics: ForgeDiagnostic[],
  fileUri?: string
): FieldModel {
  const typeRef = resolveType(field.type, namespace, symbols, diagnostics, fileUri, getAstNodePosition(field));
  validateFieldModifiers(field, fileUri, diagnostics);
  const modifiers = toModifierMap(field.modifiers);
  const defaultValue = modifiers.default ? parseLiteralValue(modifiers.default) : undefined;
  const foreign = modifiers.foreign ? parseForeignKey(modifiers.foreign) : undefined;
  const optional = Boolean(field.optional || field.type?.optional || modifiers.optional !== undefined);

  const fieldModel: FieldModel = {
    name: field.name,
    type: typeRef.name,
    optional,
    location: { file: formatUriToPath(fileUri), ...getAstNodePosition(field) },
    isArray: typeRef.isArray,
    modifiers,
    typeRef: { ...typeRef, optional },
    primary: modifiers.primary !== undefined,
    unique: modifiers.unique !== undefined,
    indexed: modifiers.index !== undefined,
    readonly: modifiers.readonly !== undefined,
    default: defaultValue,
    foreign
  };

  validateDefaultValue(fieldModel, fileUri, getAstNodePosition(field), diagnostics);
  return fieldModel;
}

function toEnumModel(element: Enum, namespace: string): EnumModel {
  return {
    name: element.name,
    namespace,
    values: element.values.map(v => ({
      name: v.name,
      value: v.value === undefined ? undefined : stripQuotes(String(v.value))
    }))
  };
}

function toCommandModel(
  element: Command,
  namespace: string,
  symbols: SymbolTable,
  diagnostics: ForgeDiagnostic[],
  fileUri?: string
): CommandModel {
  return {
    name: element.name,
    namespace,
    inputs: element.inputs.map(input => {
      const typeRef = resolveType(input.type, namespace, symbols, diagnostics, fileUri, getAstNodePosition(input));
      return { name: input.name, type: typeRef.name, typeRef };
    }),
    outputType: element.output?.type ? resolveType(element.output.type, namespace, symbols, diagnostics, fileUri, getAstNodePosition(element.output)).name : 'void',
    outputTypeRef: element.output?.type ? resolveType(element.output.type, namespace, symbols, diagnostics, fileUri, getAstNodePosition(element.output)) : undefined
  };
}

function toEventModel(
  element: Event,
  namespace: string,
  symbols: SymbolTable,
  diagnostics: ForgeDiagnostic[],
  fileUri?: string
): EventModel {
  return {
    name: element.name,
    namespace,
    fields: element.fields.map(field => {
      const typeRef = resolveType(field.type, namespace, symbols, diagnostics, fileUri, getAstNodePosition(field));
      return { name: field.name, type: typeRef.name, typeRef };
    })
  };
}

function toInvariantModel(
  invariant: Invariant,
  contractName: string,
  fields: Map<string, FieldModel>,
  fileUri: string | undefined,
  diagnostics: ForgeDiagnostic[]
): InvariantModel {
  const comparisons = invariant.expression?.flatMap(expr => {
    const first = toInvariantComparisonModel(expr, fields, invariant, contractName, fileUri, diagnostics);
    const additional = (expr.additional ?? []).map((comparison: any, index: number) => ({
      ...toInvariantComparisonModel(comparison, fields, invariant, contractName, fileUri, diagnostics),
      logicalOperator: String(expr.logicalOperators?.[index] ?? '&&') as '&&' | '||'
    }));
    return [first, ...additional];
  }) ?? [];

  return {
    expression: comparisons.map(expr => `${expr.logicalOperator ? `${expr.logicalOperator} ` : ''}${expr.left.raw} ${expr.operator} ${expr.right.raw}`).join(' '),
    name: invariant.name,
    comparisons
  };
}

function toInvariantComparisonModel(
  expr: any,
  fields: Map<string, FieldModel>,
  invariant: Invariant,
  contractName: string,
  fileUri: string | undefined,
  diagnostics: ForgeDiagnostic[]
): InvariantComparisonModel {
  const left = toInvariantTermOperand(expr.left, fields, invariant, contractName, fileUri, diagnostics);
  const right = toInvariantTermOperand(expr.right, fields, invariant, contractName, fileUri, diagnostics);
  validateInvariantComparison(left, expr.operator, right, invariant, contractName, fileUri, diagnostics);
  return { left, operator: expr.operator, right };
}

function toInvariantTermOperand(
  term: unknown,
  fields: Map<string, FieldModel>,
  invariant: Invariant,
  contractName: string,
  fileUri: string | undefined,
  diagnostics: ForgeDiagnostic[]
): InvariantOperandModel {
  const values = getInvariantTermValues(term);
  const operators = getInvariantTermOperators(term);

  if (values.length <= 1) {
    return toInvariantOperand(String(values[0] ?? term), fields, invariant, contractName, fileUri, diagnostics);
  }

  const parts = values.map((value, index) => ({
    operator: index === 0 ? undefined : operators[index - 1],
    operand: toInvariantOperand(String(value), fields, invariant, contractName, fileUri, diagnostics)
  }));
  validateInvariantArithmeticExpression(parts, invariant, contractName, fileUri, diagnostics);

  return {
    raw: parts.map(part => `${part.operator ? `${part.operator} ` : ''}${part.operand.raw}`).join(' '),
    kind: 'expression',
    terms: parts
  };
}

function toInvariantOperand(
  raw: string,
  fields: Map<string, FieldModel>,
  invariant: Invariant,
  contractName: string,
  fileUri: string | undefined,
  diagnostics: ForgeDiagnostic[]
): InvariantOperandModel {
  if (raw === '') {
    return { raw: '""', kind: 'literal', literal: { raw: '""', kind: 'string', value: '' } };
  }

  const field = fields.get(raw);
  if (field) {
    return { raw, kind: 'field', field: raw, fieldType: field.type, fieldTypeKind: field.typeRef?.kind };
  }

  if (isLiteral(raw)) {
    return { raw, kind: 'literal', literal: parseLiteralValue(raw) };
  }

  diagnostics.push({
    code: 'FORGE_SEMANTIC_004',
    severity: 'error',
    message: `Invalid invariant reference '${raw}' in contract '${contractName}'. Unknown field '${raw}' in invariant.`,
    file: formatUriToPath(fileUri),
    ...getAstNodePosition(invariant),
    hint: `The field '${raw}' does not exist in contract '${contractName}'.`
  });
  return { raw, kind: 'field', field: raw };
}

function validateInvariantArithmeticExpression(
  parts: InvariantTermPartModel[],
  invariant: Invariant,
  contractName: string,
  fileUri: string | undefined,
  diagnostics: ForgeDiagnostic[]
): void {
  const invalidOperand = parts.find(part => {
    const type = inferInvariantOperandType(part.operand);
    return type !== 'unknown' && type !== 'number';
  });

  if (!invalidOperand) return;

  diagnostics.push({
    code: 'FORGE_SEMANTIC_010',
    severity: 'error',
    message: `Invariant in contract '${contractName}' uses non-numeric operand '${invalidOperand.operand.raw}' in an arithmetic expression.`,
    file: formatUriToPath(fileUri),
    ...getAstNodePosition(invariant),
    hint: 'Use int, float or decimal fields and numeric literals with arithmetic operators.'
  });
}

function validateInvariantComparison(
  left: InvariantOperandModel,
  operator: string,
  right: InvariantOperandModel,
  invariant: Invariant,
  contractName: string,
  fileUri: string | undefined,
  diagnostics: ForgeDiagnostic[]
): void {
  const leftType = inferInvariantOperandType(left);
  const rightType = inferInvariantOperandType(right);
  if (leftType === 'unknown' || rightType === 'unknown') return;

  const orderedComparison = ['>', '>=', '<', '<='].includes(operator);
  const equalityComparison = ['==', '!='].includes(operator);
  const valid = orderedComparison
    ? leftType === 'number' && rightType === 'number'
    : equalityComparison && (leftType === rightType || leftType === 'json' || rightType === 'json');

  if (!valid) {
    diagnostics.push({
      code: 'FORGE_SEMANTIC_010',
      severity: 'error',
      message: `Invariant in contract '${contractName}' compares incompatible types: '${left.raw}' (${leftType}) ${operator} '${right.raw}' (${rightType}).`,
      file: formatUriToPath(fileUri),
      ...getAstNodePosition(invariant),
      hint: 'Use numeric fields for ordered comparisons and matching types for equality comparisons.'
    });
  }
}

function inferInvariantOperandType(operand: InvariantOperandModel): 'number' | 'string' | 'boolean' | 'json' | 'unknown' {
  if (operand.kind === 'expression') {
    const termTypes = (operand.terms ?? []).map(term => inferInvariantOperandType(term.operand));
    return termTypes.every(type => type === 'number') ? 'number' : 'unknown';
  }
  if (operand.kind === 'literal') {
    if (operand.literal?.kind === 'number') return 'number';
    if (operand.literal?.kind === 'boolean') return 'boolean';
    if (operand.literal?.kind === 'string') return 'string';
    return 'unknown';
  }
  if (operand.kind === 'field') {
    return inferInvariantFieldType(operand.fieldType, operand.fieldTypeKind);
  }
  return 'unknown';
}

function inferInvariantFieldType(type: string | undefined, kind?: TypeKind): 'number' | 'string' | 'boolean' | 'json' | 'unknown' {
  if (kind === 'enum') return 'string';
  if (type === 'int' || type === 'float' || type === 'decimal') return 'number';
  if (type === 'string' || type === 'uuid' || type === 'datetime' || type === 'date' || type === 'bytes') return 'string';
  if (type === 'boolean') return 'boolean';
  if (type === 'json') return 'json';
  return 'unknown';
}

function getInvariantTermValues(term: any): unknown[] {
  return Array.isArray(term?.values) ? term.values : [term];
}

function getInvariantTermOperators(term: any): string[] {
  return Array.isArray(term?.operators) ? term.operators.map(String) : [];
}

function resolveType(
  type: any,
  namespace: string,
  symbols: SymbolTable,
  diagnostics: ForgeDiagnostic[],
  fileUri: string | undefined,
  position: { line: number; column: number }
): TypeModel {
  const name = getFieldTypeString(type);
  const baseName = name.split('<')[0].trim();
  const isArray = Boolean(type?.arrayMarker);
  const optional = Boolean(type?.optional);

  if (isPrimitiveType(baseName)) {
    return { name: baseName, kind: 'primitive', isArray, optional };
  }

  const contract = lookupSymbol(symbols.contracts, namespace, baseName);
  if (contract) {
    return {
      name: baseName,
      kind: 'contract',
      isArray,
      optional,
      namespace: contract.namespace,
      qualifiedName: contract.qualifiedName
    };
  }

  const enumSymbol = lookupSymbol(symbols.enums, namespace, baseName);
  if (enumSymbol) {
    return {
      name: baseName,
      kind: 'enum',
      isArray,
      optional,
      namespace: enumSymbol.namespace,
      qualifiedName: enumSymbol.qualifiedName,
      values: enumSymbol.values
    };
  }

  diagnostics.push({
    code: 'FORGE_SEMANTIC_001',
    severity: 'error',
    message: `Unknown type '${baseName}'.`,
    file: formatUriToPath(fileUri),
    ...position,
    hint: `Supported primitive types: ${primitiveTypes.join(', ')}. Custom types must refer to a contract or enum visible in this compilation.`
  });

  return { name: baseName, kind: 'unresolved', isArray, optional };
}

function validateRelationships(contracts: ContractModel[], diagnostics: ForgeDiagnostic[]): void {
  const byName = new Map(contracts.map(contract => [contract.name, contract]));

  for (const contract of contracts) {
    for (const field of contract.fields) {
      if (!field.foreign) continue;

      if (field.typeRef?.kind === 'contract') {
        const localKey = field.foreign.field;
        const localField = localKey ? contract.fields.find(candidate => candidate.name === localKey) : undefined;
        const target = byName.get(field.type);
        const targetPrimary = target ? getPrimaryField(target) : undefined;

        if (!localKey || !localField) {
          diagnostics.push({
            code: 'FORGE_SEMANTIC_006',
            severity: 'error',
            message: `Invalid foreign key '${field.foreign.raw}' on field '${field.name}'.`,
            file: field.location?.file,
            line: field.location?.line,
            column: field.location?.column,
            hint: `Use @foreign(localField) where localField exists on '${contract.name}'.`
          });
        } else if (!targetPrimary) {
          diagnostics.push({
            code: 'FORGE_SEMANTIC_006',
            severity: 'error',
            message: `Contract '${field.type}' does not have a primary field for relationship '${contract.name}.${field.name}'.`,
            file: field.location?.file,
            line: field.location?.line,
            column: field.location?.column,
            hint: `Add @primary to one required scalar field on '${field.type}'.`
          });
        } else if (localField.type !== targetPrimary.type) {
          diagnostics.push({
            code: 'FORGE_SEMANTIC_006',
            severity: 'error',
            message: `Foreign key '${contract.name}.${localField.name}' type '${localField.type}' does not match '${field.type}.${targetPrimary.name}' type '${targetPrimary.type}'.`,
            file: localField.location?.file,
            line: localField.location?.line,
            column: localField.location?.column,
            hint: 'Use the same type for the local foreign key and the referenced primary field.'
          });
        } else {
          field.foreign.targetContract = field.type;
          field.foreign.targetField = targetPrimary.name;
        }
        continue;
      }

      if (field.foreign.targetContract) {
        const target = byName.get(field.foreign.targetContract);
        if (!target || !target.fields.some(candidate => candidate.name === field.foreign?.targetField)) {
          diagnostics.push({
            code: 'FORGE_SEMANTIC_006',
            severity: 'error',
            message: `Invalid foreign target '${field.foreign.raw}' on field '${field.name}'.`,
            file: field.location?.file,
            line: field.location?.line,
            column: field.location?.column,
            hint: 'Use @foreign(Contract.field) with an existing contract and field.'
          });
        }
      } else {
        diagnostics.push({
          code: 'FORGE_SEMANTIC_006',
          severity: 'error',
          message: `Modifier '@foreign' on scalar field '${field.name}' must reference a contract field.`,
          file: field.location?.file,
          line: field.location?.line,
          column: field.location?.column,
          hint: 'Use @foreign(Contract.field) on scalar foreign key fields, or @foreign(localField) on relation fields.'
        });
      }
    }
  }
}

function applyLegacyPrimaryConvention(fields: FieldModel[]): void {
  if (fields.some(field => field.primary)) return;
  const idField = fields.find(field => field.name === 'id' && !field.optional && !field.isArray);
  if (idField) {
    idField.primary = true;
    idField.unique = true;
  }
}

function getPrimaryField(contract: ContractModel): FieldModel | undefined {
  return contract.fields.find(field => field.primary);
}

function validatePrimaryFields(
  contractName: string,
  fields: FieldModel[],
  fileUri: string | undefined,
  diagnostics: ForgeDiagnostic[]
): void {
  const primaryFields = fields.filter(field => field.primary);
  if (primaryFields.length > 1) {
    diagnostics.push({
      code: 'FORGE_SEMANTIC_008',
      severity: 'error',
      message: `Contract '${contractName}' has multiple primary fields.`,
      file: formatUriToPath(fileUri),
      hint: 'Use @primary on exactly one field.'
    });
  }

  for (const field of primaryFields) {
    if (field.isArray || field.optional) {
      diagnostics.push({
        code: 'FORGE_SEMANTIC_008',
        severity: 'error',
        message: `Primary field '${field.name}' in contract '${contractName}' must be required and scalar.`,
        file: formatUriToPath(fileUri),
        line: field.location?.line,
        column: field.location?.column,
        hint: 'Remove ? or [] from the primary field.'
      });
    }
  }
}

function validateFieldModifiers(field: Field, fileUri: string | undefined, diagnostics: ForgeDiagnostic[]): void {
  const seen = new Set<string>();
  for (const modifier of field.modifiers ?? []) {
    if (!modifier.name) continue;
    const position = getAstNodePosition(modifier);

    if (!allowedFieldModifiers.has(modifier.name)) {
      diagnostics.push({
        code: 'FORGE_SEMANTIC_007',
        severity: 'error',
        message: `Unknown modifier '@${modifier.name}' on field '${field.name}'.`,
        file: formatUriToPath(fileUri),
        ...position,
        hint: `Supported field modifiers: ${Array.from(allowedFieldModifiers).map(name => `@${name}`).join(', ')}.`
      });
    }

    if (seen.has(modifier.name)) {
      diagnostics.push({
        code: 'FORGE_SEMANTIC_007',
        severity: 'error',
        message: `Duplicate modifier '@${modifier.name}' on field '${field.name}'.`,
        file: formatUriToPath(fileUri),
        ...position,
        hint: 'Remove the repeated modifier.'
      });
    }
    seen.add(modifier.name);

    if (modifiersRequiringValue.has(modifier.name) && modifier.value === undefined) {
      diagnostics.push({
        code: 'FORGE_SEMANTIC_007',
        severity: 'error',
        message: `Modifier '@${modifier.name}' on field '${field.name}' requires a value.`,
        file: formatUriToPath(fileUri),
        ...position,
        hint: `Use @${modifier.name}(...).`
      });
    }

    if (modifiersWithoutValue.has(modifier.name) && modifier.value !== undefined) {
      diagnostics.push({
        code: 'FORGE_SEMANTIC_007',
        severity: 'error',
        message: `Modifier '@${modifier.name}' on field '${field.name}' does not accept a value.`,
        file: formatUriToPath(fileUri),
        ...position,
        hint: `Use @${modifier.name} without parentheses.`
      });
    }
  }
}

function validateDefaultValue(
  field: FieldModel,
  fileUri: string | undefined,
  position: { line: number; column: number },
  diagnostics: ForgeDiagnostic[]
): void {
  if (!field.default) return;

  const valid =
    (field.type === 'string' && field.default.kind === 'string') ||
    (field.type === 'uuid' && (field.default.kind === 'string' || field.default.raw === 'uuid()')) ||
    ((field.type === 'datetime' || field.type === 'date') && (field.default.kind === 'string' || field.default.raw === 'now()')) ||
    ((field.type === 'int' || field.type === 'float' || field.type === 'decimal') && field.default.kind === 'number') ||
    (field.type === 'boolean' && field.default.kind === 'boolean') ||
    (field.typeRef?.kind === 'enum' && field.default.kind === 'identifier' && (field.typeRef.values ?? []).includes(String(field.default.value)));

  if (!valid) {
    diagnostics.push({
      code: 'FORGE_SEMANTIC_009',
      severity: 'error',
      message: `Invalid default '${field.default.raw}' for field '${field.name}' of type '${field.type}'.`,
      file: formatUriToPath(fileUri),
      ...position,
      hint: 'Use a default value compatible with the field type.'
    });
  }
}

function getFieldTypeString(type: any): string {
  if (!type) return 'unknown';

  const baseType = type.baseType;
  if (!baseType) return 'unknown';

  if (baseType.type) {
    return baseType.type;
  }

  if (baseType.name) {
    if (baseType.typeArgs && baseType.typeArgs.length > 0) {
      const args = baseType.typeArgs.map((arg: any) => getFieldTypeString(arg)).join(', ');
      return `${baseType.name}<${args}>`;
    }
    return baseType.name;
  }

  return 'unknown';
}

function toModifierMap(modifiers: Array<{ name?: string; value?: unknown }> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const modifier of modifiers ?? []) {
    if (!modifier.name) continue;
    result[modifier.name] = modifier.value === undefined ? '' : stringifyModifierValue(modifier.value);
  }
  return result;
}

function stringifyModifierValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const objectValue = value as { name?: string; $cstNode?: { text?: string } } | undefined;
  if (objectValue?.name) return `${objectValue.name}()`;
  if (objectValue?.$cstNode?.text) return objectValue.$cstNode.text;
  return String(value);
}

function parseForeignKey(raw: string): ForeignKeyModel {
  const parts = raw.split('.');
  if (parts.length === 2) {
    return { raw, targetContract: parts[0], targetField: parts[1] };
  }
  return { raw, field: raw };
}

function parseLiteralValue(rawValue: string): LiteralValueModel {
  const raw = String(rawValue);
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return { raw, kind: 'string', value: stripQuotes(raw) };
  }
  if (raw === 'true' || raw === 'false') {
    return { raw, kind: 'boolean', value: raw === 'true' };
  }
  if (!Number.isNaN(Number(raw)) && raw.trim() !== '') {
    return { raw, kind: 'number', value: Number(raw) };
  }
  if (/^[A-Za-z_]\w*\(\)$/.test(raw)) {
    return { raw, kind: 'function', value: raw };
  }
  return { raw, kind: 'identifier', value: raw };
}

function lookupSymbol(table: Record<string, SymbolModel>, namespace: string, name: string): SymbolModel | undefined {
  return table[createContractId(namespace, name)] ?? table[name] ?? Object.values(table).find(symbol => symbol.name === name);
}

function isPrimitiveType(type: string): type is PrimitiveTypeName {
  return (primitiveTypes as readonly string[]).includes(type);
}

function isLiteral(value: string): boolean {
  const stringLiteral = value.startsWith('"') && value.endsWith('"');
  const numberLiteral = !Number.isNaN(Number(value)) && value.trim() !== '';
  const booleanLiteral = value === 'true' || value === 'false';
  const nullLiteral = value === 'null';
  return stringLiteral || numberLiteral || booleanLiteral || nullLiteral;
}

function stripQuotes(value: string): string {
  return value.replace(/^"|"$/g, '');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getAstNodePosition(node: any) {
  const cstNode = node.$cstNode;
  if (!cstNode?.range) return { line: 1, column: 1 };
  return {
    line: cstNode.range.start.line + 1,
    column: cstNode.range.start.character + 1
  };
}

function getNamePosition(node: any) {
  let pos = getAstNodePosition(node);
  const nameNode = findTextInCst(node.$cstNode, node.name);
  if (nameNode?.range) {
    pos = {
      line: nameNode.range.start.line + 1,
      column: nameNode.range.start.character + 1
    };
  }
  return pos;
}

function getImportNamePosition(declaration: ImportDeclaration, name: string): { line: number; column: number } {
  let pos = getAstNodePosition(declaration);
  const nameNode = findTextInCst(declaration.$cstNode, name);
  if (nameNode?.range) {
    pos = {
      line: nameNode.range.start.line + 1,
      column: nameNode.range.start.character + 1
    };
  }
  return pos;
}

function getImportPathPosition(declaration: ImportDeclaration, importPath: string): { line: number; column: number } {
  let pos = getAstNodePosition(declaration);
  const pathNode = findTextInCst(declaration.$cstNode, importPath);
  if (pathNode?.range) {
    pos = {
      line: pathNode.range.start.line + 1,
      column: pathNode.range.start.character + 1
    };
  }
  return pos;
}

function findTextInCst(cstNode: any, text: string): any {
  if (!cstNode) return undefined;
  if (!cstNode.content && cstNode.text?.trim() === text.trim()) {
    return cstNode;
  }
  if (cstNode.content) {
    for (const child of cstNode.content) {
      const found = findTextInCst(child, text);
      if (found) return found;
    }
  }
  return undefined;
}

function isField(node: any): node is Field {
  return node && 'name' in node && 'type' in node && !('operator' in node);
}

function isInvariant(node: any): node is Invariant {
  return node && 'expression' in node;
}

function isContract(node: any): node is Contract {
  return node && 'name' in node && 'members' in node;
}

function isEnum(node: any): node is Enum {
  return node && 'values' in node;
}

function isCommand(node: any): node is Command {
  return node && 'inputs' in node && 'output' in node;
}

function isEvent(node: any): node is Event {
  return node && 'fields' in node && !('members' in node);
}
