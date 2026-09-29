"""Usage: python3 scripts/generar-geografia.py /path/ES.txt (GeoNames postal dump)."""
import sys,json,unicodedata,pathlib
from collections import defaultdict
root=pathlib.Path(__file__).resolve().parents[1]
def norm(s): return ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if not unicodedata.combining(c))
rows=[x.split('\t') for x in pathlib.Path(sys.argv[1]).read_text().splitlines()]
ids={(r[6],norm(r[7])):r[8] for r in rows if r[8]}
groups=defaultdict(list)
for r in rows:
    key=r[8] or ids.get((r[6],norm(r[2]))) or r[6]+':'+norm(r[2])
    groups[key].append(r)
out=[]
for key,rs in groups.items():
    name=next((r[7] for r in rs if r[7]),rs[0][2])
    central=[r for r in rs if norm(r[2])==norm(name)] or rs
    out.append(dict(id=key,nombre=name,provincia=rs[0][5],lat=round(sum(float(r[9]) for r in central)/len(central),5),lon=round(sum(float(r[10]) for r in central)/len(central),5),cp=sorted(set(r[1] for r in rs)),alias=sorted(set(r[2] for r in rs))))
(root/'src/data/poblaciones-es.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
print(len(out),'poblaciones')
