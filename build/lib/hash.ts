import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function sha256Hex(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function sha256File(absPath: string): string {
  return sha256Hex(readFileSync(absPath));
}
