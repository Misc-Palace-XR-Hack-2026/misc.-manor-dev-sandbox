import { MAX_PHOTO_EDGE, validPhotoData } from '../core/photos';
/** Decode locally, flatten to JPEG, resize and discard original bytes/metadata. */
export async function preparePhoto(file: File): Promise<string> {
 if(!['image/jpeg','image/png'].includes(file.type)) throw new Error('Choose a PNG or JPEG photo. SVG and remote images are not supported.');
 if(file.size>12*1024*1024) throw new Error('Photo exceeds the 12 MB upload limit.');
 const bitmap=await createImageBitmap(file);
 try {
  if(bitmap.width*bitmap.height>32_000_000) throw new Error('Photo exceeds 32 megapixels. Resize it first.');
  const scale=Math.min(1,MAX_PHOTO_EDGE/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx) throw new Error('Image processing is unavailable.');
  ctx.fillStyle='#f3ead6';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL('image/jpeg',.82);
  if(!validPhotoData(data)) throw new Error('Photo is still too large to save. Choose a smaller image.');
  return data;
 } finally { bitmap.close(); }
}
