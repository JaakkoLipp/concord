import type { FileRef } from '@concord/domain';
import { clean, type WFile } from './wire.ts';

export function mapFile(f: WFile): FileRef;
export function mapFile(f: WFile | null | undefined): FileRef | undefined;
export function mapFile(f: WFile | null | undefined): FileRef | undefined {
  if (!f) return undefined;
  const m = f.metadata;
  const base: FileRef = {
    id: f._id, tag: f.tag, filename: f.filename, contentType: f.content_type, size: f.size,
    kind: m.type === 'Image' ? 'image' : m.type === 'Video' ? 'video' : m.type === 'Audio' ? 'audio' : m.type === 'Text' ? 'text' : 'file',
  };
  if (m.type === 'Image' || m.type === 'Video') {
    base.width = m.width;
    base.height = m.height;
  }
  if (m.type === 'Image') {
    if (m.thumbhash) base.thumbhash = m.thumbhash;
    if (m.animated) base.animated = true;
  }
  return clean(base);
}

/** Autumn serves every file at /autumn/<tag>/<id> on our own origin (dev-environment section 3). */
export function fileUrl(f: FileRef, opts: { maxSide?: number } = {}): string {
  const url = `/autumn/${f.tag}/${f.id}`;
  return opts.maxSide ? `${url}?max_side=${opts.maxSide}` : url;
}
