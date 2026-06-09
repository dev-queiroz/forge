import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createForgeServices } from './forge-module.js';
import type { Contract, Field, Invariant, Model, TypeReference, PrimitiveTypeRef, ComplexTypeRef, Enum, Command, Event } from './generated/ast.js';
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
  'date',
  'bytes',
  'json'
]);

export interface SemanticModel {
  contracts: ContractModel[];
  enums?: EnumModel[];
  commands?: CommandModel[];
  events?: EventModel[];
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
  modifiers?: Record<string, string>;
  isArray?: boolean;
}

export interface InvariantModel {
  expression: string;
  name?: string;
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
}

export interface CommandInputModel {
  name: string;
  type: string;
}

export interface EventModel {
  name: string;
  namespace: string;
  fields: EventFieldModel[];
}

export interface EventFieldModel {
  name: string;
  type: string;
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

  const contracts: ContractModel[] = [];
  const enums: EnumModel[] = [];
  const commands: CommandModel[] = [];
  const events: EventModel[] = [];

  // Extract contracts
  for (const element of model.elements) {
    if (isContract(element)) {
      validateContract(element, names, diagnostics, fileUri);
      contracts.push({
        id: createContractId(namespace, element.name),
        name: element.name,
        namespace,
        fields: element.members.filter(isField).map(field => ({
          name: field.name,
          type: getFieldTypeString(field.type),
          optional: Boolean(field.optional || field.type?.optional),
          isArray: Boolean(field.type?.arrayMarker),
          modifiers: field.modifiers?.reduce((acc, mod) => {
            if (mod.name) {
              acc[mod.name] = mod.value ?? '';
            }
            return acc;
          }, {} as Record<string, string>)
        })),
        invariants: element.members.filter(isInvariant).map(invariant => ({
          expression: invariant.expression?.map(expr =>
            `${expr.left} ${expr.operator} ${expr.right}`
          ).join(' ') ?? '',
          name: invariant.name
        }))
      });
    } else if (isEnum(element)) {
      enums.push({
        name: element.name,
        namespace,
        values: element.values.map(v => ({
          name: v.name,
          value: v.value
        }))
      });
    } else if (isCommand(element)) {
      commands.push({
        name: element.name,
        namespace,
        inputs: element.inputs.map(i => ({
          name: i.name,
          type: getFieldTypeString(i.type)
        })),
        outputType: element.output?.type ? getFieldTypeString(element.output.type) : 'void'
      });
    } else if (isEvent(element)) {
      events.push({
        name: element.name,
        namespace,
        fields: element.fields.map(f => ({
          name: f.name,
          type: getFieldTypeString(f.type)
        }))
      });
    }
  }

  // Filter to only error-level diagnostics for throwing
  const errors = diagnostics.filter(d => d.severity === 'error');

  if (errors.length > 0) {
    throw new DiagnosticsError(stabilizeDiagnostics(errors));
  }

  return {
    contracts,
    enums: enums.length > 0 ? enums : undefined,
    commands: commands.length > 0 ? commands : undefined,
    events: events.length > 0 ? events : undefined
  };
}

function getFieldTypeString(type: any): string {
  if (!type) return 'unknown';

  const baseType = type.baseType;
  if (!baseType) return 'unknown';

  if (baseType.type) {
    return baseType.type;
  } else if (baseType.name) {
    if (baseType.typeArgs && baseType.typeArgs.length > 0) {
      const args = baseType.typeArgs.map((arg: any) => getFieldTypeString(arg)).join(', ');
      return `${baseType.name}<${args}>`;
    }
    return baseType.name;
  }

  return 'unknown';
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
      const typeString = getFieldTypeString(member.type);
      if (!isPrimitiveOrCustomType(typeString)) {
        let pos = getAstNodePosition(member);
        diagnostics.push({
          code: 'FORGE_SEMANTIC_001',
          severity: 'error',
          message: `Unknown type '${typeString}'.`,
          file,
          ...pos,
          hint: `Supported primitive types:\n\n- string\n- int\n- float\n- decimal\n- boolean\n- uuid\n- datetime\n- date\n- bytes\n- json\n\nOr use a custom type that starts with an uppercase letter.`
        });
      }
    }
  }

  // 3. Invariants validation
  for (const member of contract.members) {
    if (isInvariant(member)) {
      for (const expr of member.expression) {
        // Check left side (must be a valid field name in the contract or a literal)
        const left = String(expr.left);
        if (!fieldNames.has(left) && !isLiteral(left)) {
          const pos = getAstNodePosition(member);
          diagnostics.push({
            code: 'FORGE_SEMANTIC_004',
            severity: 'error',
            message: `Invalid invariant reference '${left}' in contract '${contract.name}'.`,
            file,
            ...pos,
            hint: `The field '${left}' does not exist in contract '${contract.name}'.`
          });
        }

        // Check right side if it is an ID (and not a boolean or number)
        const right = String(expr.right);
        if (!isLiteral(right) && !fieldNames.has(right)) {
          const pos = getAstNodePosition(member);
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

function isLiteral(value: string): boolean {
  const stringLiteral = value.startsWith('"') && value.endsWith('"');
  const numberLiteral = !isNaN(Number(value)) && !isNaN(parseFloat(value));
  const booleanLiteral = value === 'true' || value === 'false';
  const nullLiteral = value === 'null';

  return stringLiteral || numberLiteral || booleanLiteral || nullLiteral;
}

function isPrimitiveOrCustomType(type: string): boolean {
  // Remove generic parameters for checking
  const baseType = type.split('<')[0].trim();
  // Remove array markers
  const cleanType = baseType.replace(/\[\]$/, '');

  // Check if it's a primitive type
  if (primitiveTypes.has(cleanType)) {
    return true;
  }

  // Check if it's a properly-capitalized custom type (like User, Role, Product)
  // Custom types should start with uppercase letter
  return /^[A-Z]/.test(cleanType);
}

// Type guards
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
