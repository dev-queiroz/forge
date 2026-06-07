import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stabilizeDiagnostics, MAX_ERRORS_PER_FILE } from '../packages/language/dist/index.js';

describe('Diagnostics Stabilizer', () => {

  describe('Deduplication', () => {

    it('removes exact duplicate diagnostics (same file, line, column, code)', () => {
      const diags = [
        { code: 'FORGE_SYNTAX_001', message: 'Unexpected token', file: 'a.forge', line: 2, column: 5, severity: 'error' },
        { code: 'FORGE_SYNTAX_001', message: 'Unexpected token', file: 'a.forge', line: 2, column: 5, severity: 'error' },
      ];
      const result = stabilizeDiagnostics(diags);
      assert.equal(result.length, 1);
    });

    it('keeps diagnostics with same code but different location', () => {
      const diags = [
        { code: 'FORGE_SEMANTIC_001', message: "Unknown type 'foo'", file: 'a.forge', line: 2, column: 5, severity: 'error' },
        { code: 'FORGE_SEMANTIC_001', message: "Unknown type 'bar'", file: 'a.forge', line: 4, column: 5, severity: 'error' },
      ];
      // Both are semantic root errors, but limited to MAX_ERRORS_PER_FILE
      const result = stabilizeDiagnostics(diags);
      assert.equal(result.length, Math.min(2, MAX_ERRORS_PER_FILE));
    });

  });

  describe('Cascade control', () => {

    it('marks subsequent syntax errors on the same line as derived and filters them', () => {
      const diags = [
        { code: 'FORGE_SYNTAX_001', message: "Unexpected token '}'", file: 'a.forge', line: 3, column: 1, severity: 'error' },
        { code: 'FORGE_SYNTAX_001', message: "Unexpected token '<EOF>'", file: 'a.forge', line: 3, column: 2, severity: 'error' },
      ];
      const result = stabilizeDiagnostics(diags);
      // Only the first root syntax error survives — the second is a cascade on the same line
      assert.equal(result.length, 1);
      assert.equal(result[0].kind, 'root');
      assert.equal(result[0].line, 3);
    });

    it('marks subsequent syntax error on adjacent line as derived and filters it', () => {
      const diags = [
        { code: 'FORGE_SYNTAX_001', message: "Unexpected token '}'", file: 'a.forge', line: 3, column: 1, severity: 'error' },
        { code: 'FORGE_SYNTAX_001', message: "Unexpected token 'string'", file: 'a.forge', line: 4, column: 5, severity: 'error' },
      ];
      const result = stabilizeDiagnostics(diags);
      // Line 4 is within 1 line of line 3 → derived → filtered
      assert.equal(result.length, 1);
      assert.equal(result[0].line, 3);
    });

    it('keeps syntax errors that are far apart as independent root causes', () => {
      const diags = [
        { code: 'FORGE_SYNTAX_001', message: "Unexpected token '}'", file: 'a.forge', line: 3, column: 1, severity: 'error' },
        { code: 'FORGE_SYNTAX_001', message: "Unexpected token '}'", file: 'a.forge', line: 7, column: 1, severity: 'error' },
      ];
      const result = stabilizeDiagnostics(diags);
      // Both survive (4 lines apart) but capped at MAX_ERRORS_PER_FILE
      assert.equal(result.length, Math.min(2, MAX_ERRORS_PER_FILE));
      assert.ok(result.every(d => d.kind === 'root'));
    });

  });

  describe('Root cause classification', () => {

    it('classifies lexer errors as root', () => {
      const diags = [
        { code: 'FORGE_LEXER_001', message: "Invalid character '@'", file: 'a.forge', line: 2, column: 5, severity: 'error' },
      ];
      const result = stabilizeDiagnostics(diags);
      assert.equal(result.length, 1);
      assert.equal(result[0].kind, 'root');
    });

    it('classifies semantic errors as root (always independent)', () => {
      const diags = [
        { code: 'FORGE_SEMANTIC_001', message: "Unknown type 'money'", file: 'a.forge', line: 2, column: 8, severity: 'error' },
        { code: 'FORGE_SEMANTIC_001', message: "Unknown type 'cash'", file: 'a.forge', line: 3, column: 8, severity: 'error' },
      ];
      const result = stabilizeDiagnostics(diags);
      assert.ok(result.every(d => d.kind === 'root'));
    });

    it('classifies first syntax error as root', () => {
      const diags = [
        { code: 'FORGE_SYNTAX_001', message: "Unexpected token '}'", file: 'a.forge', line: 5, column: 1, severity: 'error' },
      ];
      const result = stabilizeDiagnostics(diags);
      assert.equal(result.length, 1);
      assert.equal(result[0].kind, 'root');
    });

  });

  describe('Per-file limit (MAX_ERRORS_PER_FILE)', () => {

    it('limits to MAX_ERRORS_PER_FILE root diagnostics per file', () => {
      // All are independent semantic errors on different lines
      const diags = Array.from({ length: 6 }, (_, i) => ({
        code: 'FORGE_SEMANTIC_001',
        message: `Unknown type 'type${i}'`,
        file: 'a.forge',
        line: i + 1,
        column: 8,
        severity: 'error'
      }));
      const result = stabilizeDiagnostics(diags);
      assert.equal(result.length, MAX_ERRORS_PER_FILE);
    });

    it('applies limit independently per file', () => {
      const diags = [
        { code: 'FORGE_SEMANTIC_001', message: "Unknown type 'a'", file: 'a.forge', line: 1, column: 8, severity: 'error' },
        { code: 'FORGE_SEMANTIC_001', message: "Unknown type 'b'", file: 'a.forge', line: 2, column: 8, severity: 'error' },
        { code: 'FORGE_SEMANTIC_001', message: "Unknown type 'c'", file: 'a.forge', line: 3, column: 8, severity: 'error' },
        { code: 'FORGE_SEMANTIC_001', message: "Unknown type 'x'", file: 'b.forge', line: 1, column: 8, severity: 'error' },
        { code: 'FORGE_SEMANTIC_001', message: "Unknown type 'y'", file: 'b.forge', line: 2, column: 8, severity: 'error' },
        { code: 'FORGE_SEMANTIC_001', message: "Unknown type 'z'", file: 'b.forge', line: 3, column: 8, severity: 'error' },
      ];
      const result = stabilizeDiagnostics(diags);
      const fromA = result.filter(d => d.file === 'a.forge');
      const fromB = result.filter(d => d.file === 'b.forge');
      assert.equal(fromA.length, MAX_ERRORS_PER_FILE);
      assert.equal(fromB.length, MAX_ERRORS_PER_FILE);
    });

  });

});
