import type { FieldModel } from '@forge/language';
import { mapForgeTypeToTs } from '../mapper.js';

export function renderUserDto(className: string, fields: FieldModel[]): string {
  const renderedFields = fields
    .map(f => `  ${f.name}${f.optional ? '?' : ''}: ${mapForgeTypeToTs(f.type)};`)
    .join('\n');
  return `export class ${className}Dto {
${renderedFields}
}
`;
}

export function renderCreateDto(className: string, fields: FieldModel[]): string {
  const renderedFields = fields
    .filter(f => f.name !== 'id')
    .map(f => `  ${f.name}${f.optional ? '?' : ''}: ${mapForgeTypeToTs(f.type)};`)
    .join('\n');
  return `export class Create${className}Dto {
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
