import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { generatePrisma } from '../packages/generators/dist/prisma/index.js';
import { DatabaseSchemaBuilder } from '../packages/compiler/dist/index.js';
import { toSemanticModel } from '../packages/language/dist/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');

// Test data - DatabaseSchema format
const testSchema = {
  tables: [
    {
      name: 'User',
      namespace: '',
      fields: [
        { name: 'id', type: 'uuid', isPrimary: true, isNullable: false, isUnique: true },
        { name: 'name', type: 'string', isPrimary: false, isNullable: false, isUnique: false },
        { name: 'email', type: 'string', isPrimary: false, isNullable: false, isUnique: true },
        { name: 'age', type: 'int', isPrimary: false, isNullable: true, isUnique: false }
      ]
    },
    {
      name: 'Post',
      namespace: '',
      fields: [
        { name: 'id', type: 'uuid', isPrimary: true, isNullable: false, isUnique: true },
        { name: 'title', type: 'string', isPrimary: false, isNullable: false, isUnique: false },
        { name: 'content', type: 'string', isPrimary: false, isNullable: true, isUnique: false },
        { name: 'published', type: 'boolean', isPrimary: false, isNullable: false, isUnique: false }
      ]
    }
  ]
};

describe('Prisma Generator', () => {

  it('generates valid Prisma schema from DatabaseSchema', () => {
    const files = generatePrisma(testSchema);

    assert.equal(files.length, 1);
    assert.equal(files[0].path, 'prisma/schema.prisma');
    assert.ok(files[0].content.includes('model User'));
    assert.ok(files[0].content.includes('model Post'));
  });

  it('generates primary key fields with @id modifier', () => {
    const files = generatePrisma(testSchema);
    const content = files[0].content;

    assert.ok(content.includes('id String @id'));
  });

  it('generates unique fields with @unique modifier', () => {
    const files = generatePrisma(testSchema);
    const content = files[0].content;

    assert.ok(content.includes('email String @unique'));
  });

  it('generates nullable fields with question mark', () => {
    const files = generatePrisma(testSchema);
    const content = files[0].content;

    assert.ok(content.includes('age Int?'));
    assert.ok(content.includes('content String?'));
  });

  it('maps all Forge types to Prisma types correctly', () => {
    const files = generatePrisma(testSchema);
    const content = files[0].content;

    // String type
    assert.ok(content.includes('name String'));
    // Int type
    assert.ok(content.includes('age Int?'));
    // Boolean type
    assert.ok(content.includes('published Boolean'));
  });

  it('generates Prisma configuration header', () => {
    const files = generatePrisma(testSchema);
    const content = files[0].content;

    assert.ok(content.includes('generator client'));
    assert.ok(content.includes('provider = "prisma-client-js"'));
    assert.ok(content.includes('datasource db'));
    assert.ok(content.includes('provider = "postgresql"'));
    assert.ok(content.includes('url      = env("DATABASE_URL")'));
  });

  it('handles single model with primary key', () => {
    const singleModelSchema = {
      tables: [
        {
          name: 'Product',
          namespace: '',
          fields: [
            { name: 'id', type: 'uuid', isPrimary: true, isNullable: false, isUnique: true },
            { name: 'sku', type: 'string', isPrimary: false, isNullable: false, isUnique: true },
            { name: 'price', type: 'decimal', isPrimary: false, isNullable: false, isUnique: false }
          ]
        }
      ]
    };

    const files = generatePrisma(singleModelSchema);
    const content = files[0].content;

    assert.ok(content.includes('model Product'));
    assert.ok(content.includes('id String @id'));
    assert.ok(content.includes('sku String @unique'));
    assert.ok(content.includes('price Decimal'));
  });

  it('handles datetime and date types', () => {
    const schemaWithDates = {
      tables: [
        {
          name: 'Event',
          namespace: '',
          fields: [
            { name: 'id', type: 'uuid', isPrimary: true, isNullable: false, isUnique: true },
            { name: 'startTime', type: 'datetime', isPrimary: false, isNullable: false, isUnique: false },
            { name: 'eventDate', type: 'date', isPrimary: false, isNullable: true, isUnique: false }
          ]
        }
      ]
    };

    const files = generatePrisma(schemaWithDates);
    const content = files[0].content;

    assert.ok(content.includes('startTime DateTime'));
    assert.ok(content.includes('eventDate DateTime?'));
  });

  it('handles float and decimal types', () => {
    const schemaWithNumbers = {
      tables: [
        {
          name: 'Transaction',
          namespace: '',
          fields: [
            { name: 'id', type: 'uuid', isPrimary: true, isNullable: false, isUnique: true },
            { name: 'amount', type: 'decimal', isPrimary: false, isNullable: false, isUnique: false },
            { name: 'taxRate', type: 'float', isPrimary: false, isNullable: true, isUnique: false }
          ]
        }
      ]
    };

    const files = generatePrisma(schemaWithNumbers);
    const content = files[0].content;

    assert.ok(content.includes('amount Decimal'));
    assert.ok(content.includes('taxRate Float?'));
  });

});
