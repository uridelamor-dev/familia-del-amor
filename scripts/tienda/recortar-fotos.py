"""Recorte determinista: conserva la fotografía, elimina solo blanco conectado al borde."""
from pathlib import Path
from PIL import Image
from collections import deque
import json
ROOT=Path(__file__).resolve().parents[2]
records=json.loads((ROOT/'docs/tienda/imagenes-reales.json').read_text())
for record in records:
    source=ROOT/'.tienda-demo/fotos-originales'/f"{record['id']}.img"
    if not source.exists(): continue
    im=Image.open(source).convert('RGBA')
    im.thumbnail((1200,1200),Image.Resampling.LANCZOS)
    w,h=im.size; pix=im.load(); visited=bytearray(w*h); queue=deque()
    def visit(x,y):
        k=y*w+x
        if visited[k]: return
        visited[k]=1
        r,g,b,a=pix[x,y]
        if a<12 or (min(r,g,b)>238 and max(r,g,b)-min(r,g,b)<20): queue.append((x,y))
    for x in range(w): visit(x,0);visit(x,h-1)
    for y in range(h): visit(0,y);visit(w-1,y)
    while queue:
        x,y=queue.popleft();r,g,b,a=pix[x,y];pix[x,y]=(r,g,b,0)
        if x:visit(x-1,y)
        if x+1<w:visit(x+1,y)
        if y:visit(x,y-1)
        if y+1<h:visit(x,y+1)
    bounds=im.getchannel('A').getbbox()
    if bounds: im=im.crop(bounds)
    im.thumbnail((960,960),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(im.width+32,im.height+32));canvas.paste(im,(16,16))
    dest=ROOT/'public/tienda/images'/f"{record['id']}-cutout.png"
    canvas.save(dest,optimize=True)
    record['asset']=str(dest.relative_to(ROOT));record['editing']='Recorte del margen y eliminación del fondo blanco conectado al borde. Sin generación de imagen.'
(ROOT/'docs/tienda/imagenes-reales.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
print('Recortadas',len(records),'fotografías')
