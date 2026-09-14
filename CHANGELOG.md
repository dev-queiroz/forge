# Changelog

## 1.0.0

Forge 1.0 is the first stable release of the contract-first backend compiler.

### Language And Compiler

- Semantic model for contracts, fields, enums, modifiers, defaults, relationships, imports and invariants.
- Semantic import resolution across files, including missing-name diagnostics, conflict detection and cycle detection.
- Strong diagnostics with stable Forge error codes, source excerpts, underline and caret output.
- Invariants with arithmetic, comparisons, logical `&&` / `||`, numeric/string/boolean literals and semantic type checks.
- Consistent handling of `bytes`, `json`, arrays, custom primary keys, readonly fields and defaults.

### Generators

- TypeScript interfaces and enum constants.
- Zod runtime schemas with defaults and executable invariant refinements.
- JSON Schema documents.
- Prisma schema generation with enums, relation fields, deterministic relation names and generated back-references when needed.
- OpenAPI 3.0.3 schemas and CRUD paths with semantic primary path params and `x-forge-invariants`.
- NestJS backend scaffolding with PrismaService, controllers, services, DTOs, generated Zod validation schemas, request validation pipe and basic Prisma exception filter.
- Fetch-based TypeScript client SDK with typed CRUD resource helpers.

### CLI

- `forge init`, `validate`, `check`, `compile`, `doctor`, `diff`, `format`, `dev`, `clean`.
- `forge generate openapi`, `forge generate nest`, `forge generate client`.
- `forge migrate` wrapper around Prisma Migrate.
- Watch mode that recompiles on `.forge` and config changes without exiting on errors.
- Formatter with explicit path/glob support and idempotence.
- Doctor report with project counts, production warnings and generated artifact drift detection.

### Verification

- Full test suite covering parser, semantic pipeline, diagnostics, generators, CLI flows, drift detection, formatter idempotence, client generation and Nest/Prisma E2E.
- E2E generated Nest backend installs dependencies, runs Prisma Client generation, validates Prisma Migrate diff, compiles TypeScript and executes generated Zod schemas.
