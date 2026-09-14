# Language

Forge files use the `.forge` extension.

## Namespace

```forge
namespace commerce.orders
```

Namespaces qualify contracts and enums in the semantic model.

## Imports

Imports must appear at the top of the file, before `namespace` and declarations.

```forge
import User from "./user.forge"
import Money, Currency from "../shared/money.forge"
```

The CLI resolves relative imports from the importing file and includes imported files in the same semantic compilation. Repeated imports are deduplicated by resolved file path.

Imports are semantic. Only local declarations and explicitly imported contracts/enums are visible to a file. If `order.forge` says `import Customer from "./customer.forge"`, fields such as `customer: Customer`, enum fields, command inputs, event fields and relation targets can use that imported symbol.

Imported names must exist in the imported file:

```forge
import User, MissingRole from "./user.forge"
             ^^^^^^^^^^^
```

Forge reports `FORGE_IMPORT_002` for an imported name that does not exist, `FORGE_IMPORT_003` for an import that conflicts with a local/visible symbol, and `FORGE_IMPORT_004` for an import cycle. Missing files and imports that escape the project root are reported as `FORGE_IMPORT_001`.

## Contracts

```forge
contract User {
  id: uuid @primary @default(uuid())
  email: string @unique @index
  nickname: string?
}
```

Fields use `name: type`. Optional fields use `type?`. The previous `name?: type` form is still accepted for compatibility.

## Enums

```forge
enum OrderStatus {
  pending
  paid
  cancelled
}
```

Comma-separated enum values are also accepted.

## Arrays

```forge
tags: string[]
orders: Order[]
statuses: OrderStatus[]
```

Array information is represented semantically for primitive, enum and contract types. Generators consume `typeRef` from the semantic model rather than re-parsing the source text.

## Modifiers

```text
@primary
@unique
@index
@default(value)
@foreign(fieldName)
@foreign(Contract.field)
@readonly
@optional
```

Modifiers are normalized in the semantic model so generators can consume the same meaning.

Forge validates modifier names, duplicate modifiers, required modifier values and modifiers that should not receive values.

Defaults are type-checked. For example, `@default("free")` is valid for `string` but invalid for `decimal`.

Supported built-in default functions are currently `uuid()` for `uuid` fields and `now()` for `date` / `datetime` fields. Enum defaults use an enum value identifier, such as `@default(active)`.

`@primary` is semantic, not just decorative. Prisma uses it as the model `@id`, OpenAPI uses it as the item path parameter, and the NestJS generator uses it in route parameters and Prisma `where` clauses.

`@readonly` marks server-controlled fields. OpenAPI create/update schemas and Nest create/update DTOs omit readonly fields.

## Invariants

```forge
contract Product {
  price: decimal
  stock: int
  discontinued: boolean

  invariant price > 0
  invariant stock >= 0
  invariant price * stock > 100
  invariant price > 0 && stock >= 0
  invariant discontinued == true || stock > 0
}
```

Invariants support comparisons with `>`, `>=`, `<`, `<=`, `==` and `!=`. Comparisons can be joined with `&&` and `||`.

Each side of a comparison may be a field, a numeric/string/boolean literal or an arithmetic term using `+`, `-`, `*` or `/`. Forge validates field references and rejects incompatible comparisons, such as `name > 0`, or non-numeric arithmetic, such as `active + 1 > 2`.

Zod generators emit executable `.refine(...)` calls with readable messages, such as `price * stock must be greater than 100`. OpenAPI schemas include invariant text in `x-forge-invariants`.
