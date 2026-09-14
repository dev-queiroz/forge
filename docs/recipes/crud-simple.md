# Recipe: Simple CRUD

Use this when you want one contract to generate TypeScript types, runtime validation, JSON Schema, Prisma and OpenAPI.

## Contract

```forge
namespace app

contract User {
  id: uuid @primary @default(uuid())
  email: string @unique @index
  name: string
  createdAt: datetime @default(now()) @readonly

  invariant email != ""
  invariant name != ""
}
```

## Config

```json
{
  "contracts": "contracts/**/*.forge",
  "output": "generated",
  "targets": ["typescript", "zod", "json-schema", "prisma", "openapi", "nest"]
}
```

## Commands

```bash
forge check
forge compile
forge doctor
```

Generated Nest create/update routes validate request bodies with Zod before calling Prisma. `createdAt` is readonly, so it is omitted from create/update DTOs.
