import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createForgeServices } from './forge-module.js';
import type { Contract, Field, Invariant, Model } from './generated/ast.js';
import { type ForgeDiagnostic, normalizeLangiumError, formatUriToPath, type ErrorKind } from './diagnostics/normalize.js';
import { stabilizeDiagnostics, filterDiagnostics, MAX_ERRORS_PER_FILE, type StabilizedDiagnostic } from './diagnostics/stabilizer.js';

export { type ForgeDiagnostic, normalizeLangiumError, formatUriToPath, type ErrorKind };
export { stabilizeDiagnostics, filterDiagnostics, MAX_ERRORS_PER_FILE, type StabilizedDiagnostic };

const primitiveTypes = new Set([
  'string',
  'int',
  'float',
  'decimal',
  'boolean',
  'uuid',
  'datetime',
  'date'
]);

export interface SemanticModel {
  contracts: ContractModel[];
}

export interface ContractModel {
  id: string;
  name: string;
  namespace: string;
  fields: FieldModel[];
  invariants: InvariantModel[];
}

export interface FieldModel {
  name: string;
  type: string;
  optional: boolean;
}

export interface InvariantModel {
  expression: string;
}

export interface ParseForgeOptions {
  uri?: string;
}

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
    const diagnostics = stabilizeDiagnostics(raw);
    throw new DiagnosticsError(diagnostics);
  }

  return document.parseResult.value;
}

export async function parseForgeToSemanticModel(source: string, options: ParseForgeOptions = {}): Promise<SemanticModel> {
  const model = await parseForge(source, options);
  return toSemanticModel(model, options.uri ?? model.$document?.uri?.toString());
}

export function toSemanticModel(model: Model, fileUri?: string): SemanticModel {
  const namespace = model.namespace?.name ?? '';
  const names = new Set<string>();
  const diagnostics: ForgeDiagnostic[] = [];

  const contracts = model.contracts.map(contract => {
    validateContract(contract, names, diagnostics, fileUri);

    return {
      id: createContractId(namespace, contract.name),
      name: contract.name,
      namespace,
      fields: contract.members.filter(isField).map(field => ({
        name: field.name,
        type: field.type,
        optional: Boolean(field.optional)
      })),
      invariants: contract.members.filter(isInvariant).map(invariant => ({
        expression: `${invariant.left} ${invariant.operator} ${invariant.right}`
      }))
    };
  });

  if (diagnostics.length > 0) {
    throw new DiagnosticsError(stabilizeDiagnostics(diagnostics));
  }

  return { contracts };
}

function getAstNodePosition(node: any) {
  const cstNode = node.$cstNode;
  if (!cstNode?.range) return { line: 1, column: 1 };
  return {
    line: cstNode.range.start.line + 1,
    column: cstNode.range.start.character + 1
  };
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

function validateContract(
  contract: Contract,
  names: Set<string>,
  diagnostics: ForgeDiagnostic[],
  fileUri?: string
): void {
  const file = formatUriToPath(fileUri);

  // 1. Duplicate Contract Name
  if (names.has(contract.name)) {
    let pos = getAstNodePosition(contract);
    const nameNode = findTextInCst(contract.$cstNode, contract.name);
    if (nameNode?.range) {
      pos = {
        line: nameNode.range.start.line + 1,
        column: nameNode.range.start.character + 1
      };
    }
    diagnostics.push({
      code: 'FORGE_SEMANTIC_002',
      severity: 'error',
      message: `Contract '${contract.name}' is already defined.`,
      file,
      ...pos,
      hint: 'Rename the contract or remove the duplicate declaration.'
    });
  } else {
    names.add(contract.name);
  }

  const fieldNames = new Set<string>();

  // 2. Fields validation
  for (const member of contract.members) {
    if (isField(member)) {
      // Duplicate field name
      if (fieldNames.has(member.name)) {
        let pos = getAstNodePosition(member);
        const nameNode = findTextInCst(member.$cstNode, member.name);
        if (nameNode?.range) {
          pos = {
            line: nameNode.range.start.line + 1,
            column: nameNode.range.start.character + 1
          };
        }
        diagnostics.push({
          code: 'FORGE_SEMANTIC_003',
          severity: 'error',
          message: `Duplicate field '${member.name}' in contract '${contract.name}'.`,
          file,
          ...pos,
          hint: 'Rename the field or remove the duplicate declaration.'
        });
      } else {
        fieldNames.add(member.name);
      }

      // Unknown type
      if (!primitiveTypes.has(member.type)) {
        let pos = getAstNodePosition(member);
        const typeNode = findTextInCst(member.$cstNode, member.type);
        if (typeNode?.range) {
          pos = {
            line: typeNode.range.start.line + 1,
            column: typeNode.range.start.character + 1
          };
        }

        diagnostics.push({
          code: 'FORGE_SEMANTIC_001',
          severity: 'error',
          message: `Unknown type '${member.type}'.`,
          file,
          ...pos,
          hint: `Supported types:\n\n- string\n- int\n- float\n- decimal\n- boolean\n- uuid\n- datetime\n- date`
        });
      }
    }
  }

  // 3. Invariants validation
  for (const member of contract.members) {
    if (isInvariant(member)) {
      // Check left side (must be a valid field name in the contract)
      if (!fieldNames.has(member.left)) {
        let pos = getAstNodePosition(member);
        const leftNode = findTextInCst(member.$cstNode, member.left);
        if (leftNode?.range) {
          pos = {
            line: leftNode.range.start.line + 1,
            column: leftNode.range.start.character + 1
          };
        }
        diagnostics.push({
          code: 'FORGE_SEMANTIC_004',
          severity: 'error',
          message: `Invalid invariant reference '${member.left}' in contract '${contract.name}'.`,
          file,
          ...pos,
          hint: `The field '${member.left}' does not exist in contract '${contract.name}'.`
        });
      }

      // Check right side if it is an ID (and not a boolean or number)
      const right = String(member.right);
      const isStringLiteral = right.startsWith('"') && right.endsWith('"');
      const isNumberLiteral = typeof member.right === 'number' || (!isNaN(Number(right)) && !isNaN(parseFloat(right)));
      const isBooleanLiteral = right === 'true' || right === 'false';
      
      if (!isStringLiteral && !isNumberLiteral && !isBooleanLiteral && /^[a-zA-Z_]\w*$/.test(right)) {
        if (!fieldNames.has(right)) {
          let pos = getAstNodePosition(member);
          const rightNode = findTextInCst(member.$cstNode, right);
          if (rightNode?.range) {
            pos = {
              line: rightNode.range.start.line + 1,
              column: rightNode.range.start.character + 1
            };
          }
          diagnostics.push({
            code: 'FORGE_SEMANTIC_004',
            severity: 'error',
            message: `Invalid invariant reference '${right}' in contract '${contract.name}'.`,
            file,
            ...pos,
            hint: `The field '${right}' does not exist in contract '${contract.name}'.`
          });
        }
      }
    }
  }
}

function isField(member: Contract['members'][number]): member is Field {
  return member.$type === 'Field';
}

function isInvariant(member: Contract['members'][number]): member is Invariant {
  return member.$type === 'Invariant';
}
