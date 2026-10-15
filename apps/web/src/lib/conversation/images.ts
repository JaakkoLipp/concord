/**
 * Copy and save for an image in a message (m4.5-plan.md task 2). Both read the image as shown, which comes from
 * our own origin through Stoat's file server or January's proxy, so no third party sees the request.
 */

async function blobOf(src: string): Promise<Blob> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`image: ${res.status}`);
  return res.blob();
}

/** Browsers copy only PNG images, so anything else, a GIF's first frame included, is drawn into one first. */
async function asPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

export async function copyImage(src: string): Promise<void> {
  // The promise goes in at once, so Safari still counts the click as the gesture that allows writing.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOf(src).then(asPng) })]);
}

export async function saveImage(src: string, name: string): Promise<void> {
  const url = URL.createObjectURL(await blobOf(src));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
