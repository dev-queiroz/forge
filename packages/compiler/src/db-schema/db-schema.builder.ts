import type { SemanticModel, ContractModel, FieldModel } from '@forge/language';
import type { DatabaseSchema, DatabaseField, DatabaseTable, DatabaseEnum } from './db-schema.model.js';
import { mapForgeTypeToDB } from './db-type-mapper.js';

export class DatabaseSchemaBuilder {
  build(model: SemanticModel): DatabaseSchema {
    const tables = model.contracts.map(contract => this.buildTable(contract));
    const enums = (model.enums ?? []).map<DatabaseEnum>(item => ({
      name: item.name,
      namespace: item.namespace,
      values: item.values.map(value => value.name)
    }));
    return { tables, enums };
  }

  private buildTable(contract: ContractModel): DatabaseTable {
    const fields = this.buildFields(contract.fields);
    return {
      name: contract.name,
      namespace: contract.namespace,
      fields,
      indexes: fields.filter(field => field.isIndexed && !field.isUnique && !field.isPrimary).map(field => field.name)
    };
  }

  private buildFields(fields: FieldModel[]): DatabaseField[] {
    return fields.map(field => this.buildField(field));
  }

  private buildField(field: FieldModel): DatabaseField {
    const isPrimary = field.primary;
    if (field.typeRef?.kind === 'contract') {
      return {
        name: field.name,
        type: 'relation',
        typeName: field.typeRef.name,
        isNullable: field.optional,
        isArray: field.isArray,
        relation: field.foreign
          ? {
              targetModel: field.typeRef.name,
              fields: field.foreign.field ? [field.foreign.field] : undefined,
              references: field.foreign.targetField ? [field.foreign.targetField] : undefined
            }
          : { targetModel: field.typeRef.name }
      };
    }

    if (field.typeRef?.kind === 'enum') {
      return {
        name: field.name,
        type: 'enum',
        typeName: field.typeRef.name,
        isNullable: field.optional,
        isArray: field.isArray,
        isUnique: field.unique,
        isIndexed: field.indexed,
        default: field.default?.raw
      };
    }

    return {
      name: field.name,
      type: mapForgeTypeToDB(field.type),
      typeName: field.type,
      isPrimary,
      isNullable: field.optional,
      isUnique: field.unique || isPrimary,
      isArray: field.isArray,
      isIndexed: field.indexed,
      default: field.default?.raw
    };
  }
}
