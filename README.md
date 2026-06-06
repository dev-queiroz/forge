# Forge

Forge V0.1 is a small DSL for data contracts. It parses `.forge` files with Langium, converts the AST into a Semantic Model, and generates TypeScript interfaces plus JSON Schema Draft 2020-12 files.

The V0.1 scope is intentionally limited to:

- `namespace`
- `contract`
- fields
- optional fields
- invariants

## Installation

```bash
pnpm install
pnpm build
```

## Usage

Initialize a Forge project:

```bash
pnpm forge init
```

Create contracts under `contracts/**/*.forge`, then compile:

```bash
pnpm forge compile
```

Generated files are written to:

```text
generated/
  typescript/
  json-schema/
```

## Example

Input:

```forge
namespace financeiro

contract Usuario {
    id: uuid
    nome: string
}
```

Output:

```ts
export interface Usuario {
  id: string;
  nome: string;
}
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Usuario",
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "nome": {
      "type": "string"
    }
  },
  "required": [
    "id",
    "nome"
  ]
}
```

## Development

Monorepo packages:

- `packages/language`: Langium grammar, parser, AST access, validations, Semantic Model, and `createContractId`.
- `packages/generators`: TypeScript and JSON Schema generators. Generators consume only the Semantic Model.
- `packages/cli`: `forge init` and `forge compile`.

Build all packages:

```bash
pnpm build
```

Run the CLI through the workspace script:

```bash
pnpm forge init
pnpm forge compile
```
