import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateZod } from '../packages/generators/dist/index.js';

const allTypesModel = {
  contracts: [
    {
      id: 'AllTypes',
      name: 'AllTypes',
      namespace: '',
      fields: [
        { name: 'text', type: 'string', optional: false },
        { name: 'id', type: 'uuid', optional: false },
        { name: 'count', type: 'int', optional: false },
        { name: 'ratio', type: 'float', optional: false },
        { name: 'amount', type: 'decimal', optional: false },
        { name: 'active', type: 'boolean', optional: false },
        { name: 'createdAt', type: 'datetime', optional: false },
        { name: 'birthDate', type: 'date', optional: false }
      ],
      invariants: []
    }
  ]
};

describe('ZodGenerator', () => {
  it('maps all Forge primitive types to Zod types', () => {
    const [file] = generateZod(allTypesModel);

    assert.equal(file.path, 'zod/AllTypes.ts');
    assert.equal(
      file.content,
      `import { z } from "zod";

export const AllTypesSchema = z.object({
  text: z.string(),
  id: z.string(),
  count: z.number().int(),
  ratio: z.number(),
  amount: z.number(),
  active: z.boolean(),
  createdAt: z.string(),
  birthDate: z.string(),
});

export type AllTypes = z.infer<typeof AllTypesSchema>;
`
    );
  });

  it('generates optional fields with .optional()', () => {
    const [file] = generateZod({
      contracts: [
        {
          id: 'usuarios.Usuario',
          name: 'Usuario',
          namespace: 'usuarios',
          fields: [
            { name: 'id', type: 'uuid', optional: false },
            { name: 'email', type: 'string', optional: true }
          ],
          invariants: []
        }
      ]
    });

    assert.match(file.content, /email: z\.string\(\)\.optional\(\),/);
  });

  it('generates one Zod file per contract', () => {
    const files = generateZod({
      contracts: [
        {
          id: 'Usuario',
          name: 'Usuario',
          namespace: '',
          fields: [{ name: 'id', type: 'uuid', optional: false }],
          invariants: []
        },
        {
          id: 'Pedido',
          name: 'Pedido',
          namespace: '',
          fields: [{ name: 'valor', type: 'decimal', optional: false }],
          invariants: []
        }
      ]
    });

    assert.deepEqual(
      files.map(file => file.path),
      ['zod/Usuario.ts', 'zod/Pedido.ts']
    );
  });
});
