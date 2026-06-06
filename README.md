# Forge

> Define contracts once. Generate everything.

Forge is a contract-first language for defining data contracts and generating code artifacts from a single source of truth.

Instead of duplicating the same contract across TypeScript interfaces, validation schemas, API specifications, and other systems, define it once in Forge and generate the artifacts you need.

## Why Forge?

Modern applications often require the same data contract to be maintained in multiple places:

- TypeScript interfaces
- Validation schemas
- API specifications
- Event definitions
- Backend services
- Frontend applications

Keeping these definitions synchronized is tedious and error-prone.

Forge aims to solve this by making the contract the source of truth and generating artifacts automatically.

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
- CLI tooling

Planned:

- Zod generator
- OpenAPI generator
- Improved diagnostics
- VS Code extension

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
├── typescript/
└── json-schema/
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

## Supported Types

| Forge Type | TypeScript |
|------------|------------|
| string | string |
| int | number |
| float | number |
| decimal | number |
| boolean | boolean |
| uuid | string |
| datetime | string |
| date | string |

## Architecture

Forge follows a layered architecture:

```text
Forge Source
     ↓
Parser
     ↓
AST
     ↓
Semantic Model
     ↓
Generators
     ↓
Artifacts
```

Current generators:

- TypeScript
- JSON Schema

Generators consume only the Semantic Model, making it possible to add new targets without changing the parser or language definition.

## Monorepo Structure

```text
packages/
├── cli/
├── generators/
└── language/

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

### packages/cli

Contains:

- forge init
- forge compile

## Roadmap

### v0.2

- Zod generator
- Better diagnostics

### v0.3

- OpenAPI generation
- Enhanced validation support

### Future Exploration

- Event contracts
- API contracts
- Contract governance
- Additional language targets

## Contributing

Contributions, feedback, and discussions are welcome.

If you find a bug or have an idea for improving Forge, please open an issue.

## License

[Apache License 2.0](https://github.com/dev-queiroz/forge/blob/main/LICENSE)