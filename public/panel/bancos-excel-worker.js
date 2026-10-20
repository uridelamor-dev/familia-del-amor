/* El archivo se interpreta en el navegador; no se envía a servicios externos. */
importScripts('/vendor/sheetjs/xlsx.full.min.js');
self.onmessage=({data})=>{
 try{
  const libro=XLSX.read(data,{type:'array',cellNF:true,cellFormula:true,sheetRows:10003});
  const hojas=libro.SheetNames.map(nombre=>{
   const hoja=libro.Sheets[nombre],ref=hoja['!fullref']||hoja['!ref'];if(!ref)return {nombre,texto:''};
   const rango=XLSX.utils.decode_range(ref);
   if(rango.e.r>10001||rango.e.c>99)throw Error('Excel demasiado grande. Exporta un mes por cuenta (máximo 10.000 movimientos y 100 columnas).');
   const filas=[];
   for(let r=0;r<=rango.e.r;r++){
    const fila=[];
    for(let c=0;c<=rango.e.c;c++){
     const celda=hoja[XLSX.utils.encode_cell({r,c})];let v='';
     if(celda){
      if(celda.f)throw Error('El Excel contiene fórmulas. Descarga el extracto original del banco sin fórmulas.');
      if(celda.t==='e')throw Error('El Excel contiene una celda con error.');
      v=celda.v??'';
      if(celda.t==='n'&&XLSX.SSF.is_date(celda.z||'')){
       const d=XLSX.SSF.parse_date_code(v,{date1904:!!libro.Workbook?.WBProps?.date1904});
       if(!d)throw Error('Fecha de Excel no válida.');
       v=`${String(d.d).padStart(2,'0')}/${String(d.m).padStart(2,'0')}/${d.y}`;
      }else if(celda.t==='n')v=String(v).replace('.',',');
     }
     fila.push('"'+String(v).replaceAll('"','""')+'"');
    }
    filas.push(fila.join(';'));
   }
   const texto=filas.join('\n');if(new TextEncoder().encode(texto).length>2000000)throw Error('Demasiados datos. Exporta un mes por cuenta.');
   return {nombre,texto};
  }).filter(h=>h.texto);
  if(!hojas.length)throw Error('El Excel no contiene datos.');
  self.postMessage({hojas});
 }catch(e){self.postMessage({error:'No se pudo leer el Excel. '+e.message});}
};
