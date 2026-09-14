import type { ContractModel, FieldModel, InvariantComparisonModel, InvariantModel, SemanticModel } from '@forge/language';
import { generateOpenApi } from './openapi/generator.js';
import { generateNest } from './nest/generator.js';
import { writeNestProject } from './nest/writer.js';
import { generatePrisma } from './prisma/generator.js';

export { generateOpenApi, generateNest, writeNestProject, generatePrisma };

const tsTypeMap: Record<string, string> = {
  uuid: 'string',
  string: 'string',
  decimal: 'number',
  float: 'number',
  int: 'number',
  boolean: 'boolean',
  datetime: 'string',
  date: 'string',
  bytes: 'Uint8Array',
  json: 'unknown'
};

const jsonSchemaTypeMap: Record<string, string> = {
  uuid: 'string',
  string: 'string',
  datetime: 'string',
  date: 'string',
  boolean: 'boolean',
  int: 'number',
  float: 'number',
  decimal: 'number',
  bytes: 'string',
  json: 'object'
};

const zodTypeMap: Record<string, string> = {
  string: 'z.string()',
  uuid: 'z.string()',
  int: 'z.number().int()',
  float: 'z.number()',
  decimal: 'z.number()',
  boolean: 'z.boolean()',
  datetime: 'z.string()',
  date: 'z.string()',
  bytes: 'z.instanceof(Uint8Array)',
  json: 'z.unknown()'
};

export interface GeneratedFile {
  path: string;
  content: string;
}

export function generateTypeScript(model: SemanticModel): GeneratedFile[] {
  return [
    ...(model.enums ?? []).map(enumModel => ({
      path: `typescript/${enumModel.name}.ts`,
      content: renderTypeScriptEnum(enumModel)
    })),
    ...model.contracts.map(contract => ({
    path: `typescript/${contract.name}.ts`,
    content: renderTypeScriptContract(contract)
    }))
  ];
}

export function generateJsonSchema(model: SemanticModel): GeneratedFile[] {
  return model.contracts.map(contract => ({
    path: `json-schema/${contract.name}.schema.json`,
    content: `${JSON.stringify(toJsonSchema(contract), null, 2)}\n`
  }));
}

export class ZodGenerator {
  generate(model: SemanticModel): GeneratedFile[] {
    return model.contracts.map(contract => ({
      path: `zod/${contract.name}.ts`,
      content: renderZodContract(contract)
    }));
  }
}

export function generateZod(model: SemanticModel): GeneratedFile[] {
  return new ZodGenerator().generate(model);
}

export function generateAll(model: SemanticModel): GeneratedFile[] {
  return [...generateTypeScript(model), ...generateJsonSchema(model), ...generateZod(model), ...generateClient(model)];
}

export function generateClient(model: SemanticModel): GeneratedFile[] {
  return [{
    path: 'client/index.ts',
    content: renderClient(model)
  }];
}

function renderTypeScriptContract(contract: ContractModel): string {
  const imports = renderTypeScriptImports(contract);
  const fields = contract.fields
    .map(field => `  ${field.name}${field.optional ? '?' : ''}: ${toTypeScriptType(field)};`)
    .join('\n');

  return `${imports}${imports ? '\n' : ''}export interface ${contract.name} {\n${fields}\n}\n`;
}

function renderTypeScriptImports(contract: ContractModel): string {
  const names = Array.from(new Set(contract.fields
    .filter(field => (field.typeRef?.kind === 'contract' || field.typeRef?.kind === 'enum') && field.type !== contract.name)
    .map(field => field.type)
  )).sort((a, b) => a.localeCompare(b));

  return names.map(name => `import type { ${name} } from './${name}';`).join('\n');
}

function toTypeScriptType(field: FieldModel): string {
  const baseType = field.typeRef?.kind === 'contract' || field.typeRef?.kind === 'enum'
    ? field.type
    : tsTypeMap[field.type] ?? 'unknown';
  return field.isArray ? `${baseType}[]` : baseType;
}

function renderTypeScriptEnum(enumModel: NonNullable<SemanticModel['enums']>[number]): string {
  const values = enumModel.values.map(value => `  ${value.name}: ${JSON.stringify(value.value ?? value.name)},`).join('\n');
  return `export const ${enumModel.name} = {\n${values}\n} as const;\n\nexport type ${enumModel.name} = typeof ${enumModel.name}[keyof typeof ${enumModel.name}];\n`;
}

