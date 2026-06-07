export function mapForgeTypeToTs(type: string): string {
  switch (type) {
    case 'string':
    case 'uuid':
      return 'string';
    case 'int':
    case 'float':
    case 'decimal':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'datetime':
      return 'Date';
    default:
      return 'any';
  }
}
