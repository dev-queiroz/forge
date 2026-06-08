import type { DatabaseFieldType } from '@forge/compiler';

export function mapFieldTypeToPrisma(type: DatabaseFieldType): string {
  const typeMap: Record<DatabaseFieldType, string> = {
    string: 'String',
    int: 'Int',
    float: 'Float',
    decimal: 'Decimal',
    boolean: 'Boolean',
    uuid: 'String',
    datetime: 'DateTime',
    date: 'DateTime'
  };

  return typeMap[type] ?? 'String';
}
