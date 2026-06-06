import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createForgeServices } from './forge-module.js';
import type { Contract, Field, Invariant, Model } from './generated/ast.js';

const primitiveTypes = new Set([
  'string',
  'int',
  'float',
  'decimal',
  'boolean',
  'uuid',
  'datetime',
  'date'
]);

export interface SemanticModel {
  contracts: ContractModel[];
}

export interface ContractModel {
  id: string;
  name: string;
  namespace: string;
  fields: FieldModel[];
  invariants: InvariantModel[];
}

export interface FieldModel {
  name: string;
  type: string;
  optional: boolean;
}

export interface InvariantModel {
  expression: string;
}

export interface ParseForgeOptions {
  uri?: string;
}

export function createContractId(namespace: string, name: string): string {
  return namespace ? `${namespace}.${name}` : name;
}

export async function parseForge(source: string, options: ParseForgeOptions = {}): Promise<Model> {
  const services = createForgeServices(EmptyFileSystem);
  const parse = parseHelper<Model>(services.Forge);
  const document = await parse(source, { documentUri: options.uri ?? 'memory:///model.forge' });
  const lexerErrors = document.parseResult.lexerErrors;
  const parserErrors = document.parseResult.parserErrors;

  if (lexerErrors.length > 0 || parserErrors.length > 0) {
    const messages = [
      ...lexerErrors.map(error => error.message),
      ...parserErrors.map(error => error.message)
    ];
    throw new Error(`Invalid Forge syntax:\n${messages.join('\n')}`);
  }

  return document.parseResult.value;
}

export async function parseForgeToSemanticModel(source: string, options: ParseForgeOptions = {}): Promise<SemanticModel> {
  return toSemanticModel(await parseForge(source, options));
}

export function toSemanticModel(model: Model): SemanticModel {
  const namespace = model.namespace?.name ?? '';
  const names = new Set<string>();

  const contracts = model.contracts.map(contract => {
    validateContract(contract, names);

    return {
      id: createContractId(namespace, contract.name),
      name: contract.name,
      namespace,
      fields: contract.members.filter(isField).map(field => ({
        name: field.name,
        type: field.type,
        optional: Boolean(field.optional)
      })),
      invariants: contract.members.filter(isInvariant).map(invariant => ({
        expression: `${invariant.left} ${invariant.operator} ${invariant.right}`
      }))
    };
  });

  return { contracts };
}

function validateContract(contract: Contract, names: Set<string>): void {
  if (names.has(contract.name)) {
    throw new Error(`Duplicate contract name: ${contract.name}`);
  }
  names.add(contract.name);

  const fieldNames = new Set<string>();
  for (const member of contract.members) {
    if (isField(member)) {
      if (fieldNames.has(member.name)) {
        throw new Error(`Duplicate field "${member.name}" in contract "${contract.name}"`);
      }
      fieldNames.add(member.name);
      if (!primitiveTypes.has(member.type)) {
        throw new Error(`Unsupported primitive type "${member.type}" in contract "${contract.name}"`);
      }
    }
  }
}

function isField(member: Contract['members'][number]): member is Field {
  return member.$type === 'Field';
}

function isInvariant(member: Contract['members'][number]): member is Invariant {
  return member.$type === 'Invariant';
}
