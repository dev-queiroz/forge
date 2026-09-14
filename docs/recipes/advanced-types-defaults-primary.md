# Recipe: JSON, Bytes, Arrays, Defaults And Custom Primary Keys

This recipe shows the data shapes that often reveal weak generators: custom primary fields, JSON, bytes, arrays, defaults and readonly fields.

## Contract

```forge
namespace catalog

enum ProductStatus {
  draft
  active
  archived
}

contract Product {
  sku: string @primary
  name: string
  price: decimal
  tags: string[]
  attachments: bytes[]
  metadata: json?
  status: ProductStatus @default(active)
  createdAt: datetime @default(now()) @readonly

  invariant name != ""
  invariant price > 0
}
```

## What To Expect

TypeScript maps `bytes` to `Uint8Array` in generated types and Nest DTOs use `Buffer`.

Zod maps `json` to `z.unknown()` and arrays wrap the resolved item type.

OpenAPI represents `bytes` as `type: string` with `format: byte` and leaves `json` unconstrained.

Prisma uses `sku` as the model id because it is the semantic `@primary` field. OpenAPI item paths and Nest routes also use `/products/{sku}`.

## Commands

```bash
forge compile --target typescript,zod,json-schema,prisma,openapi,nest
forge doctor
```
