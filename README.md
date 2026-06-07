# Forge

> Define contracts once. Generate everything.

Forge is a contract-first language for defining data contracts and generating code artifacts from a single source of truth.

## Current Status

Forge is currently in **v0.1.0**.

Implemented:

- Contract-first DSL
- Namespace support
- Contracts
- Optional fields
- Invariants
- Langium-based parser
- Semantic Model architecture
- TypeScript generator
- JSON Schema Draft 2020-12 generator
- Zod generator
- CLI tooling

Planned:

- OpenAPI generator
- Improved diagnostics
- VS Code extension

## Installation

```bash
pnpm install
pnpm build
```

The generated Zod artifacts import `zod`, which is included as a project dependency.

## Usage

Initialize a Forge project:

```bash
pnpm forge init
```

Create contracts under:

```text
contracts/**/*.forge
```

Compile all contracts:

```bash
pnpm forge compile
```

Generated files are written to:

```text
generated/
|-- typescript/
|-- json-schema/
`-- zod/
```

## Example

### Input

```forge
namespace financeiro

contract Usuario {
    id: uuid
    nome: string
    email?: string

    invariant id != ""
}
```

### Generated TypeScript

```ts
export interface Usuario {
  id: string;
  nome: string;
  email?: string;
}
```

### Generated JSON Schema

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
    },
    "email": {
      "type": "string"
    }
  },
  "required": [
    "id",
    "nome"
  ]
}
```

### Generated Zod Schema

```ts
import { z } from "zod";

export const UsuarioSchema = z.object({
  id: z.string(),
  nome: z.string(),
  email: z.string().optional(),
});

export type Usuario = z.infer<typeof UsuarioSchema>;
```

## Language Overview

### Namespace

```forge
namespace financeiro.pagamentos
```

### Contract

```forge
contract PedidoPago {
    pedidoId: uuid
    valor: decimal
}
```

### Optional Fields

```forge
cupom?: string
```

### Invariants

```forge
invariant valor > 0
```

Invariants are parsed and kept in the Semantic Model. Zod invariant validation is not generated yet.

## Supported Types

| Forge Type | TypeScript | JSON Schema | Zod |
|------------|------------|-------------|-----|
| string | string | string | z.string() |
| int | number | number | z.number().int() |
| float | number | number | z.number() |
| decimal | number | number | z.number() |
| boolean | boolean | boolean | z.boolean() |
| uuid | string | string | z.string() |
| datetime | string | string | z.string() |
| date | string | string | z.string() |

## Architecture

Forge follows a layered architecture:

```text
Forge Source
     |
Parser
     |
AST
     |
Semantic Model
     |
Generators
     |
Artifacts
```

Current generators:

- TypeScript
- JSON Schema
- Zod

Generators consume only the Semantic Model, making it possible to add new targets without changing the parser or language definition.

## Monorepo Structure

```text
packages/
|-- cli/
|-- generators/
`-- language/

examples/
```

### packages/language

Contains:

- Langium grammar
- Parser
- AST access
- Semantic Model
- Validations
- createContractId

### packages/generators

Contains:

- TypeScript generator
- JSON Schema generator
- Zod generator

### packages/cli

Contains:

- forge init
- forge compile

## Development

Run all tests:

```bash
pnpm test
```

Build all packages:

```bash
pnpm build
```

## Roadmap

### v0.2

- Better diagnostics

### v0.3

- OpenAPI generation
- Enhanced validation support

### Future Exploration

- Additional language targets

## License

[Apache License 2.0](https://github.com/dev-queiroz/forge/blob/main/LICENSE)