function renderClient(model: SemanticModel): string {
  const typeDeclarations = [
    ...(model.enums ?? []).map(renderTypeScriptEnum),
    ...model.contracts.map(renderClientEntityType)
  ].join('\n');
  const inputTypes = model.contracts.map(renderClientInputTypes).join('\n\n');
  const resources = model.contracts
    .map(contract => `    ${clientResourceName(contract.name)}: createResourceClient<${contract.name}, Create${contract.name}Input, Update${contract.name}Input>(options, '${clientResourceName(contract.name)}'),`)
    .join('\n');

  return `${typeDeclarations}

export interface ForgeClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
}

${inputTypes}

export interface ResourceClient<Entity, CreateInput, UpdateInput> {
  findMany(): Promise<Entity[]>;
  findById(id: string | number): Promise<Entity>;
  create(input: CreateInput): Promise<Entity>;
  update(id: string | number, input: UpdateInput): Promise<Entity>;
  delete(id: string | number): Promise<void>;
}

export function createForgeClient(options: ForgeClientOptions) {
  return {
${resources}
  };
}

function createResourceClient<Entity, CreateInput, UpdateInput>(
  options: ForgeClientOptions,
  resource: string
): ResourceClient<Entity, CreateInput, UpdateInput> {
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const fetcher = options.fetch ?? fetch;
    const response = await fetcher(\`\${trimTrailingSlash(options.baseUrl)}\${path}\`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      throw new Error(\`Forge client request failed: \${response.status} \${response.statusText}\`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  };

  return {
    findMany: () => request<Entity[]>(\`/\${resource}\`),
    findById: id => request<Entity>(\`/\${resource}/\${encodeURIComponent(String(id))}\`),
    create: input => request<Entity>(\`/\${resource}\`, { method: 'POST', body: JSON.stringify(input) }),
    update: (id, input) => request<Entity>(\`/\${resource}/\${encodeURIComponent(String(id))}\`, { method: 'PUT', body: JSON.stringify(input) }),
    delete: id => request<void>(\`/\${resource}/\${encodeURIComponent(String(id))}\`, { method: 'DELETE' })
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\\/$/, '');
}
`;
}

function renderClientEntityType(contract: ContractModel): string {
  const fields = contract.fields
    .map(field => `  ${field.name}${field.optional ? '?' : ''}: ${toClientType(field)};`)
    .join('\n');

  return `export interface ${contract.name} {
${fields}
}
`;
}

function renderClientInputTypes(contract: ContractModel): string {
  const createFields = contract.fields.filter(isWritableInputField);
  const createBody = createFields.map(field => `  ${field.name}${isClientOptionalCreateField(field) ? '?' : ''}: ${toClientType(field)};`).join('\n');
  const updateBody = createFields.map(field => `  ${field.name}?: ${toClientType(field)};`).join('\n');
  return `export interface Create${contract.name}Input {
${createBody}
}

export interface Update${contract.name}Input {
${updateBody}
}`;
}

function toClientType(field: FieldModel): string {
  const baseType = field.typeRef?.kind === 'contract' || field.typeRef?.kind === 'enum'
    ? field.type
    : tsTypeMap[field.type] ?? 'unknown';
  return field.isArray ? `${baseType}[]` : baseType;
}

function isWritableInputField(field: FieldModel): boolean {
  if (field.readonly || field.typeRef?.kind === 'contract') {
    return false;
  }

  if (field.primary) {
    return !field.default && field.name !== 'id';
  }

  return field.name !== 'id';
}

function isClientOptionalCreateField(field: FieldModel): boolean {
  return field.optional || Boolean(field.default);
}

function clientResourceName(name: string): string {
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  return lower.endsWith('s') ? lower : `${lower}s`;
}

function toJsonSchema(contract: ContractModel): object {
  const properties = Object.fromEntries(
    contract.fields.map(field => [
      field.name,
      {
        ...toJsonSchemaProperty(field)
      }
    ])
  );

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: contract.name,
    type: 'object',
    properties,
    required: contract.fields.filter(field => !field.optional).map(field => field.name)
  };
}

function toJsonSchemaProperty(field: FieldModel): object {
  const base = toJsonSchemaBaseProperty(field);
  const withDefault = field.default ? { ...base, default: field.default.value } : base;

  if (field.isArray) {
    return { type: 'array', items: base, ...(field.default ? { default: field.default.value } : {}) };
  }

  return withDefault;
}

