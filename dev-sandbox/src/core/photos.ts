// Embedded raster images only. Never hand arbitrary imported URLs to a texture loader.
export const MAX_PHOTO_DATA = 1_500_000;
export const MAX_PHOTO_EDGE = 1024;
export function photoDimensions(data: unknown): {width:number;height:number} | null {
 if(typeof data!=='string' || data.length>MAX_PHOTO_DATA) return null;
 const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
 if(!match || match[2].length%4!==0) return null;
 try {
  const raw=atob(match[2]);
  const u8=(i:number)=>raw.charCodeAt(i);
  const u16=(i:number)=>u8(i)*256+u8(i+1);
  const u32=(i:number)=>u16(i)*65536+u16(i+2);
  if(match[1]==='png'){
   if(!raw.startsWith('\x89PNG\r\n\x1a\n') || raw.slice(12,16)!=='IHDR' || raw.length<33) return null;
   return {width:u32(16),height:u32(20)};
  }
  if(u16(0)!==0xffd8) return null;
  for(let i=2;i<raw.length-8;){
   if(u8(i)!==255) return null;
   const marker=u8(i+1);const length=u16(i+2);
   if([0xc0,0xc1,0xc2].includes(marker)) return {height:u16(i+5),width:u16(i+7)};
   if(length<2 || !Number.isFinite(length)) return null;
   i+=2+length;
  }
 } catch { return null; }
 return null;
}
export function validPhotoData(data: unknown): data is string {
 const d=photoDimensions(data);
 return Boolean(d && d.width>0 && d.height>0 && d.width<=MAX_PHOTO_EDGE && d.height<=MAX_PHOTO_EDGE);
}
