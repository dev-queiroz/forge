# Generators

Generators consume the semantic model produced by `@forge/language`.

## TypeScript

Generates interfaces for contracts and `as const` objects for enums. `bytes` maps to `Uint8Array`, `json` maps to `unknown`, and arrays preserve the resolved base type, including contract and enum arrays.

## Zod

Generates runtime validation schemas. Supported semantic features include primitive types, arrays, optional fields, enums, defaults and invariant refinements.

Invariants are emitted as real Zod `.refine(...)` calls. Forge supports numeric, string and boolean literals, comparison operators, arithmetic terms such as `price * stock > 100`, and logical `&&` / `||` chains. Error messages are rendered from the invariant expression, for example `price * stock must be greater than 100`.

`bytes` maps to `z.instanceof(Uint8Array)`, `json` maps to `z.unknown()`, enum arrays use `z.array(z.enum(...))`, and contract fields use `z.lazy(() => OtherSchema)` from the resolved semantic type.

## JSON Schema

Generates one JSON Schema document per contract. Required fields are derived from semantic optionality.

`bytes` is represented as a base64 string with `contentEncoding: "base64"`. `json` is represented as an unconstrained schema so any JSON value is valid. Contract fields use `$ref` to the referenced contract schema, and arrays wrap the resolved item schema.

## Prisma

The Prisma generator consumes the database schema IR from `@forge/compiler`.

Supported features include primary keys, unique fields, indexes, defaults, nullable fields, enums and relation fields. Owning relation fields are emitted with deterministic relation names; when the contract does not declare the inverse side, the Prisma generator emits a hidden back-reference field so `prisma generate` can validate the schema.

`bytes`, `json`, scalar arrays and enum arrays map to Prisma `Bytes`, `Json`, `Type[]` and `Enum[]` respectively.

## OpenAPI

Generates an OpenAPI 3.0.3 document with component schemas and basic CRUD paths per contract.

Each contract gets:

```text
Contract
CreateContractInput
UpdateContractInput
```

`Create` schemas omit server-controlled fields and do not require fields with defaults. `Update` schemas reuse the same writable fields with all fields optional.

Item paths use the semantic primary field. A contract with `sku: string @primary` gets `/product/{sku}` rather than a hard-coded `/product/{id}`, and the path parameter schema is derived from the primary field type.

`bytes` is documented as base64 string data using OpenAPI `format: byte`. `json` is left unconstrained. Arrays wrap the resolved item schema, including enum values and contract `$ref`s. Contract schemas include invariant expressions in the `x-forge-invariants` extension when invariants are present.

## NestJS

Generates a compact NestJS project with modules, controllers, DTOs, services, Zod validation schemas and a shared PrismaService. Services call Prisma instead of using in-memory arrays.

Generated controllers and services use the semantic primary field for route parameters and Prisma `where` clauses. The generated TypeScript project enables `strict`, `strictNullChecks` and `noImplicitAny`.

Create DTOs omit `id`, generated `@primary` fields, relation object fields and `@readonly` fields so clients do not provide server-controlled values by default. A custom primary field without a default, such as `sku: string @primary`, remains writable because Prisma needs a value at create time. Optional output DTO fields are emitted as `?: T | null` to match nullable Prisma results.

Nest DTOs use `Buffer` for `bytes`, `Prisma.Decimal` for decimal output, `Prisma.Decimal | number | string` for decimal input, `Prisma.JsonValue` for JSON output and `Prisma.InputJsonValue` for JSON input.

Create and update routes use a generated `ZodValidationPipe` with contract-specific schemas. Create schemas validate writable input fields and applicable invariants. Update schemas are partial and apply an invariant only when all fields referenced by that invariant are present in the update payload. Validation responses include field paths and readable messages.

Generated Nest projects include a basic Prisma exception filter for common request errors such as missing records and unique constraint failures.

The generated NestJS backend is covered by an E2E test that installs dependencies, runs `prisma generate`, compiles TypeScript, imports the generated app module and executes generated Zod schemas with valid and invalid invariant payloads.

## Client SDK

Generates `client/index.ts`, a small fetch-based TypeScript client. It imports generated TypeScript contract and enum types, exposes `CreateContractInput` and `UpdateContractInput`, and provides typed `findMany`, `findById`, `create`, `update` and `delete` functions per resource.

The client is generated with `forge compile --target client` or `forge generate client`.
