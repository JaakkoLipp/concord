import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Short generated video and audio clips, made with the local ffmpeg. */
export async function makeClips(): Promise<{ video: Uint8Array; audio: Uint8Array }> {
  const dir = await mkdtemp(join(tmpdir(), 'concord-seed-'));
  try {
    const video = join(dir, 'clip.mp4');
    const audio = join(dir, 'clip.ogg');
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=4',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', '-movflags', '+faststart', video]);
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6', '-c:a', 'libvorbis', audio]);
    return { video: await readFile(video), audio: await readFile(audio) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
