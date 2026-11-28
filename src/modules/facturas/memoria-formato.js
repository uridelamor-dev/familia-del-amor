import {normNif} from './emisor.js';
const IMPORTES=['sin_indicacion','neto','bruto'];
const UNIDADES=['sin_indicacion','peso_unidad','envases'];
export function validarFormato(formato) {
 if(formato==null)return null;
 if(!formato||!IMPORTES.includes(formato.importes)||!UNIDADES.includes(formato.unidades))throw new Error('Formato de proveedor no válido');
 if(formato.importes==='sin_indicacion'&&formato.unidades==='sin_indicacion')return null;
 return {importes:formato.importes,unidades:formato.unidades};
}
export function pistasFormato(lecturas=[],confirmadas=[]) {
 const nif=normNif(lecturas[0]?.nif_proveedor);
 if(!nif||lecturas.length<2||!lecturas.every(d=>normNif(d.nif_proveedor)===nif))return [];
 const candidatas=confirmadas.filter(f=>f.autor&&normNif(f.nif)===nif&&f.formato);
 const pistas=[];
 for(const campo of ['importes','unidades']){
  const valores=[...new Set(candidatas.map(f=>f.formato?.[campo]).filter(v=>(campo==='importes'?IMPORTES:UNIDADES).includes(v)&&v!=='sin_indicacion'))];
  // Una discrepancia entre confirmaciones no se resuelve eligiendo la más frecuente.
  if(valores.length===1)pistas.push({campo,valor:valores[0],fuentes:candidatas.filter(f=>f.formato?.[campo]===valores[0]).map(f=>String(f.recepcion_id)).filter(id=>/^\d+$/.test(id)).slice(0,5)});
 }
 return pistas;
}
export function instruccionesFormato(pistas=[]) {
 const textos={neto:'En documentos confirmados de este emisor la columna importe ya incluye el descuento. Comprueba si este original usa el mismo formato antes de aplicar nada.',bruto:'En documentos confirmados de este emisor aparecen importe bruto y neto por separado. Lee ambos y comprueba el descuento.',peso_unidad:'En documentos confirmados se distingue peso y unidades. Lee la unidad impresa de cada fila.',envases:'En documentos confirmados aparecen cajas o envases. Busca el contenido literal por envase y la unidad a la que corresponde el precio.'};
 return pistas.length?'\nPISTAS DE FORMATO CONFIRMADAS POR UNA PERSONA (no son datos de esta compra): '+pistas.map(p=>textos[p.valor]||'').filter(Boolean).join(' ')+' Nunca rellenes importes, tamaños ni unidades ausentes con estas pistas. Si el documento contradice la memoria, manda el original.':'';
}

const PLANTILLAS_FISCALES = {
 B67210948:'DDI: Dto en euros cuando así se imprime. Si S.L. 4,06 € figura como cargo repercutido, inclúyelo una vez como línea separada de la base al 21 %. Revisa P.V., I.P. e I.A. y todas las filas de IVA. En promociones, conserva el cero explícito; no calcules un importe con el precio de tarifa.',
 B86561412:'Coca-Cola: distingue nota de entrega de factura. Contrasta descuento fijo y neto. SUBUNIDADES no es un producto extra. IBEE y Punto Verde solo se suman si constan como cargos repercutidos separados y el original lo cuadra.',
 B08485005:'SERHS: busca el número CV326/… en la cabecera. Comprueba si IBEE y Punto Verde ya están incluidos en los importes. Lee todas las bases y tipos impresos.',
 B17070327:'Nova Costasalt: E junto al descuento indica euros. Respeta devoluciones de envase negativas y separa logística y cargos de pie que se repercutan literalmente.',
 B17097593:'Amat: busca el número M26/… en la cabecera del documento y comprueba el emisor en el pie, separado del NIF del cliente.',
 B60599461:'Cerezo: lee Nº Documento 81… y excluye el número de transporte. Usa kilos cuando sean la cantidad facturada. Si el IVA no está impreso, no lo proporciones.',
 '39373661F':'Grupo Cárnico: comprueba el número S1.… y distingue la identidad fiscal del nombre comercial.',
 B01824929:'Carrion / Tallatemps: busca el número de cabecera largo. Lote y trazabilidad son referencias, no cantidades.',
};

const PLANTILLAS_POR_NOMBRE = [
 [/\b(transgourmet|gros mercat)\b/, 'Busca FACTURA y su número de 15 dígitos cuando ese formato se vea. Lee TOTAL SENSE IVA y Data venciment solo si están impresos. Import pendent no es un producto.'],
 [/\bbon pa\b/, 'Busca Nº albarán. El 4218 es un código de cliente. Distingue bruto y neto. La columna de IVA no es descuento.'],
 [/\bkiku\b/, 'QUANTITAT en kg es la cantidad facturada. Bultos es otro campo. Busca número 1-… y excluye cliente 10074.'],
 [/\bgrau\b/, 'Lee Ampolles cuando el precio sea por botella. El recargo por fracción puede formar parte de la base si está repercutido. Usa VTOS solo si figura.'],
 [/\bgilmar\b/, 'Distingue caducidad y vencimiento del documento. Portes repercutidos se leen separados. Evita descontar un neto dos veces.'],
 [/\btupinamba\b/, 'Lee el descuento porcentual de cada línea y confirma el orden día/mes en la fecha literal.'],
 [/\b(repsol|bellod)\b/, 'I.H. y SCRAP informativos no se suman a los cargos.'],
 [/\bgran reino\b/, 'Verifica el NIE de la cabecera y si los precios impresos incluyen IVA.'],
];

export function instruccionesPlantillaProveedor(lecturas) {
 const [primera, segunda] = lecturas;
 const nif = normNif(primera?.nif_proveedor);
 if (!nif || nif !== normNif(segunda?.nif_proveedor)) return '';
 const nombre = d => String(d?.proveedor || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const regla = PLANTILLAS_FISCALES[nif] ||
  PLANTILLAS_POR_NOMBRE.find(([patron]) => patron.test(nombre(primera)) && patron.test(nombre(segunda)))?.[1];
 return regla ? '\nPAUTA DE FORMATO: ' + regla + ' Respeta el original. Las pautas nunca completan datos ausentes ni sustituyen la identidad del emisor.' : '';
}
