import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseForgeToSemanticModel, DiagnosticsError } from '../packages/language/dist/index.js';

describe('Diagnostics and Error Reporting', () => {
  
  describe('Syntax Errors', () => {
    
    it('reports missing field type (FORGE_SYNTAX_001)', async () => {
      const source = `contract Usuario {
    id:
}`;
      await assert.rejects(
        async () => {
          await parseForgeToSemanticModel(source, { uri: 'file:///contracts/usuario.forge' });
        },
        (err) => {
          assert(err instanceof DiagnosticsError);
          const diag = err.diagnostics[0];
          assert.equal(diag.code, 'FORGE_SYNTAX_001');
          assert.match(diag.message, /Unexpected token '}'/);
          assert.equal(diag.file, 'contracts/usuario.forge');
          assert.equal(diag.line, 3);
          assert.equal(diag.column, 1);
          assert.equal(diag.hint, 'Expected format: name: type');
          return true;
        }
      );
    });

    it('reports missing colon (FORGE_SYNTAX_001)', async () => {
      const source = `contract Usuario {
    id string
}`;
      await assert.rejects(
        async () => {
          await parseForgeToSemanticModel(source, { uri: 'file:///contracts/usuario.forge' });
        },
        (err) => {
          assert(err instanceof DiagnosticsError);
          const diag = err.diagnostics[0];
          assert.equal(diag.code, 'FORGE_SYNTAX_001');
          assert.match(diag.message, /Unexpected token 'string'/);
          assert.equal(diag.file, 'contracts/usuario.forge');
          assert.equal(diag.line, 2);
          assert.equal(diag.column, 8);
          assert.equal(diag.hint, 'Expected format: name: type');
          return true;
        }
      );
    });

    it('reports unexpected character lexer error (FORGE_LEXER_001)', async () => {
      const source = `contract Usuario {
    id: string @
}`;
      await assert.rejects(
        async () => {
          await parseForgeToSemanticModel(source, { uri: 'file:///contracts/usuario.forge' });
        },
        (err) => {
          assert(err instanceof DiagnosticsError);
          const diag = err.diagnostics[0];
          assert.equal(diag.code, 'FORGE_LEXER_001');
          assert.match(diag.message, /Invalid character '@'/);
          assert.equal(diag.file, 'contracts/usuario.forge');
          assert.equal(diag.line, 2);
          assert.equal(diag.column, 16);
          assert.equal(diag.hint, 'Remove or escape invalid characters');
          return true;
        }
      );
    });

    it('reports incomplete contract definition (FORGE_SYNTAX_001)', async () => {
      const source = `contract Usuario {`;
      await assert.rejects(
        async () => {
          await parseForgeToSemanticModel(source, { uri: 'file:///contracts/usuario.forge' });
        },
        (err) => {
          assert(err instanceof DiagnosticsError);
          const diag = err.diagnostics[0];
          assert.equal(diag.code, 'FORGE_SYNTAX_001');
          assert.match(diag.message, /Unexpected token <EOF>/);
          assert.equal(diag.file, 'contracts/usuario.forge');
          assert.equal(diag.line, 1);
          assert.equal(diag.column, 19);
          assert.equal(diag.hint, "Expected '}' to close the contract definition");
          return true;
        }
      );
    });

  });

  describe('Semantic Errors', () => {

    it('reports unknown type (FORGE_SEMANTIC_001)', async () => {
      const source = `contract Pedido {
    valor: money
}`;
      await assert.rejects(
        async () => {
          await parseForgeToSemanticModel(source, { uri: 'file:///contracts/pedido.forge' });
        },
        (err) => {
          assert(err instanceof DiagnosticsError);
          const diag = err.diagnostics[0];
          assert.equal(diag.code, 'FORGE_SEMANTIC_001');
          assert.match(diag.message, /Unknown type 'money'/);
          assert.equal(diag.file, 'contracts/pedido.forge');
          assert.equal(diag.line, 2);
          assert.equal(diag.column, 12);
          assert(diag.hint.includes('Supported types:'));
          return true;
        }
      );
    });

    it('reports duplicate contract (FORGE_SEMANTIC_002)', async () => {
      const source = `contract Usuario {
    id: uuid
}

contract Usuario {
    nome: string
}`;
      await assert.rejects(
        async () => {
          await parseForgeToSemanticModel(source, { uri: 'file:///contracts/usuario.forge' });
        },
        (err) => {
          assert(err instanceof DiagnosticsError);
          const diag = err.diagnostics[0];
          assert.equal(diag.code, 'FORGE_SEMANTIC_002');
          assert.match(diag.message, /Contract 'Usuario' is already defined/);
          assert.equal(diag.file, 'contracts/usuario.forge');
          assert.equal(diag.line, 5);
          assert.equal(diag.column, 10);
          assert.equal(diag.hint, 'Rename the contract or remove the duplicate declaration.');
          return true;
        }
      );
    });

    it('reports duplicate field (FORGE_SEMANTIC_003)', async () => {
      const source = `contract Usuario {
    id: uuid
    id: string
}`;
      await assert.rejects(
        async () => {
          await parseForgeToSemanticModel(source, { uri: 'file:///contracts/usuario.forge' });
        },
        (err) => {
          assert(err instanceof DiagnosticsError);
          const diag = err.diagnostics[0];
          assert.equal(diag.code, 'FORGE_SEMANTIC_003');
          assert.match(diag.message, /Duplicate field 'id' in contract 'Usuario'/);
          assert.equal(diag.file, 'contracts/usuario.forge');
          assert.equal(diag.line, 3);
          assert.equal(diag.column, 5);
          assert.equal(diag.hint, 'Rename the field or remove the duplicate declaration.');
          return true;
        }
      );
    });

    it('reports invalid invariant reference on left side (FORGE_SEMANTIC_004)', async () => {
      const source = `contract Pedido {
    valor: decimal
    invariant total >= 0
}`;
      await assert.rejects(
        async () => {
          await parseForgeToSemanticModel(source, { uri: 'file:///contracts/pedido.forge' });
        },
        (err) => {
          assert(err instanceof DiagnosticsError);
          const diag = err.diagnostics[0];
          assert.equal(diag.code, 'FORGE_SEMANTIC_004');
          assert.match(diag.message, /Invalid invariant reference 'total' in contract 'Pedido'/);
          assert.equal(diag.file, 'contracts/pedido.forge');
          assert.equal(diag.line, 3);
          assert.equal(diag.column, 15);
          assert.equal(diag.hint, "The field 'total' does not exist in contract 'Pedido'.");
          return true;
        }
      );
    });

    it('reports invalid invariant reference on right side (FORGE_SEMANTIC_004)', async () => {
      const source = `contract Pedido {
    valor: decimal
    invariant valor >= total
}`;
      await assert.rejects(
        async () => {
          await parseForgeToSemanticModel(source, { uri: 'file:///contracts/pedido.forge' });
        },
        (err) => {
          assert(err instanceof DiagnosticsError);
          const diag = err.diagnostics[0];
          assert.equal(diag.code, 'FORGE_SEMANTIC_004');
          assert.match(diag.message, /Invalid invariant reference 'total' in contract 'Pedido'/);
          assert.equal(diag.file, 'contracts/pedido.forge');
          assert.equal(diag.line, 3);
          assert.equal(diag.column, 24);
          assert.equal(diag.hint, "The field 'total' does not exist in contract 'Pedido'.");
          return true;
        }
      );
    });

  });

});
