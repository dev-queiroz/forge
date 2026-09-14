import type { FieldModel } from '@forge/language';
import { mapForgeTypeToTs } from '../mapper.js';

export function renderService(
  className: string,
  kebabPlural: string,
  pascalPlural: string,
  camelPlural: string,
  primaryField: FieldModel,
  fields: FieldModel[]
): string {
  const kebabSingular = className.toLowerCase();
  const prismaModel = className.charAt(0).toLowerCase() + className.slice(1);
  const primaryName = primaryField.name;
  const primaryTsType = mapForgeTypeToTs(primaryField.type);
  const routeParamType = primaryTsType === 'number' ? 'number' : 'string';
  const whereClause = `{ ${primaryName} }`;
  const relationQueryOptions = renderRelationQueryOptions(fields);

  return `import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Create${className}Dto } from './dto/create-${kebabSingular}.dto';
import { Update${className}Dto } from './dto/update-${kebabSingular}.dto';
import { ${className}Dto } from './dto/${kebabSingular}.dto';

@Injectable()
export class ${pascalPlural}Service {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<${className}Dto[]> {
    return this.prisma.${prismaModel}.findMany(${relationQueryOptions});
  }

  async findOne(${primaryName}: ${routeParamType}): Promise<${className}Dto> {
    const item = await this.prisma.${prismaModel}.findUnique({ where: ${whereClause}${renderRelationQuerySuffix(fields)} });
    if (!item) {
      throw new NotFoundException(\`${className} with ${primaryName} \${${primaryName}} not found\`);
    }
    return item;
  }

  async create(dto: Create${className}Dto): Promise<${className}Dto> {
    return this.prisma.${prismaModel}.create({ data: dto${renderRelationQuerySuffix(fields)} });
  }

  async update(${primaryName}: ${routeParamType}, dto: Update${className}Dto): Promise<${className}Dto> {
    await this.ensureExists(${primaryName});
    return this.prisma.${prismaModel}.update({ where: ${whereClause}, data: dto${renderRelationQuerySuffix(fields)} });
  }

  async delete(${primaryName}: ${routeParamType}): Promise<void> {
    await this.ensureExists(${primaryName});
    await this.prisma.${prismaModel}.delete({ where: ${whereClause} });
  }

  private async ensureExists(${primaryName}: ${routeParamType}): Promise<void> {
    const item = await this.prisma.${prismaModel}.findUnique({ where: ${whereClause} });
    if (!item) {
      throw new NotFoundException(\`${className} with ${primaryName} \${${primaryName}} not found\`);
    }
  }
}
`;
}

function renderRelationQueryOptions(fields: FieldModel[]): string {
  const include = renderRelationInclude(fields);
  return include ? `{ include: ${include} }` : '';
}

function renderRelationQuerySuffix(fields: FieldModel[]): string {
  const include = renderRelationInclude(fields);
  return include ? `, include: ${include}` : '';
}

function renderRelationInclude(fields: FieldModel[]): string {
  const relationFields = fields.filter(field => field.typeRef?.kind === 'contract');
  if (relationFields.length === 0) {
    return '';
  }

  return `{ ${relationFields.map(field => `${field.name}: true`).join(', ')} }`;
}
