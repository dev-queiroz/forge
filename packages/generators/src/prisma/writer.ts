import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface GeneratedFile {
  path: string;
  content: string;
}

export async function writePrismaSchema(targetDir: string, files: GeneratedFile[]): Promise<void> {
  for (const file of files) {
    const target = path.join(targetDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }
}
