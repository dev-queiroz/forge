export type DatabaseFieldType =
  | 'string'
  | 'int'
  | 'float'
  | 'decimal'
  | 'boolean'
  | 'uuid'
  | 'datetime'
  | 'date';

export interface DatabaseField {
  name: string;
  type: DatabaseFieldType;
  isPrimary?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
}

export interface DatabaseTable {
  name: string;
  namespace: string;
  fields: DatabaseField[];
}

export interface DatabaseSchema {
  tables: DatabaseTable[];
}
