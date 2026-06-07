import type { ContractModel, FieldModel, SemanticModel } from '@forge/language';

const tsTypeMap: Record<string, string> = {
  uuid: 'string',
  string: 'string',
  decimal: 'number',
  float: 'number',
  int: 'number',
  boolean: 'boolean',
  datetime: 'string',
  date: 'string'
};

const jsonSchemaTypeMap: Record<string, string> = {
  uuid: 'string',
  string: 'string',
  datetime: 'string',
  date: 'string',
  boolean: 'boolean',
  int: 'number',
  float: 'number',
  decimal: 'number'
};

const zodTypeMap: Record<string, string> = {
  string: 'z.string()',
  uuid: 'z.string()',
  int: 'z.number().int()',
  float: 'z.number()',
  decimal: 'z.number()',
  boolean: 'z.boolean()',
  datetime: 'z.string()',
  date: 'z.string()'
};

export interface GeneratedFile {
  path: string;
  content: string;
}

export function generateTypeScript(model: SemanticModel): GeneratedFile[] {
  return model.contracts.map(contract => ({
    path: `typescript/${contract.name}.ts`,
    content: renderTypeScriptContract(contract)
  }));
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
  return [...generateTypeScript(model), ...generateJsonSchema(model), ...generateZod(model)];
}

function renderTypeScriptContract(contract: ContractModel): string {
  const fields = contract.fields
    .map(field => `  ${field.name}${field.optional ? '?' : ''}: ${toTypeScriptType(field)};`)
    .join('\n');

  return `export interface ${contract.name} {\n${fields}\n}\n`;
}

function toTypeScriptType(field: FieldModel): string {
  return tsTypeMap[field.type] ?? 'unknown';
}

function toJsonSchema(contract: ContractModel): object {
  const properties = Object.fromEntries(
    contract.fields.map(field => [
      field.name,
      {
        type: jsonSchemaTypeMap[field.type] ?? 'string'
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

function renderZodContract(contract: ContractModel): string {
  const fields = contract.fields
    .map(field => `  ${field.name}: ${toZodType(field)},`)
    .join('\n');

  return [
    'import { z } from "zod";',
    '',
    `export const ${contract.name}Schema = z.object({`,
    fields,
    '});',
    '',
    `export type ${contract.name} = z.infer<typeof ${contract.name}Schema>;`,
    ''
  ].join('\n');
}

function toZodType(field: FieldModel): string {
  const baseType = zodTypeMap[field.type] ?? 'z.unknown()';
  return field.optional ? `${baseType}.optional()` : baseType;
}
