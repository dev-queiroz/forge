# Changelog

All notable changes to Forge will be documented in this file.

## [1.0.0-rc.1] - 2024-06-09

### 🎉 Release Highlights

Forge 1.0 is a major release that delivers a complete, production-ready contract-first language and code generation platform.

### ✨ Features

#### Language Enhancements
- **Field Modifiers**: Full support for @primary, @unique, @internal, @readonly, @foreign, @index, @default
- **Enumerations**: Define fixed sets of values with optional string mappings
- **Commands**: Define operations/actions on contracts with typed inputs and outputs
- **Events**: Model events that occur in your system
- **Improved Invariants**: Support for complex expressions and multiple constraints per contract
- **Import Declarations**: Cross-namespace contract references
- **Custom Type References**: Support for capitalized identifiers as type references

#### Compiler Improvements
- Enhanced Langium grammar with full support for all language features
- Comprehensive semantic validation with detailed error messages
- Support for custom types and references
- Improved diagnostics with error deduplication and cascade control
- Type safety across all generated code

#### CLI Enhancements
- **forge init**: Interactive project initialization with example contract
- **forge compile**: Full compilation pipeline with multiple emit targets
- **forge validate**: Validate contracts without generating code
- **forge doctor**: Diagnose project health and identify issues
- **forge clean**: Remove all generated artifacts
- **forge generate nest**: Generate production-ready NestJS backend
- **forge generate openapi**: Generate OpenAPI 3.0.3 specifications
- Improved help messages and error reporting

#### Code Generators
- **Prisma Generator**: Generate database schemas with full field modifier support
- **NestJS Generator**: Complete backend with modules, controllers, services, DTOs
- **OpenAPI Generator**: Production-ready API documentation
- **Zod Generator**: Runtime validation schemas
- **JSON Schema Generator**: API contract documentation
- **TypeScript Generator**: Fully typed interfaces

#### Project Structure
- Pre-configured monorepo with 4 core packages
- Comprehensive pnpm workspace setup
- Example contracts and configuration files
- Professional build pipeline

### 🔧 Technical Details

#### Supported Types
- Primitives: string, int, float, decimal, boolean, uuid, datetime, date, bytes, json
- Custom types (references to other contracts)
- Optional fields with ?
- Array types with []
- Generic types with <>

#### Database Support
- PostgreSQL (primary)
- MySQL
- SQLite
- Via Prisma ORM

#### Architecture
- **Language**: Langium-based DSL with comprehensive grammar
- **Compiler**: Multi-stage compilation (Parser → AST → Semantic Model)
- **Generators**: Modular generator architecture
- **CLI**: Command-based interface with error handling

### 📚 Documentation

- Comprehensive README with quick start guide
- Language feature examples
- CLI command reference
- Project structure documentation
- Integration examples

### 🎯 What's NOT Included (Future Releases)

- ❌ Watch mode (forge dev) - planned for v1.1
- ❌ Code formatting (forge format) - planned for v1.1
- ❌ VS Code Extension - planned for v1.2
- ❌ TypeORM/Drizzle generators - planned for v1.1
- ❌ Docker/Docker Compose generation - planned for v1.1
- ❌ Multi-language SDKs (Python, Go) - planned for v2.0
- ❌ GraphQL generation - planned for future release
- ❌ Database migration generation - planned for v1.2

### 🐛 Bug Fixes

- Fixed diagnostics severity handling (errors vs warnings)
- Improved error position calculation for complex expressions
- Fixed field type string generation for custom types

### ⚠️ Breaking Changes

- **Grammar Format**: Enhanced grammar for new language features (incompatible with v0.x)
- **Semantic Model**: Extended to support enums, commands, events
- **CLI Usage**: New command structure (but backwards compatible for core commands)

### 🚀 Performance

- Compilation speed: < 1 second for typical projects
- Parser performance: Handles 1000+ contracts efficiently
- Generated code: Minimal, optimized for production

### 📦 Dependencies

- langium: 3.x (language implementation)
- zod: ^4.1.0 (validation generation)
- fast-glob: latest (file discovery)
- typescript: ^5.9.3 (compilation)
- pnpm: 10.17.1 (package management)

### 🙏 Contributors

- Core team: Language design, compiler implementation, generator development
- Community feedback: Architecture refinement

### 🔗 Links

- Repository: [GitHub](https://github.com/forge-lang/forge)
- Issues: [Bug Reports](https://github.com/forge-lang/forge/issues)
- Discussions: [Community](https://github.com/forge-lang/forge/discussions)

---

## [0.1.0] - 2024-06-01

### Initial Release

- Basic contract definitions
- TypeScript, JSON Schema, Zod generators
- CLI with init and compile commands
- Semantic validation
- Diagnostic reporting
