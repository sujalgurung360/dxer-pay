import archiver from 'archiver';
import { Readable } from 'stream';

/**
 * Create a ZIP buffer from a map of filename -> buffer.
 */
export async function createZip(files: Record<string, Buffer>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    for (const [name, buf] of Object.entries(files)) {
      archive.append(Readable.from(buf), { name });
    }
    archive.finalize();
  });
}
