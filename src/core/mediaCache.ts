import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { paths } from '../config.ts';

/**
 * Private preservation cache for formation photos — mirrors RawCache's
 * shape (core/cache.ts) but stores images instead of HTML, converted to
 * WebP for compact storage. Never read by the export pipeline or served by
 * `serve` — this exists purely so a source site disappearing doesn't mean
 * losing the photo. See config.ts's mediaPolicy comment for why this is
 * kept separate from any future *public* thumbnail feature.
 */
export class MediaCache {
  private readonly dir: string;

  constructor(sourceKey: string) {
    this.dir = path.join(paths.mediaDir, sourceKey);
  }

  private locate(url: string): { absolutePath: string; relativePath: string } {
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 16);
    const filename = `${hash}.webp`;
    return {
      absolutePath: path.join(this.dir, filename),
      // Relative to data/, forward-slashed regardless of OS so the path
      // stored in the database stays portable if data/ is copied elsewhere.
      relativePath: `media/${path.basename(this.dir)}/${filename}`,
    };
  }

  /** Already-archived path for this URL, or null if not yet cached. */
  async has(url: string): Promise<string | null> {
    const { absolutePath, relativePath } = this.locate(url);
    try {
      await access(absolutePath);
      return relativePath;
    } catch {
      return null;
    }
  }

  /** Encodes `imageBytes` as WebP and writes it to the cache. */
  async put(url: string, imageBytes: Buffer): Promise<{ absolutePath: string; relativePath: string }> {
    const { absolutePath, relativePath } = this.locate(url);
    await mkdir(this.dir, { recursive: true });
    const webp = await sharp(imageBytes).webp({ quality: 92 }).toBuffer();
    await writeFile(absolutePath, webp);
    return { absolutePath, relativePath };
  }
}
