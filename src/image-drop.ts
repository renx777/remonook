import {imageType} from './media.mjs';
import {MAX_UPLOAD_BYTES} from './upload-limits.mjs';
import {previewUrl} from './public-preview-url.mjs';

const raster = /^image\/(png|jpe?g|gif|webp|bmp|avif|tiff?|apng)$/i;
const dataImage = /^data:(image\/(?:png|jpe?g|gif|webp|bmp|avif|tiff?|apng));base64,([\w+/=]+)$/i;

export function mayDropImage(transfer: DataTransfer) {
  return transfer.types.includes('Files') ||
    transfer.types.includes('text/html') ||
    transfer.types.includes('text/uri-list');
}

/** Read synchronously while the browser still exposes the drag data store. */
export function droppedImage(transfer: DataTransfer): File[] | string | null {
  const isImage = (file: File) => !!imageType(file.name, file.type);
  const files = Array.from(transfer.files).filter(isImage);
  if (files.length) return files;
  const items = Array.from(transfer.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => !!file && isImage(file));
  if (items.length) return items;

  const html = transfer.getData('text/html');
  if (html && html.length <= MAX_UPLOAD_BYTES * 1.4) {
    // Template contents are inert. Never mount markup from the drag source.
    const template = document.createElement('template');
    template.innerHTML = html;
    const source = template.content.querySelector('img')?.getAttribute('src')?.trim();
    if (source) return source;
  }
  const url = transfer.getData('text/uri-list').split(/\r?\n/).find(line => line && !line.startsWith('#'));
  if (!url) return null;
  try { return imageType(new URL(url).pathname) ? url : null; }
  catch { return null; }
}

export async function fetchDroppedImage(source: string, signal: AbortSignal): Promise<File> {
  if (source.startsWith('data:')) {
    if (source.length > MAX_UPLOAD_BYTES * 1.4) throw Error('This image is over 2 MB.');
    const match = dataImage.exec(source);
    if (!match) throw Error('Save this image as a PNG or JPEG, then drop the file.');
    const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
    if (bytes.length > MAX_UPLOAD_BYTES) throw Error('This image is over 2 MB.');
    return new File([bytes], 'Dropped image.' + match[1].split('/')[1], {type:match[1]});
  }

  let url: URL;
  try { url = previewUrl(source); }
  catch { throw Error('This app only shared a private image link. Save the picture, then drop the file.'); }
  let response: Response;
  try { response = await fetch(url, {credentials:'omit', referrerPolicy:'no-referrer', signal}); }
  catch (error) {
    if (signal.aborted) throw error;
    throw Error('The source blocked this image download. Save the picture, then drop the file.');
  }
  const mime = response.headers.get('content-type')?.split(';')[0] || '';
  if (!response.ok || !raster.test(mime) || !response.body) {
    await response.body?.cancel();
    throw Error('The source did not supply a supported image. Save the picture, then drop the file.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw Error('This image is over 2 MB.');
      }
      chunks.push(Uint8Array.from(value));
    }
  } finally { reader.releaseLock(); }
  if (!size) throw Error('The image download was empty.');
  const name = url.pathname.split('/').pop();
  return new File(chunks, name && imageType(name) ? name : 'Dropped image.'+mime.split('/')[1], {type:mime});
}
