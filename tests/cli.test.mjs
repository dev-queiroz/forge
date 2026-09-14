import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');

describe('forge compile', () => {
  it('generates Zod artifacts alongside existing generators', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'usuario.forge'),
      `namespace usuarios

contract Usuario {
    id: uuid
    nome: string
    email?: string
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Generated 4 file\(s\)/);

    const zodSource = await readFile(path.join(root, 'generated', 'zod', 'Usuario.ts'), 'utf8');
    assert.equal(
      zodSource,
      `import { z } from "zod";

export const UsuarioSchema = z.object({
  id: z.string(),
  nome: z.string(),
  email: z.string().optional(),
});

export type Usuario = z.infer<typeof UsuarioSchema>;
`
    );

    await readFile(path.join(root, 'generated', 'typescript', 'Usuario.ts'), 'utf8');
    await readFile(path.join(root, 'generated', 'json-schema', 'Usuario.schema.json'), 'utf8');
  });

  it('accepts a contracts directory in forge.config.json', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-dir-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(path.join(root, 'forge.config.json'), JSON.stringify({
      contracts: 'contracts',
      output: 'generated',
      targets: ['typescript']
    }), 'utf8');
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    await readFile(path.join(root, 'generated', 'typescript', 'User.ts'), 'utf8');
  });

  it('rejects invalid configured targets during check', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-bad-target-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(path.join(root, 'forge.config.json'), JSON.stringify({
      contracts: 'contracts/**/*.forge',
      output: 'generated',
      targets: ['typescript', 'alchemy']
    }), 'utf8');
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'check'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unknown target 'alchemy'/);
  });

  it('help lists client target and migrate command', () => {
    const result = spawnSync(process.execPath, [cliPath, '--help'], {
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /migrate\s+Run Prisma Migrate/);
    assert.match(result.stdout, /typescript,zod,json-schema,prisma,openapi,nest,client/);
  });

  it('loads relative imports when compiling configured entry contracts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-imports-'));
    await mkdir(path.join(root, 'contracts'));
    await mkdir(path.join(root, 'shared'));
    await writeFile(path.join(root, 'forge.config.json'), JSON.stringify({
      contracts: 'contracts/**/*.forge',
      output: 'generated',
      targets: ['typescript']
    }), 'utf8');
    await writeFile(
      path.join(root, 'shared', 'user.forge'),
      `contract User {
  id: uuid
}
`,
      'utf8'
    );
    await writeFile(
      path.join(root, 'contracts', 'post.forge'),
      `import User from "../shared/user.forge"

contract Post {
  id: uuid
  author: User
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const post = await readFile(path.join(root, 'generated', 'typescript', 'Post.ts'), 'utf8');
    assert.match(post, /import type \{ User \} from '\.\/User';/);
  });

  it('diff reports Prisma schema changes against generated baseline', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-diff-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid
  name: string
}
`,
      'utf8'
    );

    const compile = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(compile.status, 0, compile.stderr);

    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid
  email: string @unique
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'diff'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Database changes/);
    assert.match(result.stdout, /- User\.name String/);
    assert.match(result.stdout, /\+ User\.email String @unique/);
    assert.match(result.stdout, /Breaking changes/);
    assert.match(result.stdout, /Field 'User\.name' will be removed/);
    assert.match(result.stdout, /Field 'User\.email' is a new required database field/);
  });

  it('migrate prints help when no subcommand is provided', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-migrate-help-'));

    const result = spawnSync(process.execPath, [cliPath, 'migrate'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /Forge Migrate/);
    assert.match(result.stdout, /forge migrate dev --name <name>/);
  });

  it('migrate dev generates Prisma schema and delegates to Prisma Migrate', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-migrate-dev-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid @primary @default(uuid())
  email: string @unique
}
`,
      'utf8'
    );
    const fakePrisma = await writeFakePrisma(root);

    const result = spawnSync(process.execPath, [cliPath, 'migrate', 'dev', '--name', 'init'], {
      cwd: root,
      env: {
        ...process.env,
        FORGE_PRISMA_BIN: process.execPath,
        FORGE_PRISMA_BIN_ARGS: JSON.stringify([fakePrisma])
      },
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Prisma schema generated at generated\/prisma\/schema\.prisma/);
    const schema = await readFile(path.join(root, 'generated', 'prisma', 'schema.prisma'), 'utf8');
    assert.match(schema, /model User/);
    const args = JSON.parse(await readFile(path.join(root, 'prisma-args.json'), 'utf8'));
    assert.deepEqual(args, ['migrate', 'dev', '--name', 'init', '--schema', 'generated/prisma/schema.prisma']);
  });

  it('migrate diff uses the generated Prisma schema as datamodel input', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-migrate-diff-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid @primary @default(uuid())
}
`,
      'utf8'
    );
    const fakePrisma = await writeFakePrisma(root);

    const result = spawnSync(process.execPath, [cliPath, 'migrate', 'diff', '--from-empty', '--script'], {
      cwd: root,
      env: {
        ...process.env,
        FORGE_PRISMA_BIN: process.execPath,
        FORGE_PRISMA_BIN_ARGS: JSON.stringify([fakePrisma])
      },
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const args = JSON.parse(await readFile(path.join(root, 'prisma-args.json'), 'utf8'));
    assert.deepEqual(args, ['migrate', 'diff', '--from-empty', '--script', '--to-schema-datamodel', 'generated/prisma/schema.prisma']);
  });

  it('migrate deploy preserves an explicit Prisma schema argument', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-migrate-deploy-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid @primary @default(uuid())
}
`,
      'utf8'
    );
    const fakePrisma = await writeFakePrisma(root);

    const result = spawnSync(process.execPath, [cliPath, 'migrate', 'deploy', '--schema', 'custom/schema.prisma'], {
      cwd: root,
      env: {
        ...process.env,
        FORGE_PRISMA_BIN: process.execPath,
        FORGE_PRISMA_BIN_ARGS: JSON.stringify([fakePrisma])
      },
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const args = JSON.parse(await readFile(path.join(root, 'prisma-args.json'), 'utf8'));
    assert.deepEqual(args, ['migrate', 'deploy', '--schema', 'custom/schema.prisma']);
  });

  it('doctor reports project stats with healthy status when generated artifacts are current', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-doctor-healthy-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(path.join(root, 'forge.config.json'), JSON.stringify({
      contracts: 'contracts/**/*.forge',
      output: 'generated',
      targets: ['typescript', 'zod', 'json-schema', 'prisma', 'openapi']
    }), 'utf8');
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `enum UserStatus {
  active
}

contract User {
  id: uuid @primary @default(uuid())
  email: string @unique
  status: UserStatus @default(active)

  invariant email != ""
}
`,
      'utf8'
    );

    const compile = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(compile.status, 0, compile.stderr);

    const result = spawnSync(process.execPath, [cliPath, 'doctor'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Contracts: 1/);
    assert.match(result.stdout, /Enums: 1/);
    assert.match(result.stdout, /Relations: 0/);
    assert.match(result.stdout, /Invariants: 1/);
    assert.match(result.stdout, /Cross-file imports: 0/);
    assert.match(result.stdout, /Status: healthy/);
  });

  it('doctor exits with errors when forge.config.json is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-doctor-no-config-'));

    const result = spawnSync(process.execPath, [cliPath, 'doctor'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /forge\.config\.json not found/);
    assert.match(result.stdout, /Status: errors/);
  });

  it('doctor counts cross-file imports and relations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-doctor-imports-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(path.join(root, 'forge.config.json'), JSON.stringify({
      contracts: 'contracts/order.forge',
      output: 'generated',
      targets: ['typescript']
    }), 'utf8');
    await writeFile(
      path.join(root, 'contracts', 'customer.forge'),
      `contract Customer {
  id: uuid @primary
}
`,
      'utf8'
    );
    await writeFile(
      path.join(root, 'contracts', 'order.forge'),
      `import Customer from "./customer.forge"

contract Order {
  id: uuid @primary
  customerId: uuid
  customer: Customer @foreign(customerId)
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'doctor'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Contracts: 2/);
    assert.match(result.stdout, /Relations: 1/);
    assert.match(result.stdout, /Cross-file imports: 1/);
  });

  it('doctor reports semantic warnings for production-suspicious contracts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-doctor-warnings-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(path.join(root, 'forge.config.json'), JSON.stringify({
      contracts: 'contracts/**/*.forge',
      output: 'generated',
      targets: ['typescript']
    }), 'utf8');
    await writeFile(
      path.join(root, 'contracts', 'post.forge'),
      `contract User {
  id: uuid @primary @unique @index
}

contract Post {
  title: string @unique @index
  author: User
  summary: string?

  invariant summary != ""
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'doctor'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Contract 'Post' has no @primary field/);
    assert.match(result.stdout, /Relation 'Post\.author' points to 'User' without an inverse field declared/);
    assert.match(result.stdout, /Field 'Post\.title' is both @unique and @index/);
    assert.match(result.stdout, /Field 'User\.id' is @primary; @unique\/@index is redundant/);
    assert.match(result.stdout, /references optional field\(s\): summary/);
    assert.match(result.stdout, /Status: warnings/);
  });

  it('doctor does not warn about relations when the inverse field is declared', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-doctor-inverse-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(path.join(root, 'forge.config.json'), JSON.stringify({
      contracts: 'contracts/**/*.forge',
      output: 'generated',
      targets: ['typescript']
    }), 'utf8');
    await writeFile(
      path.join(root, 'contracts', 'blog.forge'),
      `contract User {
  id: uuid @primary
  posts: Post[]
}

contract Post {
  id: uuid @primary
  authorId: uuid
  author: User @foreign(authorId)
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'doctor'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /without an inverse field declared/);
  });

  it('doctor reports drift when generated artifacts are missing or stale', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-doctor-drift-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(path.join(root, 'forge.config.json'), JSON.stringify({
      contracts: 'contracts/**/*.forge',
      output: 'generated',
      targets: ['typescript']
    }), 'utf8');
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid @primary
  name: string
}
`,
      'utf8'
    );

    const missing = spawnSync(process.execPath, [cliPath, 'doctor'], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(missing.status, 0, missing.stderr);
    assert.match(missing.stdout, /Generated artifact 'generated\/typescript\/User\.ts' is missing/);
    assert.match(missing.stdout, /Status: warnings/);

    const compile = spawnSync(process.execPath, [cliPath, 'compile'], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(compile.status, 0, compile.stderr);
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid @primary
  email: string
}
`,
      'utf8'
    );

    const stale = spawnSync(process.execPath, [cliPath, 'doctor'], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(stale.status, 0, stale.stderr);
    assert.match(stale.stdout, /Generated artifact 'generated\/typescript\/User\.ts' is out of date/);
  });

  it('reports missing imports as Forge diagnostics with source excerpts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-missing-import-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'post.forge'),
      `import User from "./missing.forge"

contract Post {
  author: User
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'check'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /FORGE_IMPORT_001/);
    assert.match(result.stderr, /Import not found: \.\/missing\.forge/);
    assert.match(result.stderr, /import User from "\.\/missing\.forge"/);
    assert.match(result.stderr, /\^\^\^\^\^\^\^\^\^\^\^\^\^\^\^/);
  });

  it('reports missing imported names as Forge diagnostics with source excerpts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-missing-import-name-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid @primary
}
`,
      'utf8'
    );
    await writeFile(
      path.join(root, 'contracts', 'post.forge'),
      `import User, Role from "./user.forge"

