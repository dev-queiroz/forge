import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GeneratedFile } from './generator.js';

export async function writeNestProject(outputDir: string, files: GeneratedFile[]): Promise<void> {
  for (const file of files) {
    const targetPath = path.join(outputDir, file.path);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, file.content, 'utf8');
  }
}
