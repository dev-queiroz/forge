# Architecture

Forge is organized as a compiler pipeline:

```text
source
  -> lexer/parser
  -> AST
  -> symbol declaration
  -> type resolution
  -> semantic model
  -> target-specific intermediate representations
  -> generators
```

The semantic model is the authority. Generators should not reinterpret `.forge` syntax or infer language semantics from raw text.

## Packages

`@forge/language` owns the grammar, parser entry points, symbol table, type resolution, semantic model and diagnostics.

`@forge/compiler` owns intermediate representations that are not tied to one output format. The database schema IR lives here and feeds Prisma generation.

`@forge/generators` owns deterministic rendering of generated artifacts.

`@forge/cli` owns project loading, config, target selection and user-facing commands.

## Rule Of Consistency

If TypeScript, Zod, JSON Schema, Prisma, OpenAPI and NestJS can disagree about the same contract, the architecture is wrong. Add missing information to the semantic model first, then update the affected generators.

## Verification

The test suite includes unit, semantic, CLI and generated-backend checks. The generated NestJS E2E test creates a realistic Forge project, emits the Nest backend, installs its dependencies, runs `prisma generate`, compiles TypeScript and imports the compiled app module. This catches integration bugs that are invisible to string-based generator assertions.
