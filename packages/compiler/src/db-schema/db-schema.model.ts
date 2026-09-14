export type DatabaseFieldType =
  | 'string'
  | 'int'
  | 'float'
  | 'decimal'
  | 'boolean'
  | 'uuid'
  | 'datetime'
  | 'date'
  | 'bytes'
  | 'json'
  | 'enum'
  | 'relation';

export interface DatabaseField {
  name: string;
  type: DatabaseFieldType;
  typeName?: string;
  isPrimary?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  isArray?: boolean;
  isIndexed?: boolean;
  default?: string;
  relation?: DatabaseRelation;
}

export interface DatabaseRelation {
  targetModel: string;
  fields?: string[];
  references?: string[];
}

export interface DatabaseTable {
  name: string;
  namespace: string;
  fields: DatabaseField[];
  indexes?: string[];
}

export interface DatabaseEnum {
  name: string;
  namespace: string;
  values: string[];
}

export interface DatabaseSchema {
  tables: DatabaseTable[];
  enums: DatabaseEnum[];
}
