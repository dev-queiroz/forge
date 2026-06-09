import type { SemanticModel, ContractModel, FieldModel } from '@forge/language';
import type { DatabaseSchema, DatabaseField, DatabaseTable } from './db-schema.model.js';
import { mapForgeTypeToDB } from './db-type-mapper.js';

export class DatabaseSchemaBuilder {
  build(model: SemanticModel): DatabaseSchema {
    const tables = model.contracts.map(contract => this.buildTable(contract));
    return { tables };
  }

  private buildTable(contract: ContractModel): DatabaseTable {
    return {
      name: contract.name,
      namespace: contract.namespace,
      fields: this.buildFields(contract.fields)
    };
  }

  private buildFields(fields: FieldModel[]): DatabaseField[] {
    return fields.map(field => this.buildField(field));
  }

  private buildField(field: FieldModel): DatabaseField {
    const isIdField = field.name === 'id';
    return {
      name: field.name,
      type: mapForgeTypeToDB(field.type),
      isPrimary: isIdField,
      isNullable: field.optional,
      isUnique: isIdField
    };
  }
}
