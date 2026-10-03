import {prepareJpegEvidence} from './photo-originals.js';
// Mobile pickers sometimes report an empty or generic MIME type. Identify the
// actual file header before declaring bytes to the upload API.
export async function prepareApplicationFile(file) {
  if(!file.size || file.size>10*1024*1024)throw new Error('材料必须为 10 MB 以内的文件。');
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const ascii=String.fromCharCode(...bytes);
  let mime=bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes[0]===137&&ascii.slice(1,4)==='PNG'?'image/png':ascii.startsWith('%PDF-')?'application/pdf':ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP'?'image/webp':null;
  let blob=file;
  if(mime==='image/jpeg')blob=await prepareJpegEvidence(file);
  if(!mime) {
    if(!String(file.type).startsWith('image/')&&!/\.(heic|heif|avif|gif|bmp|tiff?)$/i.test(file.name || ''))throw new Error('请选择照片或 PDF 材料。');
    const url=URL.createObjectURL(file);
    try {
      const image=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('此图片格式无法在当前设备转换，请导出为 JPEG、PNG 或 PDF。'));image.src=url;});
      const ratio=Math.min(1,4096/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*ratio);canvas.height=Math.round(image.naturalHeight*ratio);
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('图片转换失败，请重新选择。')),'image/jpeg',.92));mime='image/jpeg';
    }finally{URL.revokeObjectURL(url);}
  }
  const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[mime];
  return new File([blob],(file.name || 'proof').replace(/\.[^.]+$/,'')+'.'+extension,{type:mime,lastModified:file.lastModified});
}
