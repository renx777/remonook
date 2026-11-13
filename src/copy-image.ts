// Copies a picture (not a link) to the clipboard. Clipboards reliably accept PNG, so other
// formats are converted first. The PNG is passed as a promise so Safari keeps the user's click.
async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('This image could not be copied.')), 'image/png'));
  } finally { bitmap.close?.(); }
}
/** Copies an image to the clipboard. Rejects with a readable message when the browser cannot. */
export async function copyImage(source: Blob | Promise<Blob>) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw Error('This browser cannot copy images. Use Save image instead.');
  const png = Promise.resolve(source).then(toPng);
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]); }
  catch (e) { throw Error(e instanceof Error && /denied|allowed/i.test(e.message) ? 'Copying images was blocked by the browser.' : 'This image could not be copied.'); }
}
/** The image behind an object URL or address, as a Blob. */
export const imageBlob = (url: string) => fetch(url).then(r => { if (!r.ok) throw Error('This image could not be copied.'); return r.blob(); });