function toJsonSchemaBaseProperty(field: FieldModel): object {
  if (field.typeRef?.kind === 'enum') {
    return { type: 'string', enum: field.typeRef.values ?? [] };
  }

  if (field.typeRef?.kind === 'contract') {
    return { $ref: `${field.type}.schema.json` };
  }

  if (field.type === 'bytes') {
    return { type: 'string', contentEncoding: 'base64' };
  }

  if (field.type === 'json') {
    return {};
  }

  return { type: jsonSchemaTypeMap[field.type] ?? 'string' };
}

function renderZodContract(contract: ContractModel): string {
  const imports = renderZodImports(contract);
  const fields = contract.fields
    .map(field => `  ${field.name}: ${toZodType(field)},`)
    .join('\n');
  const refinements = contract.invariants.map(invariant => renderZodRefinement(invariant));

  return [
    'import { z } from "zod";',
    imports || undefined,
    '',
    `export const ${contract.name}Schema = z.object({`,
    fields,
    `})${refinements.length > 0 ? refinements.join('') : ''};`,
    '',
    `export type ${contract.name} = z.infer<typeof ${contract.name}Schema>;`,
    ''
  ].filter(line => line !== undefined).join('\n');
}

function renderZodImports(contract: ContractModel): string {
  const schemaImports = Array.from(new Set(contract.fields
    .filter(field => field.typeRef?.kind === 'contract' && field.type !== contract.name)
    .map(field => field.type)
  )).sort((left, right) => left.localeCompare(right));

  return schemaImports
    .map(name => `import { ${name}Schema } from "./${name}";`)
    .join('\n');
}

function toZodType(field: FieldModel): string {
  let baseType = toZodBaseType(field);

  if (field.default) {
    baseType = `${baseType}.default(${toZodDefault(field)})`;
  }

  if (field.isArray) {
    baseType = `z.array(${baseType})`;
  }

  return field.optional ? `${baseType}.optional()` : baseType;
}

function toZodBaseType(field: FieldModel): string {
  if (field.typeRef?.kind === 'enum') {
    return `z.enum([${(field.typeRef.values ?? []).map(value => JSON.stringify(value)).join(', ')}])`;
  }

  if (field.typeRef?.kind === 'contract') {
    return `z.lazy(() => ${field.type}Schema)`;
  }

  return zodTypeMap[field.type] ?? 'z.unknown()';
}

function toZodDefault(field: FieldModel): string {
  if (!field.default) return 'undefined';
  if (field.default.kind === 'string') return JSON.stringify(field.default.value);
  if (field.default.kind === 'number' || field.default.kind === 'boolean') return String(field.default.value);
  return JSON.stringify(String(field.default.value));
}

function renderZodRefinement(invariant: InvariantModel): string {
  const comparisons = invariant.comparisons ?? [];
  const expression = comparisons.map(comparison => renderInvariantComparison(comparison)).join(' ');
  const message = comparisons.map(comparison => `${comparison.logicalOperator ? `${comparison.logicalOperator} ` : ''}${humanizeInvariantComparison(comparison)}`).join(' ');
  return `.refine(data => ${expression}, { message: ${JSON.stringify(message)} })`;
}

function renderInvariantComparison(comparison: InvariantComparisonModel): string {
  const logicalPrefix = comparison.logicalOperator ? `${comparison.logicalOperator} ` : '';
  const operator = comparison.operator === '==' ? '===' : comparison.operator === '!=' ? '!==' : comparison.operator;
  return `${logicalPrefix}${renderInvariantOperand(comparison.left)} ${operator} ${renderInvariantOperand(comparison.right)}`;
}

function humanizeInvariantComparison(comparison: InvariantComparisonModel): string {
  const operatorText: Record<string, string> = {
    '>': 'must be greater than',
    '>=': 'must be greater than or equal to',
    '<': 'must be less than',
    '<=': 'must be less than or equal to',
    '==': 'must equal',
    '!=': 'must not equal'
  };
  const text = operatorText[comparison.operator] ?? comparison.operator;
  return `${comparison.left.raw} ${text} ${comparison.right.raw}`;
}

function renderInvariantOperand(operand: InvariantComparisonModel['left']): string {
  if (operand.kind === 'expression') {
    return `(${(operand.terms ?? []).map(part => `${part.operator ? `${part.operator} ` : ''}${renderInvariantOperand(part.operand)}`).join(' ')})`;
  }
  if (operand.kind === 'field') {
    return `data.${operand.field}`;
  }
  if (operand.literal?.kind === 'string') return JSON.stringify(operand.literal.value);
  if (operand.literal?.kind === 'number' || operand.literal?.kind === 'boolean') return String(operand.literal.value);
  return JSON.stringify(operand.raw);
}
