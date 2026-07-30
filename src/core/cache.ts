import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../config.ts';
import type { FetchMode } from './types.ts';

export interface CacheMeta {
  url: string;
  fetchedAt: string;
  httpStatus: number;
  fetchMode: FetchMode;
  waybackTimestamp?: string;
}

export interface CacheEntry {
  html: string;
  meta: CacheMeta;
  htmlPath: string;
}

function slugify(url: string): string {
  const { pathname } = new URL(url);
  const slug = pathname
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/\/+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (slug || 'index').slice(0, 80);
}

export class RawCache {
  private readonly dir: string;

  constructor(connectorId: string) {
    this.dir = path.join(paths.rawDir, connectorId);
  }

  private locate(url: string): { htmlPath: string; metaPath: string } {
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 12);
    const base = `${hash}__${slugify(url)}`;
    return {
      htmlPath: path.join(this.dir, `${base}.html`),
      metaPath: path.join(this.dir, `${base}.meta.json`),
    };
  }

  async get(url: string): Promise<CacheEntry | null> {
    const { htmlPath, metaPath } = this.locate(url);
    try {
      const [html, metaRaw] = await Promise.all([
        readFile(htmlPath, 'utf-8'),
        readFile(metaPath, 'utf-8'),
      ]);
      return { html, meta: JSON.parse(metaRaw) as CacheMeta, htmlPath };
    } catch {
      return null;
    }
  }

  async put(url: string, html: string, meta: Omit<CacheMeta, 'url'>): Promise<CacheEntry> {
    const { htmlPath, metaPath } = this.locate(url);
    await mkdir(this.dir, { recursive: true });
    const fullMeta: CacheMeta = { url, ...meta };
    await Promise.all([
      writeFile(htmlPath, html, 'utf-8'),
      writeFile(metaPath, JSON.stringify(fullMeta, null, 2), 'utf-8'),
    ]);
    return { html, meta: fullMeta, htmlPath };
  }
}
