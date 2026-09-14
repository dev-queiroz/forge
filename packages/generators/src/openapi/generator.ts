import type { SemanticModel, ContractModel } from '@forge/language';
import { mapFieldTypeToOpenApi } from './mapper.js';

export function generateOpenApi(model: SemanticModel): string {
  const openApiDoc: any = {
    openapi: '3.0.3',
    info: {
      title: 'Forge API',
      version: '1.0.0'
    },
    paths: {},
    components: {
      schemas: {}
    }
  };

  for (const contract of model.contracts) {
    const name = contract.name;
    const primaryField = getPrimaryField(contract);
    const primaryName = primaryField.name;
    const primaryParameter = renderPrimaryParameter(primaryField, model);
    const pathName = `/${name.toLowerCase()}`;
    const pathNameWithId = `/${name.toLowerCase()}/{${primaryName}}`;

    // 1. Schemas
    openApiDoc.components.schemas[name] = renderObjectSchema(contract.fields, model, { invariants: contract.invariants.map(invariant => invariant.expression) });
    openApiDoc.components.schemas[`Create${name}Input`] = renderObjectSchema(
      contract.fields.filter(isWritableInputField),
      model,
      { defaultsOptional: true }
    );
    openApiDoc.components.schemas[`Update${name}Input`] = renderObjectSchema(
      contract.fields.filter(isWritableInputField),
      model,
      { allOptional: true }
    );

    // 2. Paths
    openApiDoc.paths[pathName] = {
      get: {
        summary: `Get all ${name} entities`,
        responses: {
          '200': {
            description: `A list of ${name} entities`,
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: `#/components/schemas/${name}`
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: `Create a ${name} entity`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: `#/components/schemas/Create${name}Input`
              }
            }
          }
        },
        responses: {
          '201': {
            description: `${name} created successfully`,
            content: {
              'application/json': {
                schema: {
                  $ref: `#/components/schemas/${name}`
                }
              }
            }
          }
        }
      }
    };

    openApiDoc.paths[pathNameWithId] = {
      get: {
        summary: `Get a ${name} by ${primaryName}`,
        parameters: [primaryParameter],
        responses: {
          '200': {
            description: `${name} found`,
            content: {
              'application/json': {
                schema: {
                  $ref: `#/components/schemas/${name}`
                }
              }
            }
          },
          '404': {
            description: `${name} not found`
          }
        }
      },
      put: {
        summary: `Update a ${name} by ${primaryName}`,
        parameters: [primaryParameter],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: `#/components/schemas/Update${name}Input`
              }
            }
          }
        },
        responses: {
          '200': {
            description: `${name} updated successfully`,
            content: {
              'application/json': {
                schema: {
                  $ref: `#/components/schemas/${name}`
                }
              }
            }
          },
          '404': {
            description: `${name} not found`
          }
        }
      },
      delete: {
        summary: `Delete a ${name} by ${primaryName}`,
        parameters: [primaryParameter],
        responses: {
          '204': {
            description: `${name} deleted successfully`
          },
          '404': {
            description: `${name} not found`
          }
        }
      }
    };
  }

  return JSON.stringify(openApiDoc, null, 2) + '\n';
}

function isWritableInputField(field: ContractModel['fields'][number]): boolean {
  if (field.readonly || field.typeRef?.kind === 'contract') {
    return false;
  }

  if (field.primary) {
    return !field.default && field.name !== 'id';
  }

  return field.name !== 'id';
}

function getPrimaryField(contract: ContractModel): ContractModel['fields'][number] {
  return contract.fields.find(field => field.primary)
    ?? contract.fields.find(field => field.name === 'id')
    ?? contract.fields[0];
}

function renderPrimaryParameter(field: ContractModel['fields'][number], model: SemanticModel): object {
  return {
    name: field.name,
    in: 'path',
    required: true,
    schema: mapFieldToOpenApi(field, model)
  };
}

function renderObjectSchema(
  fields: ContractModel['fields'],
  model: SemanticModel,
  options: { allOptional?: boolean; defaultsOptional?: boolean; invariants?: string[] } = {}
): object {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const field of fields) {
    properties[field.name] = mapFieldToOpenApi(field, model);
    if (!options.allOptional && !field.optional && !(options.defaultsOptional && field.default)) {
      required.push(field.name);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    ...(options.invariants?.length ? { 'x-forge-invariants': options.invariants } : {})
  };
}

function mapFieldToOpenApi(field: ContractModel['fields'][number], model: SemanticModel): object {
  let property: object;

  if (field.typeRef?.kind === 'enum') {
    const enumModel = (model.enums ?? []).find(item => item.name === field.type);
    property = {
      type: 'string',
      ...(enumModel ? { enum: enumModel.values.map(value => value.value ?? value.name) } : {})
    };
  } else if (field.typeRef?.kind === 'contract') {
    property = { $ref: `#/components/schemas/${field.type}` };
  } else {
    property = mapFieldTypeToOpenApi(field.type);
  }

  if (field.isArray) {
    return { type: 'array', items: property };
  }

  return property;
}
