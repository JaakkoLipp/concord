/**
 * Video sizes within the account's tier (client.md section 10.6). voice-ingress checks each video track once,
 * when it is published: width times height at most the tier's area, and width over height within its range.
 * A track over it ends the call as a removal, which never rejoins, so every camera and share is fitted first.
 */
import type { VideoLimit } from '@concord/domain';

export interface Size { width: number; height: number }

/** A camera or share that would be over the account's video tier, which voice-ingress ends the call for. */
export class VideoLimitError extends Error {}

/** Whether a size's aspect ratio is allowed. A range with equal ends is no limit, as in voice-ingress. */
export function aspectAllowed(size: Size, limit: VideoLimit | null): boolean {
  if (!limit || limit.aspect[0] === limit.aspect[1] || !size.height) return true;
  const ratio = size.width / size.height;
  return ratio >= limit.aspect[0] && ratio <= limit.aspect[1];
}

/**
 * The largest size no bigger than `size`, with its aspect ratio, whose area fits the tier: even numbers, which
 * encoders prefer. Null when the tier allows no video or the shape is outside its aspect range.
 */
export function fitTier(size: Size, limit: VideoLimit | null): Size | null {
  if (limit && !limit.enabled) return null;
  if (!aspectAllowed(size, limit)) return null;
  const area = size.width * size.height;
  if (!limit || !limit.area || area <= limit.area) return size;
  const scale = Math.sqrt(limit.area / area);
  const even = (n: number) => Math.max(2, Math.floor((n * scale) / 2) * 2);
  return { width: even(size.width), height: even(size.height) };
}

/** Whether a captured size is within the tier, as voice-ingress will judge it. */
export function withinTier(size: Size, limit: VideoLimit | null): boolean {
  if (!limit) return true;
  if (!limit.enabled) return false;
  return (!limit.area || size.width * size.height <= limit.area) && aspectAllowed(size, limit);
}
