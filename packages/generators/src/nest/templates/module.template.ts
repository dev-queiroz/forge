export function renderModule(className: string, kebabPlural: string, pascalPlural: string): string {
  return `import { Module } from '@nestjs/common';
import { ${pascalPlural}Controller } from './${kebabPlural}.controller';
import { ${pascalPlural}Service } from './${kebabPlural}.service';

@Module({
  controllers: [${pascalPlural}Controller],
  providers: [${pascalPlural}Service],
})
export class ${pascalPlural}Module {}
`;
}
