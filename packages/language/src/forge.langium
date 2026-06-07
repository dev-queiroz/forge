grammar Forge

entry Model:
    namespace=NamespaceDeclaration?
    contracts+=Contract*;

NamespaceDeclaration:
    'namespace' name=QualifiedName;

Contract:
    'contract' name=ID '{'
        members+=ContractMember*
    '}';

ContractMember:
    Field | Invariant;

Field:
    name=ID optional=('?')? ':' type=PrimitiveType;

Invariant:
    'invariant' left=ID operator=ComparisonOperator right=InvariantValue;

PrimitiveType returns string:
    ID;

ComparisonOperator returns string:
    '>=' | '<=' | '==' | '!=' | '>' | '<';

InvariantValue returns string:
    NUMBER | STRING | BOOLEAN | ID;

QualifiedName returns string:
    ID ('.' ID)*;

terminal BOOLEAN returns string: /true|false/;
terminal ID: /[_a-zA-Z][\w]*/;
terminal NUMBER returns number: /[0-9]+(\.[0-9]+)?/;
terminal STRING: /"[^"\\]*(\\.[^"\\]*)*"/;

hidden terminal WS: /\s+/;
