import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { DiagnosticsError, parseForgeFilesToSemanticModel } from '../packages/language/dist/index.js';
import { DatabaseSchemaBuilder } from '../packages/compiler/dist/index.js';
import { generateJsonSchema, generateNest, generateOpenApi, generatePrisma, generateTypeScript, generateZod } from '../packages/generators/generated/index.js';

const requireFromRepo = createRequire(import.meta.url);

describe('Semantic compiler pipeline', () => {
  it('resolves contracts, enums, arrays, defaults and modifiers into one semantic model', async () => {
    const model = await parseForgeFilesToSemanticModel([
      {
        uri: 'file:///contracts/shop.forge',
        source: `namespace shop

enum OrderStatus {
  pending
  paid
}

contract User {
  id: uuid @primary @default(uuid())
  email: string @unique @index
  orders: Order[]
}

contract Order {
  id: uuid @primary
  userId: uuid
  user: User @foreign(userId)
  status: OrderStatus @default(pending)
  total: decimal

  invariant total > 0
}
`
      }
    ]);

    const order = model.contracts.find(contract => contract.name === 'Order');
    const user = model.contracts.find(contract => contract.name === 'User');
    assert.equal(user?.fields.find(field => field.name === 'id')?.primary, true);
    assert.ok(order);
    assert.equal(order.fields.find(field => field.name === 'status')?.typeRef?.kind, 'enum');
    assert.deepEqual(order.fields.find(field => field.name === 'status')?.typeRef?.values, ['pending', 'paid']);
    assert.equal(order.fields.find(field => field.name === 'user')?.typeRef?.kind, 'contract');
    assert.deepEqual(order.fields.find(field => field.name === 'user')?.foreign?.field, 'userId');
    assert.deepEqual(order.fields.find(field => field.name === 'user')?.foreign?.targetField, 'id');
    assert.equal(order.fields.find(field => field.name === 'id')?.primary, true);
    assert.equal(order.invariants[0].comparisons?.[0].left.field, 'total');

    const prisma = generatePrisma(new DatabaseSchemaBuilder().build(model))[0].content;
    assert.match(prisma, /orders Order\[\] @relation\("Order_user"\)/);
    assert.match(prisma, /user User @relation\("Order_user", fields: \[userId\], references: \[id\]\)/);

    const userTs = generateTypeScript(model).find(file => file.path === 'typescript/User.ts')?.content;
    assert.match(userTs ?? '', /import type \{ Order \} from '\.\/Order';/);
    assert.match(userTs ?? '', /orders: Order\[\];/);

    const nestFiles = generateNest(model);
    const orderDto = nestFiles.find(file => file.path === 'src/orders/dto/order.dto.ts')?.content;
    const createOrderDto = nestFiles.find(file => file.path === 'src/orders/dto/create-order.dto.ts')?.content;
    assert.match(orderDto ?? '', /import type \{ UserDto \} from '\.\.\/\.\.\/users\/dto\/user\.dto';/);
    assert.match(orderDto ?? '', /user: UserDto;/);
    assert.doesNotMatch(createOrderDto ?? '', /user: UserDto;/);

    const openApi = JSON.parse(generateOpenApi(model));
    assert.ok(!('user' in openApi.components.schemas.CreateOrderInput.properties));
    assert.ok('userId' in openApi.components.schemas.CreateOrderInput.properties);
  });

  it('generates consistent Zod, OpenAPI and Prisma artifacts from semantic enums and invariants', async () => {
    const model = await parseForgeFilesToSemanticModel([
      {
        uri: 'file:///contracts/product.forge',
        source: `enum ProductStatus {
  draft
  active
}

contract Product {
  id: uuid @primary
  status: ProductStatus @default(active)
  name: string
  price: decimal

  invariant price > 0
}
`
      }
    ]);

    const [zodFile] = generateZod(model);
    assert.match(zodFile.content, /status: z\.enum\(\["draft", "active"\]\)\.default\("active"\),/);
    assert.match(zodFile.content, /\.refine\(data => data\.price > 0/);

    const openApi = JSON.parse(generateOpenApi(model));
    assert.deepEqual(openApi.components.schemas.Product.properties.status.enum, ['draft', 'active']);
    assert.deepEqual(openApi.components.schemas.Product['x-forge-invariants'], ['price > 0']);

    const jsonSchema = JSON.parse(generateJsonSchema(model)[0].content);
    assert.deepEqual(jsonSchema.properties.status.enum, ['draft', 'active']);
    assert.equal(jsonSchema.properties.status.default, 'active');

    const prisma = generatePrisma(new DatabaseSchemaBuilder().build(model))[0].content;
    assert.match(prisma, /enum ProductStatus/);
    assert.match(prisma, /status ProductStatus @default\(active\)/);
    assert.match(prisma, /id String @id/);
  });

  it('emits arithmetic invariants as executable Zod refinements', async () => {
    const model = await parseForgeFilesToSemanticModel([
      {
        uri: 'file:///contracts/product.forge',
        source: `contract Product {
  id: uuid @primary
  price: decimal
  stock: int

  invariant price * stock > 100
}
`
      }
    ]);

    const product = model.contracts[0];
    const comparison = product.invariants[0].comparisons?.[0];
    assert.equal(comparison?.left.kind, 'expression');
    assert.equal(comparison?.left.raw, 'price * stock');

    const [zodFile] = generateZod(model);
    assert.match(zodFile.content, /\.refine\(data => \(data\.price \* data\.stock\) > 100/);
    assert.match(zodFile.content, /price \* stock must be greater than 100/);

    const { ProductSchema } = executeGeneratedZod(zodFile.content);
    assert.equal(ProductSchema.safeParse({ id: 'p1', price: 11, stock: 10 }).success, true);
    const invalid = ProductSchema.safeParse({ id: 'p1', price: 5, stock: 10 });
    assert.equal(invalid.success, false);
    assert.equal(invalid.error.issues[0].message, 'price * stock must be greater than 100');
  });

  it('emits logical invariants as one executable Zod refinement', async () => {
    const model = await parseForgeFilesToSemanticModel([
      {
        uri: 'file:///contracts/product.forge',
        source: `contract Product {
  id: uuid @primary
  name: string
  price: decimal
  stock: int
  discontinued: boolean

  invariant name != ""
  invariant price > 0 && stock >= 0
  invariant discontinued == true || stock > 0
}
`
      }
    ]);

    const [zodFile] = generateZod(model);
    assert.match(zodFile.content, /data\.name !== ""/);
    assert.match(zodFile.content, /data\.price > 0 && data\.stock >= 0/);
    assert.match(zodFile.content, /data\.discontinued === true \|\| data\.stock > 0/);

    const { ProductSchema } = executeGeneratedZod(zodFile.content);
    assert.equal(ProductSchema.safeParse({ id: 'p1', name: 'Sprocket', price: 1, stock: 0, discontinued: true }).success, true);
    assert.equal(ProductSchema.safeParse({ id: 'p1', name: 'Sprocket', price: 1, stock: 3, discontinued: false }).success, true);
    assert.equal(ProductSchema.safeParse({ id: 'p1', name: 'Sprocket', price: 1, stock: 0, discontinued: false }).success, false);
    assert.equal(ProductSchema.safeParse({ id: 'p1', name: 'Sprocket', price: 1, stock: -1, discontinued: true }).success, false);
    assert.equal(ProductSchema.safeParse({ id: 'p1', name: '', price: 1, stock: 3, discontinued: false }).success, false);
  });

  it('rejects incompatible invariant comparison types', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/product.forge',
          source: `contract Product {
  name: string

  invariant name > 0
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_SEMANTIC_010');
        assert.match(error.diagnostics[0].message, /incompatible types/);
        return true;
      }
    );
  });

  it('rejects non-numeric operands inside arithmetic invariants', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/product.forge',
          source: `contract Product {
  active: boolean

  invariant active + 1 > 2
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_SEMANTIC_010');
        assert.match(error.diagnostics[0].message, /non-numeric operand 'active'/);
        return true;
      }
    );
  });

  it('rejects ordered comparisons against enum fields', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/product.forge',
          source: `enum ProductStatus {
  draft
  active
}

contract Product {
  status: ProductStatus

  invariant status > 0
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_SEMANTIC_010');
        assert.match(error.diagnostics[0].message, /status' \(string\) > '0' \(number\)/);
        return true;
      }
    );
  });

  it('validates field references inside arithmetic invariants', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/product.forge',
          source: `contract Product {
  price: decimal

  invariant price * stock > 100
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_SEMANTIC_004');
        assert.match(error.diagnostics[0].message, /Unknown field 'stock'/);
        return true;
      }
    );
  });

  it('maps bytes, json and arrays consistently across generators', async () => {
    const model = await parseForgeFilesToSemanticModel([
      {
        uri: 'file:///contracts/catalog.forge',
        source: `enum ProductStatus {
  draft
  active
}

contract Category {
  id: uuid @primary
  name: string
}

contract Product {
  sku: string @primary
  image: bytes
  attachments: bytes[]
  metadata: json?
  metadataHistory: json[]
  prices: decimal[]
  tags: string[]
  statuses: ProductStatus[]
  createdAt: datetime @default(now()) @readonly
  categoryId: uuid
  category: Category @foreign(categoryId)
}
`
      }
    ]);

    const productTs = generateTypeScript(model).find(file => file.path === 'typescript/Product.ts')?.content ?? '';
    assert.match(productTs, /image: Uint8Array;/);
    assert.match(productTs, /attachments: Uint8Array\[\];/);
    assert.match(productTs, /metadata\?: unknown;/);
    assert.match(productTs, /metadataHistory: unknown\[\];/);
    assert.match(productTs, /prices: number\[\];/);
    assert.match(productTs, /statuses: ProductStatus\[\];/);
    assert.match(productTs, /category: Category;/);

    const zod = generateZod(model).find(file => file.path === 'zod/Product.ts')?.content ?? '';
    assert.match(zod, /import \{ CategorySchema \} from "\.\/Category";/);
    assert.match(zod, /image: z\.instanceof\(Uint8Array\),/);
    assert.match(zod, /attachments: z\.array\(z\.instanceof\(Uint8Array\)\),/);
    assert.match(zod, /metadata: z\.unknown\(\)\.optional\(\),/);
    assert.match(zod, /metadataHistory: z\.array\(z\.unknown\(\)\),/);
    assert.match(zod, /prices: z\.array\(z\.number\(\)\),/);
    assert.match(zod, /statuses: z\.array\(z\.enum\(\["draft", "active"\]\)\),/);
    assert.match(zod, /category: z\.lazy\(\(\) => CategorySchema\),/);

    const jsonSchema = JSON.parse(generateJsonSchema(model).find(file => file.path === 'json-schema/Product.schema.json')?.content ?? '{}');
    assert.deepEqual(jsonSchema.properties.image, { type: 'string', contentEncoding: 'base64' });
    assert.deepEqual(jsonSchema.properties.attachments, { type: 'array', items: { type: 'string', contentEncoding: 'base64' } });
    assert.deepEqual(jsonSchema.properties.metadata, {});
    assert.deepEqual(jsonSchema.properties.metadataHistory, { type: 'array', items: {} });
    assert.deepEqual(jsonSchema.properties.statuses, { type: 'array', items: { type: 'string', enum: ['draft', 'active'] } });
    assert.deepEqual(jsonSchema.properties.category, { $ref: 'Category.schema.json' });

    const prisma = generatePrisma(new DatabaseSchemaBuilder().build(model))[0].content;
    assert.match(prisma, /image Bytes/);
    assert.match(prisma, /attachments Bytes\[\]/);
    assert.match(prisma, /metadata Json\?/);
    assert.match(prisma, /metadataHistory Json\[\]/);
    assert.match(prisma, /prices Decimal\[\]/);
    assert.match(prisma, /statuses ProductStatus\[\]/);

    const openApi = JSON.parse(generateOpenApi(model));
    assert.deepEqual(openApi.components.schemas.Product.properties.image, { type: 'string', format: 'byte' });
    assert.deepEqual(openApi.components.schemas.Product.properties.attachments, { type: 'array', items: { type: 'string', format: 'byte' } });
    assert.deepEqual(openApi.components.schemas.Product.properties.metadata, {});
    assert.deepEqual(openApi.components.schemas.Product.properties.category, { $ref: '#/components/schemas/Category' });

    const nestFiles = generateNest(model);
    const productDto = nestFiles.find(file => file.path === 'src/products/dto/product.dto.ts')?.content ?? '';
    const createProductDto = nestFiles.find(file => file.path === 'src/products/dto/create-product.dto.ts')?.content ?? '';
    const productSchema = nestFiles.find(file => file.path === 'src/products/dto/product.schema.ts')?.content ?? '';
    assert.match(productDto, /image: Buffer;/);
    assert.match(productDto, /attachments: Buffer\[\];/);
    assert.match(productDto, /metadata\?: Prisma\.JsonValue \| null;/);
    assert.match(productDto, /metadataHistory: Prisma\.JsonValue\[\];/);
    assert.match(productDto, /category: CategoryDto;/);
    assert.match(createProductDto, /metadata\?: Prisma\.InputJsonValue;/);
    assert.doesNotMatch(createProductDto, /category: CategoryDto;/);
    assert.doesNotMatch(createProductDto, /createdAt:/);
    assert.match(productSchema, /image: z\.union\(\[z\.instanceof\(Buffer\), z\.string\(\)\.transform/);
    assert.match(productSchema, /metadata: z\.unknown\(\)\.nullable\(\)\.optional\(\)/);
    assert.doesNotMatch(productSchema, /createdAt:/);
  });

  it('rejects unknown modifiers before generation', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/user.forge',
          source: `contract User {
  id: uuid @primary @sortable
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_SEMANTIC_007');
        assert.match(error.diagnostics[0].message, /Unknown modifier '@sortable'/);
        return true;
      }
    );
  });

  it('rejects defaults that do not match the field type', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/payment.forge',
          source: `contract Payment {
  amount: decimal @default("free")
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_SEMANTIC_009');
        assert.match(error.diagnostics[0].message, /Invalid default/);
        return true;
      }
    );
  });

  it('accepts compatible built-in and enum defaults', async () => {
    const model = await parseForgeFilesToSemanticModel([
      {
        uri: 'file:///contracts/user.forge',
        source: `enum UserStatus {
  active
  suspended
}

contract User {
  id: uuid @primary @default(uuid())
  status: UserStatus @default(active)
  createdAt: datetime @default(now())
}
`
      }
    ]);

    const user = model.contracts[0];
    assert.equal(user.fields.find(field => field.name === 'id')?.default?.raw, 'uuid()');
    assert.equal(user.fields.find(field => field.name === 'status')?.default?.raw, 'active');
    assert.equal(user.fields.find(field => field.name === 'createdAt')?.default?.raw, 'now()');
  });

  it('rejects enum defaults that are not declared values', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/user.forge',
          source: `enum UserStatus {
  active
}

contract User {
  status: UserStatus @default(suspended)
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_SEMANTIC_009');
        assert.match(error.diagnostics[0].message, /Invalid default 'suspended'/);
        return true;
      }
    );
  });

  it('rejects built-in default functions on incompatible field types', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/user.forge',
          source: `contract User {
  name: string @default(now())
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_SEMANTIC_009');
        assert.match(error.diagnostics[0].message, /Invalid default 'now\(\)'/);
        return true;
      }
    );
  });

  it('rejects multiple primary fields in one contract', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/user.forge',
          source: `contract User {
  id: uuid @primary
  email: string @primary
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_SEMANTIC_008');
        assert.match(error.diagnostics[0].message, /multiple primary fields/);
        return true;
      }
    );
  });

  it('parses modern import declarations', async () => {
    const model = await parseForgeFilesToSemanticModel([
      {
        uri: 'file:///contracts/user.forge',
        source: `contract User {
  id: uuid @primary
}
`
      },
      {
        uri: 'file:///contracts/post.forge',
        source: `import User from "./user.forge"

contract Post {
  author: User
}
`
      }
    ]);

    assert.equal(model.contracts.find(contract => contract.name === 'Post')?.fields[0].typeRef?.kind, 'contract');
  });

  it('resolves imported contracts and enums into the importing file scope', async () => {
    const model = await parseForgeFilesToSemanticModel([
      {
        uri: 'file:///shared/user.forge',
        source: `enum Role {
  admin
  customer
}

contract User {
  id: uuid @primary
  role: Role @default(customer)
}
`
      },
      {
        uri: 'file:///contracts/order.forge',
        source: `import User, Role from "../shared/user.forge"

contract Order {
  id: uuid @primary
  customerId: uuid
  customer: User @foreign(customerId)
  customerRole: Role
}
`
      }
    ]);

    const order = model.contracts.find(contract => contract.name === 'Order');
    assert.equal(order?.fields.find(field => field.name === 'customer')?.typeRef?.qualifiedName, 'User');
    assert.equal(order?.fields.find(field => field.name === 'customerRole')?.typeRef?.kind, 'enum');
    assert.deepEqual(order?.fields.find(field => field.name === 'customer')?.foreign?.targetField, 'id');
  });

  it('does not resolve cross-file symbols without an explicit import', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///shared/user.forge',
          source: `contract User {
  id: uuid @primary
}
`
        },
        {
          uri: 'file:///contracts/order.forge',
          source: `contract Order {
  customer: User
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_SEMANTIC_001');
        assert.match(error.diagnostics[0].message, /Unknown type 'User'/);
        return true;
      }
    );
  });

  it('reports imported names that do not exist in the target file', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///shared/user.forge',
          source: `contract User {
  id: uuid @primary
}
`
        },
        {
          uri: 'file:///contracts/order.forge',
          source: `import User, MissingRole from "../shared/user.forge"

contract Order {
  customer: User
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_IMPORT_002');
        assert.match(error.diagnostics[0].message, /Imported name 'MissingRole' does not exist/);
        assert.equal(error.diagnostics[0].sourceLine, 'import User, MissingRole from "../shared/user.forge"');
        assert.match(error.diagnostics[0].underline ?? '', /\s+\^/);
        return true;
      }
    );
  });

  it('reports imports that conflict with local symbols', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///shared/user.forge',
          source: `contract User {
  id: uuid @primary
}
`
        },
        {
          uri: 'file:///contracts/order.forge',
          source: `import User from "../shared/user.forge"

contract User {
  id: uuid @primary
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_IMPORT_003');
        assert.match(error.diagnostics[0].message, /conflicts with visible contract 'User'/);
        return true;
      }
    );
  });

  it('reports simple import cycles clearly', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/a.forge',
          source: `import B from "./b.forge"

contract A {
  id: uuid @primary
  b: B
}
`
        },
        {
          uri: 'file:///contracts/b.forge',
          source: `import A from "./a.forge"

contract B {
  id: uuid @primary
  a: A
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        assert.equal(error.diagnostics[0].code, 'FORGE_IMPORT_004');
        assert.match(error.diagnostics[0].message, /Import cycle detected/);
        return true;
      }
    );
  });

  it('reports invalid foreign keys at the relationship field location', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/post.forge',
          source: `contract User {
  id: uuid
}

contract Post {
  author: User @foreign(authorId)
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        const diagnostic = error.diagnostics[0];
        assert.equal(diagnostic.code, 'FORGE_SEMANTIC_006');
        assert.equal(diagnostic.line, 6);
        assert.equal(diagnostic.sourceLine.trim(), 'author: User @foreign(authorId)');
        return true;
      }
    );
  });

  it('rejects relation fields whose local foreign key type differs from the target primary type', async () => {
    await assert.rejects(
      () => parseForgeFilesToSemanticModel([
        {
          uri: 'file:///contracts/post.forge',
          source: `contract User {
  id: uuid @primary
}

contract Post {
  authorId: int
  author: User @foreign(authorId)
}
`
        }
      ]),
      error => {
        assert(error instanceof DiagnosticsError);
        const diagnostic = error.diagnostics[0];
        assert.equal(diagnostic.code, 'FORGE_SEMANTIC_006');
        assert.match(diagnostic.message, /does not match/);
        assert.equal(diagnostic.line, 6);
        return true;
      }
    );
  });
});

function executeGeneratedZod(source) {
  const module = { exports: {} };
  const executable = source
    .replace('import { z } from "zod";', 'const { z } = require("zod");')
    .replace(/export const (\w+) =/g, 'exports.$1 =')
    .replace(/export type [\s\S]*?;\n?/g, '');

  vm.runInNewContext(executable, {
    require: requireFromRepo,
    exports: module.exports,
    module
  });

  return module.exports;
}
