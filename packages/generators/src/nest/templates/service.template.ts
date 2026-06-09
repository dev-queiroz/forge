export function renderService(
  className: string,
  kebabPlural: string,
  pascalPlural: string,
  camelPlural: string
): string {
  const kebabSingular = className.toLowerCase();

  return `import { Injectable, NotFoundException } from '@nestjs/common';
import { Create${className}Dto } from './dto/create-${kebabSingular}.dto';
import { Update${className}Dto } from './dto/update-${kebabSingular}.dto';
import { ${className}Dto } from './dto/${kebabSingular}.dto';

@Injectable()
export class ${pascalPlural}Service {
  private readonly ${camelPlural}: ${className}Dto[] = [];

  findAll(): ${className}Dto[] {
    return this.${camelPlural};
  }

  findOne(id: string): ${className}Dto {
    const item = this.${camelPlural}.find(i => (i as any).id === id);
    if (!item) {
      throw new NotFoundException(\`${className} with ID \${id} not found\`);
    }
    return item;
  }

  create(dto: Create${className}Dto): ${className}Dto {
    const newItem = {
      id: Math.random().toString(36).substring(2, 9),
      ...dto,
    } as unknown as ${className}Dto;
    this.${camelPlural}.push(newItem);
    return newItem;
  }

  update(id: string, dto: Update${className}Dto): ${className}Dto {
    const index = this.${camelPlural}.findIndex(i => (i as any).id === id);
    if (index === -1) {
      throw new NotFoundException(\`${className} with ID \${id} not found\`);
    }
    const updated = {
      ...this.${camelPlural}[index],
      ...dto,
    };
    this.${camelPlural}[index] = updated;
    return updated;
  }

  delete(id: string): void {
    const index = this.${camelPlural}.findIndex(i => (i as any).id === id);
    if (index === -1) {
      throw new NotFoundException(\`${className} with ID \${id} not found\`);
    }
    this.${camelPlural}.splice(index, 1);
  }
}
`;
}
