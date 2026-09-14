import type { FieldModel } from '@forge/language';
import { mapForgeTypeToTs } from '../mapper.js';

export function renderController(
  className: string,
  kebabPlural: string,
  pascalPlural: string,
  camelPlural: string,
  primaryField: FieldModel
): string {
  const kebabSingular = className.toLowerCase();
  const primaryName = primaryField.name;
  const primaryTsType = mapForgeTypeToTs(primaryField.type);
  const routeParamType = primaryTsType === 'number' ? 'number' : 'string';
  const routeParamValue = routeParamType === 'number' ? `Number(${primaryName})` : primaryName;

  return `import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ${pascalPlural}Service } from './${kebabPlural}.service';
import { Create${className}Dto } from './dto/create-${kebabSingular}.dto';
import { Update${className}Dto } from './dto/update-${kebabSingular}.dto';
import { ${className}Dto } from './dto/${kebabSingular}.dto';
import { Create${className}Schema, Update${className}Schema } from './dto/${kebabSingular}.schema';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';

@Controller('${kebabPlural}')
export class ${pascalPlural}Controller {
  constructor(private readonly ${camelPlural}Service: ${pascalPlural}Service) {}

  @Get()
  findAll(): Promise<${className}Dto[]> {
    return this.${camelPlural}Service.findAll();
  }

  @Get(':${primaryName}')
  findOne(@Param('${primaryName}') ${primaryName}: string): Promise<${className}Dto> {
    return this.${camelPlural}Service.findOne(${routeParamValue});
  }

  @Post()
  create(@Body(new ZodValidationPipe(Create${className}Schema)) dto: Create${className}Dto): Promise<${className}Dto> {
    return this.${camelPlural}Service.create(dto);
  }

  @Put(':${primaryName}')
  update(@Param('${primaryName}') ${primaryName}: string, @Body(new ZodValidationPipe(Update${className}Schema)) dto: Update${className}Dto): Promise<${className}Dto> {
    return this.${camelPlural}Service.update(${routeParamValue}, dto);
  }

  @Delete(':${primaryName}')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('${primaryName}') ${primaryName}: string): Promise<void> {
    return this.${camelPlural}Service.delete(${routeParamValue});
  }
}
`;
}
