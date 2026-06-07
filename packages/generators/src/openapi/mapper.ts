import type { FieldModel } from '@forge/language';

export interface OpenApiProperty {
  type: string;
  format?: string;
}

export function mapFieldTypeToOpenApi(type: string): OpenApiProperty {
  switch (type) {
    case 'string':
      return { type: 'string' };
    case 'int':
      return { type: 'integer' };
    case 'float':
    case 'decimal':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'uuid':
      return { type: 'string', format: 'uuid' };
    case 'date':
      return { type: 'string', format: 'date' };
    case 'datetime':
      return { type: 'string', format: 'date-time' };
    default:
      return { type: 'string' };
  }
}
