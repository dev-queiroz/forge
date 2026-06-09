import type { SemanticModel } from '@forge/language';
import { renderModule } from './templates/module.template.js';
import { renderController } from './templates/controller.template.js';
import { renderService } from './templates/service.template.js';
import { renderUserDto, renderCreateDto, renderUpdateDto } from './templates/dto.template.js';

export interface GeneratedFile {
  path: string;
  content: string;
}

export function generateNest(model: SemanticModel): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Grouped by contract, let's prepare plural forms, etc.
  const contractInfo = model.contracts.map(contract => {
    const name = contract.name;
    const kebabSingular = name.toLowerCase();
    
    // Simple pluralization logic
    const kebabPlural = kebabSingular.endsWith('s') ? kebabSingular : `${kebabSingular}s`;
    const pascalPlural = kebabPlural.charAt(0).toUpperCase() + kebabPlural.slice(1);
    const camelPlural = kebabPlural;

    return {
      contract,
      name,
      kebabSingular,
      kebabPlural,
      pascalPlural,
      camelPlural
    };
  });

  // 1. Generate code for each contract
  for (const info of contractInfo) {
    const { contract, name, kebabSingular, kebabPlural, pascalPlural, camelPlural } = info;
    const dir = `src/${kebabPlural}`;

    // Module
    files.push({
      path: `${dir}/${kebabPlural}.module.ts`,
      content: renderModule(name, kebabPlural, pascalPlural)
    });

    // Controller
    files.push({
      path: `${dir}/${kebabPlural}.controller.ts`,
      content: renderController(name, kebabPlural, pascalPlural, camelPlural)
    });

    // Service
    files.push({
      path: `${dir}/${kebabPlural}.service.ts`,
      content: renderService(name, kebabPlural, pascalPlural, camelPlural)
    });

    // DTOs
    files.push({
      path: `${dir}/dto/${kebabSingular}.dto.ts`,
      content: renderUserDto(name, contract.fields)
    });

    files.push({
      path: `${dir}/dto/create-${kebabSingular}.dto.ts`,
      content: renderCreateDto(name, contract.fields)
    });

    files.push({
      path: `${dir}/dto/update-${kebabSingular}.dto.ts`,
      content: renderUpdateDto(name)
    });
  }

  // 2. Generate root app.module.ts
  const importsStr = contractInfo
    .map(info => `import { ${info.pascalPlural}Module } from './${info.kebabPlural}/${info.kebabPlural}.module';`)
    .join('\n');
  const modulesList = contractInfo.map(info => `${info.pascalPlural}Module`).join(', ');

  const appModuleContent = `import { Module } from '@nestjs/common';
${importsStr}

@Module({
  imports: [${modulesList}],
})
export class AppModule {}
`;

  files.push({
    path: 'src/app.module.ts',
    content: appModuleContent
  });

  // 3. Generate root main.ts
  const mainContent = `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
`;

  files.push({
    path: 'src/main.ts',
    content: mainContent
  });

  // 4. Generate tsconfig.json
  const tsconfigContent = `{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "es2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false
  }
}
`;

  files.push({
    path: 'tsconfig.json',
    content: tsconfigContent
  });

  // 5. Generate package.json
  const packageContent = `{
  "name": "forge-nestjs-backend",
  "version": "0.0.1",
  "description": "Generated NestJS backend from Forge contract definition",
  "private": true,
  "license": "UNLICENSED",
  "scripts": {
    "build": "nest build",
    "start": "nest start"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/mapped-types": "*",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@nestjs/schematics": "^10.0.0",
    "@types/node": "^20.3.1",
    "typescript": "^5.1.3"
  }
}
`;

  files.push({
    path: 'package.json',
    content: packageContent
  });

  return files;
}
