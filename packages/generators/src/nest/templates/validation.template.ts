import type { ContractModel, FieldModel, InvariantComparisonModel, InvariantModel } from '@forge/language';

export function renderValidationSchemas(contract: ContractModel): string {
  const fields = contract.fields.filter(isWritableInputField);
  const imports = renderSchemaImports(fields);
  const baseFields = fields.map(field => `  ${field.name}: ${toZodType(field)},`).join('\n');
  const createRefinements = renderRefinements(contract.invariants, fields, 'create');
  const updateRefinements = renderRefinements(contract.invariants, fields, 'update');
  const baseName = `${contract.name}InputBaseSchema`;

  return `${imports}${imports ? '\n' : ''}const ${baseName} = z.object({
${baseFields}
});

export const Create${contract.name}Schema = ${baseName}${createRefinements};

export const Update${contract.name}Schema = ${baseName}.partial()${updateRefinements};
`;
}

export function renderZodValidationPipe(): string {
  return `import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    throw new BadRequestException({
      message: 'Validation failed',
      issues: result.error.issues.map(issue => {
        const field = issue.path.join('.') || 'body';
        return {
          field,
          path: issue.path,
          message: field === 'body' ? issue.message : \`\${field}: \${issue.message}\`
        };
      })
    });
  }
}
`;
}

export function renderPrismaExceptionFilter(): string {
  return `import { ArgumentsHost, Catch, ConflictException, ExceptionFilter, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter<Prisma.PrismaClientKnownRequestError> {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    if (exception.code === 'P2025') {
      throw new NotFoundException('Record not found');
    }

    if (exception.code === 'P2002') {
      throw new ConflictException('Unique constraint failed');
    }

    throw exception;
  }
}
`;
}

function renderSchemaImports(fields: FieldModel[]): string {
  const imports = ["import { z } from 'zod';"];
  if (fields.some(field => field.type === 'decimal')) {
    imports.push("import { Prisma } from '@prisma/client';");
  }
  return imports.join('\n');
}

function toZodType(field: FieldModel): string {
  let baseType = toZodBaseType(field);
  if (field.isArray) {
    baseType = `z.array(${baseType})`;
  }
  if (field.optional) {
    baseType = `${baseType}.nullable().optional()`;
  }
  if (field.default) {
    baseType = `${baseType}.default(${toZodDefault(field)})`;
  }
  return baseType;
}

function toZodBaseType(field: FieldModel): string {
  if (field.typeRef?.kind === 'enum') {
    return `z.enum(${JSON.stringify(field.typeRef.values ?? [])})`;
  }

  switch (field.type) {
    case 'int':
      return 'z.number().int()';
    case 'float':
      return 'z.number()';
    case 'decimal':
      return 'z.union([z.number(), z.string(), z.instanceof(Prisma.Decimal)])';
    case 'boolean':
      return 'z.boolean()';
    case 'date':
    case 'datetime':
      return 'z.coerce.date()';
    case 'bytes':
      return "z.union([z.instanceof(Buffer), z.string().transform(value => Buffer.from(value, 'base64'))])";
    case 'json':
      return 'z.unknown()';
    case 'uuid':
      return 'z.string().uuid()';
    default:
      return 'z.string()';
  }
}

function toZodDefault(field: FieldModel): string {
  if (!field.default) return 'undefined';
  if (field.default.kind === 'string') return JSON.stringify(field.default.value);
  if (field.default.kind === 'number' || field.default.kind === 'boolean') return String(field.default.value);
  return JSON.stringify(String(field.default.value));
}

function renderRefinements(invariants: InvariantModel[], fields: FieldModel[], mode: 'create' | 'update'): string {
  return invariants
    .filter(invariant => shouldEmitInvariant(invariant, fields))
    .map(invariant => renderRefinement(invariant, mode))
    .join('');
}

function shouldEmitInvariant(invariant: InvariantModel, fields: FieldModel[]): boolean {
  const writableNames = new Set(fields.map(field => field.name));
  return collectInvariantFields(invariant).every(field => writableNames.has(field));
}

function renderRefinement(invariant: InvariantModel, mode: 'create' | 'update'): string {
  const comparisons = invariant.comparisons ?? [];
  const expression = comparisons.map(comparison => renderInvariantComparison(comparison)).join(' ');
  const guard = mode === 'update' ? renderUpdateGuard(invariant) : undefined;
  const predicate = guard ? `${guard} || (${expression})` : expression;
  const message = comparisons.map(comparison => `${comparison.logicalOperator ? `${comparison.logicalOperator} ` : ''}${humanizeInvariantComparison(comparison)}`).join(' ');
  return `.refine(data => ${predicate}, { message: ${JSON.stringify(message)} })`;
}

function renderUpdateGuard(invariant: InvariantModel): string {
  return collectInvariantFields(invariant)
    .map(field => `data.${field} === undefined`)
    .join(' || ');
}

function collectInvariantFields(invariant: InvariantModel): string[] {
  const fields = new Set<string>();
  for (const comparison of invariant.comparisons ?? []) {
    collectOperandFields(comparison.left, fields);
    collectOperandFields(comparison.right, fields);
  }
  return Array.from(fields).sort((left, right) => left.localeCompare(right));
}

function collectOperandFields(operand: InvariantComparisonModel['left'], fields: Set<string>): void {
  if (operand.kind === 'field' && operand.field) {
    fields.add(operand.field);
  }
  for (const term of operand.terms ?? []) {
    collectOperandFields(term.operand, fields);
  }
}

function renderInvariantComparison(comparison: InvariantComparisonModel): string {
  const logicalPrefix = comparison.logicalOperator ? `${comparison.logicalOperator} ` : '';
  const operator = comparison.operator === '==' ? '===' : comparison.operator === '!=' ? '!==' : comparison.operator;
  return `${logicalPrefix}${renderInvariantOperand(comparison.left)} ${operator} ${renderInvariantOperand(comparison.right)}`;
}

function renderInvariantOperand(operand: InvariantComparisonModel['left']): string {
  if (operand.kind === 'expression') {
    return `(${(operand.terms ?? []).map(part => `${part.operator ? `${part.operator} ` : ''}${renderInvariantOperand(part.operand)}`).join(' ')})`;
  }
  if (operand.kind === 'field') {
    const fieldAccess = `data.${operand.field}`;
    return isNumericForgeType(operand.fieldType) ? `Number(${fieldAccess})` : fieldAccess;
  }
  if (operand.literal?.kind === 'string') return JSON.stringify(operand.literal.value);
  if (operand.literal?.kind === 'number' || operand.literal?.kind === 'boolean') return String(operand.literal.value);
  return JSON.stringify(operand.raw);
}

function isNumericForgeType(type: string | undefined): boolean {
  return type === 'int' || type === 'float' || type === 'decimal';
}

function humanizeInvariantComparison(comparison: InvariantComparisonModel): string {
  const operatorText: Record<string, string> = {
    '>': 'must be greater than',
    '>=': 'must be greater than or equal to',
    '<': 'must be less than',
    '<=': 'must be less than or equal to',
    '==': 'must equal',
    '!=': 'must not equal'
  };
  const text = operatorText[comparison.operator] ?? comparison.operator;
  return `${comparison.left.raw} ${text} ${comparison.right.raw}`;
}

function isWritableInputField(field: FieldModel): boolean {
  if (field.readonly || field.typeRef?.kind === 'contract') {
    return false;
  }

  if (field.primary) {
    return !field.default && field.name !== 'id';
  }

  return field.name !== 'id';
}
