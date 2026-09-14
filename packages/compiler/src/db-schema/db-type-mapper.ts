import type { DatabaseFieldType } from './db-schema.model.js';

export function mapForgeTypeToDB(type: string): DatabaseFieldType {
  const validTypes: Record<string, DatabaseFieldType> = {
    string: 'string',
    int: 'int',
    float: 'float',
    decimal: 'decimal',
    boolean: 'boolean',
    uuid: 'uuid',
    datetime: 'datetime',
    date: 'date',
    bytes: 'bytes',
    json: 'json'
  };

  const mapped = validTypes[type];
  if (!mapped) {
    throw new Error(`Unknown Forge type: '${type}'`);
  }
  return mapped;
}
