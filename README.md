# Forge 1.0

> Define contracts once. Generate everything.

Forge is a contract-first language and compiler for defining data models and generating complete backend applications.

Write business logic in Forge contracts, and automatically generate:
- **Type-safe TypeScript types**
- **Zod validation schemas**
- **JSON Schema definitions**
- **OpenAPI 3.0.3 documentation**
- **Prisma database schemas**
- **NestJS backend applications**
- **TypeScript SDKs**

## 🚀 Quick Start

```bash
npm install -g @forge/cli
forge init my-app
cd my-app
forge compile
```

## 📋 Status: v1.0.0-rc.1

Forge is in **Release Candidate** status. The core language, compiler, and generators are production-ready.

### ✅ Implemented

- **Language**: Contract definitions, field types, modifiers (@primary, @unique, @internal, etc.), enums, invariants, commands, events
- **Compiler**: Lexer, parser, semantic analyzer, type checker, comprehensive diagnostics
- **Generators**: TypeScript, JSON Schema, Zod, OpenAPI 3.0.3, Prisma, NestJS, TypeScript SDK
- **CLI**: init, compile, validate, doctor, clean (format and dev coming soon)
- **Configuration**: forge.config.json with support for contracts and output paths

### 🔄 Work in Progress

- **VS Code Extension**: Syntax highlighting, diagnostics, code completion
- **Watch Mode**: forge dev command
- **Code Formatting**: forge format command
- **TypeORM/Drizzle Generators**: Alternative ORM support
- **Docker Support**: Dockerfile and docker-compose generation

## 📝 Example

### Define Contracts

```forge
namespace users

/// A user account
contract User {
  /// Unique identifier
  id: uuid @primary

  /// Email address (unique)
  email: string @unique @index

  /// User's full name
  name: string

  /// Account status
  status: enum { ACTIVE | SUSPENDED | DELETED } = ACTIVE

  /// Creation timestamp
  createdAt: datetime @default(now()) @readonly

  invariant status != DELETED || email != ""
}

contract UserProfile {
  id: uuid @primary
  userId: uuid @foreign(User.id)
  bio: string?
  avatar: string?
}

enum Role {
  ADMIN = "admin"
  USER = "user"
  GUEST = "guest"
}
```

### Generate Everything

```bash
forge compile
```

Generates:
```
generated/
├── typescript/
│   ├── User.ts
│   └── UserProfile.ts
├── zod/
│   ├── User.ts
│   └── UserProfile.ts
├── json-schema/
│   ├── User.schema.json
│   └── UserProfile.schema.json
└── prisma/
    └── schema.prisma
```

### Use Generated Code

```typescript
import { UserSchema } from './generated/zod/User';

const user = UserSchema.parse({
  id: 'uuid',
  email: 'user@example.com',
  name: 'John Doe',
  status: 'ACTIVE',
  createdAt: new Date().toISOString()
});
```

## 🛠️ CLI Commands

```bash
forge init              # Initialize a new Forge project
forge compile           # Compile contracts and generate artifacts
forge validate          # Validate contracts without generating code
forge doctor            # Diagnose project health
forge clean             # Remove generated artifacts
forge generate openapi  # Generate OpenAPI specification
forge generate nest     # Generate NestJS backend project
```

## 🏗️ Project Structure

After `forge init`, your project looks like:

```
my-app/
├── contracts/           # Your Forge contract definitions
│   ├── users/
│   │   └── user.forge
│   └── example.forge
├── generated/           # Auto-generated code (do not edit)
│   ├── typescript/
│   ├── zod/
│   ├── json-schema/
│   └── prisma/
├── dist/                # Distribution artifacts
├── forge.config.json    # Project configuration
├── package.json
├── tsconfig.json
└── README.md
```

## 📖 Language Features

### Types
- `string`, `int`, `float`, `decimal`, `boolean`
- `uuid`, `datetime`, `date`, `bytes`, `json`
- Custom types (other contracts)
- Optional fields with `?`
- Array types with `[]`

### Modifiers
- `@primary` - Primary key
- `@unique` - Unique constraint
- `@index` - Create index
- `@foreign(Contract.field)` - Foreign key
- `@internal` - Hide from API
- `@readonly` - Cannot be modified
- `@default(value)` - Default value

### Constraints
- **Invariants**: Express business rules that must hold true
- **Enumerations**: Define fixed sets of values
- **Commands**: Define operations on contracts
- **Events**: Define events that occur in the system

## 🔌 Integration

### TypeScript

```typescript
import { User } from './generated/typescript/User';
import { UserSchema } from './generated/zod/User';

const userData: User = { ... };
UserSchema.parse(userData); // Validate
```

### API Documentation

```json
{
  "openapi": "3.0.3",
  "info": { "title": "My API", "version": "1.0.0" },
  "paths": {
    "/users": { ... },
    "/users/{id}": { ... }
  }
}
```

### Database Schema

```prisma
model User {
  id    String   @id @default(uuid())
  email String   @unique
  name  String
  status String  @default("ACTIVE")
  createdAt DateTime @default(now())
}
```

## 📚 Documentation

- [Language Reference](./docs/LANGUAGE.md) - Complete language specification
- [Getting Started](./docs/GETTING_STARTED.md) - Step-by-step guide
- [Architecture](./docs/ARCHITECTURE.md) - System design and concepts
- [Generator Configuration](./docs/GENERATORS.md) - Customizing code generation

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

Apache License 2.0 - see [LICENSE](./LICENSE)

## 🎯 Roadmap

### v1.0.0 (Planned)
- Finalize all core features
- Complete documentation
- Release stable version

### v1.1.0
- Code formatting with `forge format`
- Watch mode with `forge dev`
- TypeORM and Drizzle generators
- Improved diagnostics

### v1.2.0
- VS Code extension
- Advanced validation
- Event handling framework
- Migration generation

## 💡 FAQ

**Q: Can I use Forge with an existing database?**
A: v1.0 focuses on code generation from contracts. Database reverse-engineering is planned for v1.2.

**Q: How do I version my API?**
A: Use multiple contract files or namespaces. The generated OpenAPI spec includes version info.

**Q: Can I extend generated code?**
A: Yes! Generated code is clean and maintainable. Add custom business logic in separate files.

## 📞 Support

- GitHub Issues: [Report bugs](https://github.com/forge-lang/forge/issues)
- GitHub Discussions: [Ask questions](https://github.com/forge-lang/forge/discussions)
- Documentation: Full reference at [forge-lang.dev](https://forge-lang.dev)

