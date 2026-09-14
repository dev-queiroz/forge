grammar Forge

entry Model:
    imports+=ImportDeclaration*
    namespace=NamespaceDeclaration?
    elements+=ModelElement*;

ImportDeclaration:
    'import' (names+=ID (',' names+=ID)* 'from' path=STRING | importedNamespace=QualifiedName ('.' '{' names+=ID (',' names+=ID)* '}')?);

NamespaceDeclaration:
    'namespace' name=QualifiedName;

ModelElement:
    Contract | Enum | Command | Event;

Contract:
    'contract' name=ID '{'
        members+=ContractMember*
    '}';

ContractMember:
    Field | Invariant | Relationship;

Field:
    name=ID optional=('?')? ':' type=FieldType modifiers+=FieldModifier*;

FieldModifier:
    '@' name=ID ('(' value=ModifierValue ')')?;

ModifierValue returns string:
    STRING | NUMBER | BOOLEAN | FUNCTION | ID ('.' ID)?;

FieldType:
    baseType=TypeReference arrayMarker=('[]')? optional=('?')?;

TypeReference:
    PrimitiveTypeRef | ComplexTypeRef;

PrimitiveTypeRef:
    type=PrimitiveType;

ComplexTypeRef:
    name=ID ('<' typeArgs+=TypeReference (',' typeArgs+=TypeReference)* '>')?;

PrimitiveType returns string:
    'string' | 'int' | 'float' | 'decimal' | 'boolean' | 'uuid' | 'datetime' | 'date' | 'bytes' | 'json';

Invariant:
    'invariant' name=ID '{'
        expression+=InvariantExpression*
    '}' | 'invariant' expression+=InvariantExpression;

InvariantExpression:
    left=InvariantTerm operator=ComparisonOperator right=InvariantTerm (logicalOperators+=LogicalOperator additional+=InvariantComparison)*;

InvariantComparison:
    left=InvariantTerm operator=ComparisonOperator right=InvariantTerm;

InvariantTerm:
    values+=InvariantValue (operators+=ArithmeticOperator values+=InvariantValue)*;

InvariantValue returns string:
    ID | STRING | NUMBER | BOOLEAN;

ArithmeticOperator returns string:
    '*' | '/' | '+' | '-';

LogicalOperator returns string:
    '&&' | '||';

ComparisonOperator returns string:
    '==' | '!=' | '>' | '<' | '>=' | '<=';

Relationship:
    'relationship' sourceType=ID '-' relationshipType=RelationType '-' targetType=ID;

RelationType returns string:
    '1:1' | '1:N' | 'N:M' | 'M:N';

Enum:
    'enum' name=ID '{'
        values+=EnumValue (','? values+=EnumValue)* ','?
    '}';

EnumValue:
    name=ID ('=' value=STRING)?;

Command:
    'command' name=ID '{'
        inputs+=CommandInput*
    '}' '->' output=CommandOutputType;

CommandInput:
    name=ID ':' type=FieldType;

CommandOutputType:
    type=FieldType | void='void';

Event:
    'event' name=ID '{'
        fields+=EventField*
    '}';

EventField:
    name=ID ':' type=FieldType;

QualifiedName returns string:
    ID ('.' ID)*;

terminal BOOLEAN returns string: /true|false/;
terminal FUNCTION returns string: /[_a-zA-Z][\w]*\(\)/;
terminal ID: /[_a-zA-Z][\w]*/;
terminal NUMBER returns number: /[0-9]+(\.[0-9]+)?/;
terminal STRING: /"[^"\\]*(\\.[^"\\]*)*"/;

hidden terminal WS: /\s+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
