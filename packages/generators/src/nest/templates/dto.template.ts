import type { FieldModel } from '@forge/language';
import { mapForgeTypeToTs } from '../mapper.js';

export function renderUserDto(className: string, fields: FieldModel[]): string {
  const imports = renderDtoImports(className, fields, 'output');
  const renderedFields = fields
    .map(field => renderField(field, 'output'))
    .join('\n');
  return `${imports}${imports ? '\n' : ''}export class ${className}Dto {
${renderedFields}
}
`;
}

export function renderCreateDto(className: string, fields: FieldModel[]): string {
  const imports = renderDtoImports(className, fields, 'input');
  const renderedFields = fields
    .filter(isWritableInputField)
    .map(field => renderField(field, 'input'))
    .join('\n');
  return `${imports}${imports ? '\n' : ''}export class Create${className}Dto {
${renderedFields}
}
`;
}

export function renderUpdateDto(className: string): string {
  const kebabSingular = className.toLowerCase();
  return `import { PartialType } from '@nestjs/mapped-types';
import { Create${className}Dto } from './create-${kebabSingular}.dto';

export class Update${className}Dto extends PartialType(Create${className}Dto) {}
`;
}

type DtoMode = 'input' | 'output';

function renderField(field: FieldModel, mode: DtoMode): string {
  const baseType = toDtoType(field, mode);
  const nullableType = shouldAllowNull(field, mode) ? `${baseType} | null` : baseType;
  const type = field.isArray ? `${baseType}[]` : nullableType;
  return `  ${field.name}${field.optional ? '?' : ''}: ${type};`;
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

function toDtoType(field: FieldModel, mode: DtoMode): string {
  if (field.typeRef?.kind === 'contract') {
    return `${field.type}Dto`;
  }

  if (field.typeRef?.kind === 'enum') {
    return (field.typeRef.values ?? []).map(value => JSON.stringify(value)).join(' | ') || 'string';
  }

  if (field.type === 'decimal') {
    return mode === 'input' ? 'Prisma.Decimal | number | string' : 'Prisma.Decimal';
  }

  if (field.type === 'json') {
    return mode === 'input' ? 'Prisma.InputJsonValue' : 'Prisma.JsonValue';
  }

  return mapForgeTypeToTs(field.type);
}

function renderDtoImports(className: string, fields: FieldModel[], mode: DtoMode): string {
  const dtoImports = Array.from(new Set(fields
    .filter(field => field.typeRef?.kind === 'contract' && field.type !== className)
    .map(field => field.type)
  )).sort((left, right) => left.localeCompare(right));

  const imports = dtoImports
    .map(name => `import type { ${name}Dto } from '../../${pluralize(name)}/dto/${name.toLowerCase()}.dto';`)
    .join('\n')
    .split('\n')
    .filter(Boolean);

  if (fields.some(field => usesPrismaNamespace(field, mode))) {
    imports.unshift("import type { Prisma } from '@prisma/client';");
  }

  return imports.join('\n');
}

function pluralize(name: string): string {
  const value = name.toLowerCase();
  return value.endsWith('s') ? value : `${value}s`;
}

function usesPrismaNamespace(field: FieldModel, mode: DtoMode): boolean {
  if (field.type === 'decimal' || field.type === 'json') {
    return true;
  }

  return mode === 'input' && field.type === 'json';
}

function shouldAllowNull(field: FieldModel, mode: DtoMode): boolean {
  if (!field.optional || field.isArray) {
    return false;
  }

  return mode === 'output' || field.type !== 'json';
}
