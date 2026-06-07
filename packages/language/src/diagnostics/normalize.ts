import { fileURLToPath } from 'node:url';
import path from 'node:path';

export type ErrorKind = 'root' | 'derived';

export interface ForgeDiagnostic {
  code: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  hint?: string;
  severity?: "error" | "warning";
  kind?: ErrorKind;
}

export function formatUriToPath(uri?: string): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith('file://')) {
    try {
      const absolutePath = fileURLToPath(uri);
      return path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
    } catch {
      return uri.replace(/^file:\/\/\/?/, '');
    }
  }
  return uri.replace(/^[a-zA-Z0-9+-.]+:\/\/\/?/, '');
}

export function normalizeLangiumError(err: any, fileUri?: string): ForgeDiagnostic {
  const file = formatUriToPath(fileUri);

  // 1. Lexer error
  if (err.offset !== undefined && err.line !== undefined && err.column !== undefined) {
    const match = err.message.match(/->(.*)<-/);
    const char = match ? match[1] : (err.message || '');
    return {
      code: 'FORGE_LEXER_001',
      severity: 'error',
      message: `Invalid character '${char}'`,
      file,
      line: err.line,
      column: err.column,
      hint: 'Remove or escape invalid characters'
    };
  }

  // 2. Parser error
  const name = err.name;
  const token = err.token;
  const previousToken = err.previousToken;
  const ruleStack = err.context?.ruleStack || [];

  let line = (token && typeof token.startLine === 'number' && !isNaN(token.startLine)) ? token.startLine : undefined;
  if (line === undefined) {
    line = (previousToken && typeof previousToken.endLine === 'number' && !isNaN(previousToken.endLine)) ? previousToken.endLine :
           (previousToken && typeof previousToken.startLine === 'number' && !isNaN(previousToken.startLine)) ? previousToken.startLine : 1;
  }

  let column = (token && typeof token.startColumn === 'number' && !isNaN(token.startColumn)) ? token.startColumn : undefined;
  if (column === undefined) {
    column = (previousToken && typeof previousToken.endColumn === 'number' && !isNaN(previousToken.endColumn)) ? previousToken.endColumn + 1 :
             (previousToken && typeof previousToken.startColumn === 'number' && !isNaN(previousToken.startColumn)) ? previousToken.startColumn + 1 : 1;
  }

  if (name === 'MismatchedTokenException') {
    const foundToken = (token?.image === '' || !token?.image) ? '<EOF>' : `'${token.image}'`;
    let hint = 'Check syntax';
    
    const hasField = ruleStack.some((r: string) => r.includes('Field'));
    const hasContract = ruleStack.some((r: string) => r.includes('Contract'));
    
    if (hasField) {
      hint = 'Expected format: name: type';
    } else if (hasContract) {
      hint = "Expected '}' to close the contract definition";
    }

    return {
      code: 'FORGE_SYNTAX_001',
      severity: 'error',
      message: `Unexpected token ${foundToken}`,
      file,
      line,
      column,
      hint
    };
  }

  if (name === 'NoViableAltException') {
    const isPrimitiveType = ruleStack.some((r: string) => r.includes('PrimitiveType'));
    if (isPrimitiveType && token?.image) {
      return {
        code: 'FORGE_SEMANTIC_001',
        severity: 'error',
        message: `Unknown type '${token.image}'`,
        file,
        line,
        column,
        hint: `Supported types:\n\n- string\n- int\n- float\n- decimal\n- boolean\n- uuid\n- datetime\n- date`
      };
    }

    return {
      code: 'FORGE_SYNTAX_002',
      severity: 'error',
      message: 'Invalid syntax structure',
      file,
      line,
      column,
      hint: 'Check contract and field declaration structure'
    };
  }

  return {
    code: 'FORGE_SYNTAX_999',
    severity: 'error',
    message: err.message || 'Syntax error',
    file,
    line,
    column,
    hint: 'Check syntax'
  };
}
