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
    const pathName = `/${name.toLowerCase()}`;
    const pathNameWithId = `/${name.toLowerCase()}/{id}`;

    // 1. Schemas
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const field of contract.fields) {
      properties[field.name] = mapFieldTypeToOpenApi(field.type);
      if (!field.optional) {
        required.push(field.name);
      }
    }

    openApiDoc.components.schemas[name] = {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {})
    };

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
                $ref: `#/components/schemas/${name}`
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
        summary: `Get a ${name} by ID`,
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
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
      }
    };
  }

  return JSON.stringify(openApiDoc, null, 2) + '\n';
}
