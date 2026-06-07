import type { ForgeDiagnostic, ErrorKind } from './normalize.js';

export { ErrorKind };

export interface StabilizedDiagnostic extends ForgeDiagnostic {
  kind: ErrorKind;
}

/**
 * Maximum number of diagnostics to surface per file.
 * After stabilization, only the first MAX_ERRORS_PER_FILE root errors are kept.
 */
export const MAX_ERRORS_PER_FILE = 2;

/**
 * Syntax error codes that can generate cascading parser-recovery artifacts.
 * When one of these appears, subsequent FORGE_SYNTAX_* errors in the same file
 * are treated as derived (parser recovery noise) rather than independent root causes.
 */
const SYNTAX_CODES = new Set([
  'FORGE_SYNTAX_001',
  'FORGE_SYNTAX_002',
  'FORGE_SYNTAX_999',
]);

/**
 * Lexer and semantic error codes are always independent root causes.
 */
const ROOT_CODES = new Set([
  'FORGE_LEXER_001',
  'FORGE_SEMANTIC_001',
  'FORGE_SEMANTIC_002',
  'FORGE_SEMANTIC_003',
  'FORGE_SEMANTIC_004',
]);

/**
 * Stabilize a list of ForgeDiagnostics by:
 * 1. Deduplicating exact duplicates (same file + line + column + code)
 * 2. Classifying each diagnostic as "root" or "derived"
 * 3. Removing derived diagnostics when a root cause already covers the same context
 * 4. Limiting output to MAX_ERRORS_PER_FILE errors per file
 */
export function stabilizeDiagnostics(
  diagnostics: ForgeDiagnostic[]
): ForgeDiagnostic[] {
  // Step 1: Deduplicate exact duplicates
  const deduplicated = filterDiagnostics(diagnostics);

  // Step 2: Classify and suppress cascades
  const classified = classifyDiagnostics(deduplicated);

  // Step 3: Keep only root errors, then apply per-file limit
  return applyLimit(classified);
}

/**
 * Remove diagnostics that have an identical (file, line, column, code) signature.
 */
export function filterDiagnostics(diagnostics: ForgeDiagnostic[]): ForgeDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter(d => {
    const key = `${d.file ?? ''}|${d.line ?? ''}|${d.column ?? ''}|${d.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Classify each diagnostic as root or derived.
 *
 * Rules:
 * - Lexer and semantic errors are always root.
 * - The FIRST syntax error per file is root.
 * - Subsequent syntax errors in the same file are derived (parser recovery artifacts),
 *   UNLESS they occur on a different line far from any existing root error.
 */
function classifyDiagnostics(diagnostics: ForgeDiagnostic[]): StabilizedDiagnostic[] {
  // Group by file for per-file processing
  const byFile = new Map<string, ForgeDiagnostic[]>();
  for (const d of diagnostics) {
    const fileKey = d.file ?? '';
    if (!byFile.has(fileKey)) byFile.set(fileKey, []);
    byFile.get(fileKey)!.push(d);
  }

  const result: StabilizedDiagnostic[] = [];

  for (const [, fileDiags] of byFile) {
    let firstSyntaxLine: number | undefined;

    for (const d of fileDiags) {
      if (ROOT_CODES.has(d.code)) {
        // Semantic and lexer errors are always root causes
        result.push({ ...d, kind: 'root' });
      } else if (SYNTAX_CODES.has(d.code)) {
        if (firstSyntaxLine === undefined) {
          // First syntax error in file is root
          firstSyntaxLine = d.line ?? 1;
          result.push({ ...d, kind: 'root' });
        } else {
          // Subsequent syntax errors: only root if they are on a clearly different line
          // (more than 1 line away from the first root syntax error).
          // Close-by syntax errors are parser recovery artifacts -> derived.
          const lineDist = Math.abs((d.line ?? 1) - firstSyntaxLine);
          if (lineDist > 1) {
            // Far enough to be considered an independent problem
            result.push({ ...d, kind: 'root' });
            firstSyntaxLine = d.line ?? firstSyntaxLine;
          } else {
            result.push({ ...d, kind: 'derived' });
          }
        }
      } else {
        // Unknown code -> conservative: treat as root
        result.push({ ...d, kind: 'root' });
      }
    }
  }

  return result;
}

/**
 * Keep only root errors, then limit to MAX_ERRORS_PER_FILE per file.
 */
function applyLimit(diagnostics: StabilizedDiagnostic[]): ForgeDiagnostic[] {
  const countByFile = new Map<string, number>();
  return diagnostics.filter(d => {
    if (d.kind === 'derived') return false;
    const fileKey = d.file ?? '';
    const count = countByFile.get(fileKey) ?? 0;
    if (count >= MAX_ERRORS_PER_FILE) return false;
    countByFile.set(fileKey, count + 1);
    return true;
  });
}
