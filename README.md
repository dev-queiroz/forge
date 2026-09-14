# Forge

Define your backend once. Forge builds the rest.

Forge is a contract-first backend compiler for TypeScript. A `.forge` file is the canonical source of truth for your domain model, runtime validation, JSON Schema, OpenAPI contracts, Prisma schema, and generated NestJS backend scaffolding.

```forge
namespace commerce

enum OrderStatus {
  pending
  paid
  cancelled
}

contract Order {
  id: uuid @primary @default(uuid())
  customerId: uuid
  total: decimal
  status: OrderStatus @default(pending)
  paid: boolean @default(false)

  invariant total > 0
  invariant paid == true || status != "cancelled"
}
```

The design principle is simple:

```text
one contract -> one semantic model -> consistent generated artifacts
```

## Status

Forge `1.0.0` is the first stable release. The core compiler path is in place: semantic imports, invariants, generators, Prisma Migrate integration, client SDK generation, drift detection, watch mode, formatter, Prisma/Nest E2E coverage and CLI diagnostics.

Forge uses Prisma Migrate for database migrations. Forge does not yet generate authentication, authorization policies or production deployment manifests. Generated Nest projects are intentionally compact scaffolds that you can extend.

## Quick Start

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js init
node packages/cli/dist/index.js compile
```

Compile selected targets:

```bash
node packages/cli/dist/index.js compile --target typescript,zod,json-schema,prisma,openapi,nest
```

## Generated Targets

Forge currently generates:

- TypeScript interfaces and enum constants
- Zod schemas, including defaults and invariant refinements with arithmetic and `&&` / `||`
- JSON Schema documents
- Prisma schema with primary keys, unique fields, indexes, defaults, enums and relation fields
- OpenAPI 3.0.3 schemas and CRUD paths
- NestJS modules, controllers, DTOs, services, PrismaService and Zod request validation
- Fetch-based TypeScript client SDK

## Language Snapshot

```forge
namespace blog

enum PostStatus {
  draft
  published
}

contract User {
  id: uuid @primary @default(uuid())
  email: string @unique @index
  posts: Post[]
}

contract Post {
  id: uuid @primary
  authorId: uuid
  author: User @foreign(authorId)
  title: string
  tags: string[]
  status: PostStatus @default(draft)

  invariant title != ""
}
```

Supported primitive types:

```text
string, int, float, decimal, boolean, uuid, datetime, date, bytes, json
```

Supported modifiers:

```text
@primary, @unique, @index, @default(...), @foreign(...), @readonly, @optional
```

## CLI

```bash
forge init
forge validate
forge check
forge compile
forge compile --target typescript,zod,prisma,client
forge generate openapi
forge generate nest
forge generate client
forge doctor
forge diff
forge migrate dev --name init
forge migrate deploy
forge format
forge format contracts/**/*.forge
forge dev
forge clean
```

`forge check` is intended for CI. It validates syntax, semantics, references, configuration and target compatibility before generation.

`forge format` formats configured contracts, or only the explicit files/globs passed after the command.

`forge migrate` first regenerates `generated/prisma/schema.prisma`, then delegates to Prisma Migrate. Use `forge migrate dev --name init` locally and `forge migrate deploy` in deployment environments.

`forge dev` performs an initial compile, then watches `.forge` files and `forge.config.json` for recompilation without exiting on compile errors.

## Configuration

`forge.config.json`:

```json
{
  "contracts": "contracts/**/*.forge",
  "output": "generated",
  "targets": ["typescript", "zod", "json-schema", "prisma"]
}
```

## Repository Layout

```text
packages/
  language/    Langium grammar, parser boundary, semantic model, diagnostics
  compiler/    intermediate representations such as database schema
  generators/  TypeScript, Zod, JSON Schema, Prisma, OpenAPI and NestJS generators
  cli/         command-line interface
tests/         parser, semantic, generator and CLI tests
examples/      sample Forge contracts
docs/          language, architecture and target documentation
```

## Development

```bash
pnpm build
pnpm test
```

The full test suite compiles the monorepo and runs Node's built-in test runner.

## Documentation

- [Architecture](./docs/architecture.md)
- [Language](./docs/language.md)
- [Generators](./docs/generators.md)
- [CLI](./docs/cli.md)
- [Changelog](./CHANGELOG.md)
- [Recipe: Simple CRUD](./docs/recipes/crud-simple.md)
- [Recipe: Multi-File Relations And Invariants](./docs/recipes/multi-file-relations-invariants.md)
- [Recipe: Advanced Types, Defaults And Custom Primary Keys](./docs/recipes/advanced-types-defaults-primary.md)

Forge's goal is not to be a template engine. It is a compiler: source is parsed once, resolved once, represented semantically once, and every artifact is generated from that shared meaning.
