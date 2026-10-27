// Visor compartido: las peticiones autenticadas las realiza la página anfitriona.
let lib;
async function pdfLib(){if(!lib){lib=await import('/vendor/pdfjs/build/pdf.mjs');lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/build/pdf.worker.mjs';}return lib;}
export async function visorPdf(host,bytes,{posicion=null,colocar=false,onChange=()=>{}}={}){
 const api=await pdfLib(),task=api.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableWorkerRendering:true,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'}),pdf=await task.promise;
 host.innerHTML='<div class="doc-pdf-nav"><button type="button" data-prev>‹ Anterior</button><span aria-live="polite"></span><button type="button" data-next>Siguiente ›</button></div><div class="doc-pdf-sheet"><canvas></canvas><div class="doc-sign-zone" hidden>Firma del trabajador</div></div>';
 let pagina=posicion?.pagina||1,actual=posicion,busy=false,destroyed=false;
 const sheet=host.querySelector('.doc-pdf-sheet'),canvas=host.querySelector('canvas'),box=host.querySelector('.doc-sign-zone');
 function zona(){box.hidden=!actual||actual.pagina!==pagina;if(actual){box.style.left=actual.x*100+'%';box.style.top=actual.y*100+'%';box.style.width=actual.ancho*100+'%';box.style.height=actual.alto*100+'%';}}
 async function pintar(){if(destroyed)return;busy=true;host.querySelectorAll('button').forEach(b=>b.disabled=true);try{const page=await pdf.getPage(pagina),v=page.getViewport({scale:1}),scale=Math.min(1.6,1000/v.width),viewport=page.getViewport({scale});canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;zona();host.querySelector('span').textContent=`Página ${pagina} de ${pdf.numPages}`;}finally{busy=false;host.querySelector('[data-prev]').disabled=pagina===1;host.querySelector('[data-next]').disabled=pagina===pdf.numPages;}}
 host.querySelector('[data-prev]').onclick=async()=>{if(!busy){pagina--;await pintar();}};host.querySelector('[data-next]').onclick=async()=>{if(!busy){pagina++;await pintar();}};
 if(colocar){sheet.classList.add('is-placing');sheet.onclick=e=>{if(busy)return;const r=canvas.getBoundingClientRect(),ancho=.32,alto=.10;actual={pagina,x:Math.max(0,Math.min(1-ancho,(e.clientX-r.left)/r.width-ancho/2)),y:Math.max(0,Math.min(1-alto,(e.clientY-r.top)/r.height-alto/2)),ancho,alto};zona();onChange({...actual});};}
 await pintar();return {get posicion(){return actual;},destroy:()=>{destroyed=true;task.destroy();}};
}
export function capturarFirma(canvas){
 canvas.width=800;canvas.height=240;let trazos=[],actual=null;const ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#183c32';
 const punto=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
 canvas.onpointerdown=e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);actual=[punto(e)];trazos.push(actual);};
 canvas.onpointermove=e=>{if(!actual)return;e.preventDefault();if(trazos.reduce((n,t)=>n+t.length,0)>=2000)return;const p=punto(e),a=actual.at(-1);if(Math.hypot(p[0]-a[0],p[1]-a[1])<.002)return;actual.push(p);ctx.beginPath();ctx.moveTo(a[0]*800,a[1]*240);ctx.lineTo(p[0]*800,p[1]*240);ctx.stroke();};
 canvas.onpointerup=canvas.onpointercancel=()=>{actual=null;trazos=trazos.filter(t=>t.length>1);};
 return {get trazos(){return trazos;},limpiar(){trazos=[];actual=null;ctx.clearRect(0,0,800,240);}};
}
