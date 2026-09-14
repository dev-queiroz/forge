# CLI

Build first:

```bash
pnpm build
```

Then run the local CLI:

```bash
node packages/cli/dist/index.js <command>
```

## Commands

`init` creates a starter Forge project.

`validate` parses and semantically validates all configured contracts.

`check` validates contracts, references, config and target compatibility. Use this in CI.

`compile` generates configured targets.

`compile --target typescript,zod,prisma` overrides configured targets for one run.

`generate openapi` writes `dist/openapi.json`.

`generate nest` writes `dist/backend`.

`generate client` writes the TypeScript client SDK to `generated/client` or the configured output directory.

`doctor` reports project health with counts for contracts, enums, relations, invariants and cross-file imports. It also reports production warnings such as missing primary keys, unilateral relations, redundant indexes, optional fields used by invariants and generated artifact drift. The final status is `healthy`, `warnings` or `errors`.

`diff` prints the current schema shape. This is the foundation for future schema evolution and migration planning.

When `generated/prisma/schema.prisma` exists, `diff` compares the current semantic model's Prisma output against that baseline. It reports added, removed and changed model fields, and highlights obvious breaking changes such as removed fields, removed models, type changes and new required fields.

When no baseline exists, it prints the schema preview and tells you to run `forge compile`.

`format` applies the opinionated Forge formatter to configured contract files.

`format <pattern...>` formats only files matched by explicit paths or glob patterns, for example `forge format contracts/**/*.forge` or `forge format contracts/user.forge`.

`dev` performs an initial compile and keeps running. It watches `.forge` files and `forge.config.json`, including imported Forge files outside the configured contract glob as long as they stay inside the project root. Generated output, `dist`, `node_modules` and `.git` are ignored, and compile errors are printed without stopping the watcher.

`migrate <subcommand>` regenerates `generated/prisma/schema.prisma` from the current semantic model, then delegates to Prisma Migrate.

Common commands:

```bash
forge migrate dev --name init
forge migrate deploy
forge migrate status
forge migrate diff --from-empty --script
```

Forge passes `--schema generated/prisma/schema.prisma` automatically for `dev`, `deploy` and `status` unless you provide your own `--schema`. For `diff`, Forge uses the generated Prisma schema as `--to-schema-datamodel` unless you provide another target.

`clean` removes generated artifacts.

## Doctor Status

`forge doctor` is intended for local confidence checks and CI visibility. It does not rewrite files. For drift detection it computes the same generated file plan as `forge compile` and compares expected content with files currently on disk.

Typical output:

```text
Forge Doctor Report
===================

✓ Forge configuration
✓ Contracts: 2
✓ Enums: 1
✓ Relations: 1
✓ Invariants: 3
✓ Cross-file imports: 1
✓ Targets: typescript, zod, prisma

Warnings
--------
⚠ Generated artifact 'generated/typescript/User.ts' is out of date; run forge compile.

Errors
------
✓ No errors.

Status: warnings (42ms)
```

## Diagnostics

Compiler diagnostics include an error code, file, line, column, source excerpt and underline when source text is available.

Example:

```text
✗ contracts/payment.forge:3:3
  [FORGE_SEMANTIC_009] Invalid default '"free"' for field 'amount' of type 'decimal'.
  3 │   amount: decimal @default("free")
    │   ^
  Hint: Use a default value compatible with the field type.
```
