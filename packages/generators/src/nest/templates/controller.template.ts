export function renderController(
  className: string,
  kebabPlural: string,
  pascalPlural: string,
  camelPlural: string
): string {
  const kebabSingular = className.toLowerCase();

  return `import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ${pascalPlural}Service } from './${kebabPlural}.service';
import { Create${className}Dto } from './dto/create-${kebabSingular}.dto';
import { Update${className}Dto } from './dto/update-${kebabSingular}.dto';
import { ${className}Dto } from './dto/${kebabSingular}.dto';

@Controller('${kebabPlural}')
export class ${pascalPlural}Controller {
  constructor(private readonly ${camelPlural}Service: ${pascalPlural}Service) {}

  @Get()
  findAll(): ${className}Dto[] {
    return this.${camelPlural}Service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): ${className}Dto {
    return this.${camelPlural}Service.findOne(id);
  }

  @Post()
  create(@Body() dto: Create${className}Dto): ${className}Dto {
    return this.${camelPlural}Service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Update${className}Dto): ${className}Dto {
    return this.${camelPlural}Service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string): void {
    this.${camelPlural}Service.delete(id);
  }
}
`;
}
