// Render PDFs ourselves because many mobile browsers do not embed PDF files.
export async function openMaterialPreview({file,url,name,mime}) {
  const overlay=document.createElement('section');overlay.className='material-preview';overlay.role='dialog';overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',name || '材料预览');
  const header=document.createElement('header'),title=document.createElement('strong'),close=document.createElement('button'),body=document.createElement('div'),status=document.createElement('p');
  title.textContent=name || '材料预览';close.textContent='关闭';close.type='button';body.className='material-preview-body';header.append(title,close);body.append(status);overlay.append(header,body);document.body.append(overlay);
  let objectUrl,task,closed=false;
  close.onclick=()=>{closed=true;void task?.destroy();if(objectUrl)URL.revokeObjectURL(objectUrl);overlay.remove();};
  status.textContent='正在加载预览…';
  try {
    const blob=file || await fetch(url).then(response=>{if(!response.ok)throw new Error('无法读取材料');return response.blob();});
    if(closed)return;
    objectUrl=URL.createObjectURL(blob);
    const original=document.createElement('a');original.href=objectUrl;original.target='_blank';original.rel='noopener noreferrer';original.textContent='打开原文件';body.append(original);
    const contentType=mime || blob.type;
    if(contentType==='application/pdf' || /\.pdf$/i.test(name || '')) {
      const pdfjs=await import('../vendor/pdfjs/legacy/build/pdf.js');
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdfjs/legacy/build/pdf.worker.js',import.meta.url).href;
      const base=new URL('../vendor/pdfjs/',import.meta.url).href;
      task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/'});
      const pdf=await task.promise;if(closed){await task.destroy();return;}
      const canvas=document.createElement('canvas'),nav=document.createElement('nav'),previous=document.createElement('button'),next=document.createElement('button'),count=document.createElement('span');
      previous.textContent='上一页';next.textContent='下一页';previous.type=next.type='button';nav.append(previous,count,next);body.append(nav,canvas);let pageNumber=1;
      const render=async()=>{previous.disabled=next.disabled=true;const page=await pdf.getPage(pageNumber);const viewport=page.getViewport({scale:Math.min(2,Math.max(1,window.devicePixelRatio || 1))});canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;status.textContent='';count.textContent=`${pageNumber} / ${pdf.numPages}`;previous.disabled=pageNumber===1;next.disabled=pageNumber===pdf.numPages;};
      const renderPage=()=>render().catch(()=>{if(!closed)status.textContent='此页暂时无法预览，可打开原文件查看。';});
      previous.onclick=()=>{pageNumber--;void renderPage();};next.onclick=()=>{pageNumber++;void renderPage();};await render();
    } else {
      const image=new Image();image.alt=name || '证明材料';image.onload=()=>{status.textContent='';};image.onerror=()=>{status.textContent='当前浏览器无法预览此图片，可打开原文件查看。';};image.src=objectUrl;body.append(image);
    }
  } catch {if(!closed)status.textContent='暂时无法生成预览，请关闭后重试。';}
}