contract Post {
  author: User
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'check'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /FORGE_IMPORT_002/);
    assert.match(result.stderr, /Imported name 'Role' does not exist/);
    assert.match(result.stderr, /import User, Role from "\.\/user\.forge"/);
    assert.match(result.stderr, /\s+\^/);
  });

  it('reports import cycles during project checks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-import-cycle-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'a.forge'),
      `import B from "./b.forge"

contract A {
  id: uuid @primary
  b: B
}
`,
      'utf8'
    );
    await writeFile(
      path.join(root, 'contracts', 'b.forge'),
      `import A from "./a.forge"

contract B {
  id: uuid @primary
  a: A
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'check'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /FORGE_IMPORT_004/);
    assert.match(result.stderr, /Import cycle detected/);
  });

  it('formats configured Forge contract files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-format-'));
    await mkdir(path.join(root, 'contracts'));
    const contractPath = path.join(root, 'contracts', 'user.forge');
    await writeFile(
      contractPath,
      `contract User {
id: uuid


name: string
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'format'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Formatted 1 Forge file/);
    assert.equal(
      await readFile(contractPath, 'utf8'),
      `contract User {
  id: uuid

  name: string
}
`
    );
  });

  it('formats only Forge files matched by explicit patterns', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-format-glob-'));
    await mkdir(path.join(root, 'contracts'));
    const userPath = path.join(root, 'contracts', 'user.forge');
    const postPath = path.join(root, 'contracts', 'post.forge');
    const messyUser = `contract User {
id: uuid
}
`;
    const messyPost = `contract Post {
id: uuid
}
`;
    await writeFile(userPath, messyUser, 'utf8');
    await writeFile(postPath, messyPost, 'utf8');

    const result = spawnSync(process.execPath, [cliPath, 'format', 'contracts/user.forge'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Formatted 1 Forge file/);
    assert.equal(
      await readFile(userPath, 'utf8'),
      `contract User {
  id: uuid
}
`
    );
    assert.equal(await readFile(postPath, 'utf8'), messyPost);
  });

  it('formats Forge files matched by wildcard globs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-format-wildcard-'));
    await mkdir(path.join(root, 'contracts'));
    const userPath = path.join(root, 'contracts', 'user.forge');
    const postPath = path.join(root, 'contracts', 'post.forge');
    await writeFile(userPath, `contract User {
id: uuid
}
`, 'utf8');
    await writeFile(postPath, `contract Post {
id: uuid
}
`, 'utf8');

    const result = spawnSync(process.execPath, [cliPath, 'format', 'contracts/*.forge'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Formatted 2 Forge file/);
    assert.match(await readFile(userPath, 'utf8'), /  id: uuid/);
    assert.match(await readFile(postPath, 'utf8'), /  id: uuid/);
  });

  it('format is idempotent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-format-idempotent-'));
    await mkdir(path.join(root, 'contracts'));
    const contractPath = path.join(root, 'contracts', 'user.forge');
    await writeFile(
      contractPath,
      `contract User {
id: uuid
name: string
}
`,
      'utf8'
    );

    const first = spawnSync(process.execPath, [cliPath, 'format'], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(first.status, 0, first.stderr);
    const formattedOnce = await readFile(contractPath, 'utf8');

    const second = spawnSync(process.execPath, [cliPath, 'format'], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(await readFile(contractPath, 'utf8'), formattedOnce);
  });

  it('reports all files written across generated and dist targets', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-count-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(
      path.join(root, 'contracts', 'user.forge'),
      `contract User {
  id: uuid @primary
  name: string
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, [cliPath, 'compile', '--target', 'typescript,openapi,nest'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Generated 17 file\(s\)/);
    await readFile(path.join(root, 'generated', 'typescript', 'User.ts'), 'utf8');
    await readFile(path.join(root, 'dist', 'openapi.json'), 'utf8');
    await readFile(path.join(root, 'dist', 'backend', 'src', 'users', 'users.service.ts'), 'utf8');
  });

  it('dev watches Forge files and recompiles on change', { timeout: 20000 }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forge-cli-dev-'));
    await mkdir(path.join(root, 'contracts'));
    await writeFile(path.join(root, 'forge.config.json'), JSON.stringify({
      contracts: 'contracts/**/*.forge',
      output: 'generated',
      targets: ['typescript']
    }), 'utf8');
    const contractPath = path.join(root, 'contracts', 'user.forge');
    await writeFile(
      contractPath,
      `contract User {
  id: uuid
}
`,
      'utf8'
    );

    const child = spawn(process.execPath, [cliPath, 'dev'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const output = collectOutput(child);

    try {
      await waitForOutput(output, text => text.includes('Initial compile succeeded') && text.includes('Watching . for Forge changes'));
      await sleep(250);
      await writeFile(
        contractPath,
        `contract User {
  id: uuid
  email: string
}
`,
        'utf8'
      );
      await waitForOutput(output, text => text.includes('Change detected: contracts/user.forge') && text.includes('Recompile succeeded'));

      const generated = await readFile(path.join(root, 'generated', 'typescript', 'User.ts'), 'utf8');
      assert.match(generated, /email: string;/);
    } finally {
      child.kill();
    }
  });
});

function collectOutput(child) {
  const state = { text: '' };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    state.text += chunk;
  });
  child.stderr.on('data', chunk => {
    state.text += chunk;
  });
  return state;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function writeFakePrisma(root) {
  const fakePrisma = path.join(root, 'fake-prisma.mjs');
  await writeFile(
    fakePrisma,
    `import { writeFileSync } from 'node:fs';
writeFileSync('prisma-args.json', JSON.stringify(process.argv.slice(2)));
console.log('fake prisma ok');
`,
    'utf8'
  );
  return fakePrisma;
}

function waitForOutput(output, predicate, timeoutMs = 8000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (predicate(output.text)) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for CLI output. Current output:\n${output.text}`));
      }
    }, 50);
  });
}
