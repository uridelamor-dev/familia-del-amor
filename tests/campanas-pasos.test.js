import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const start=source.indexOf('function openCampana('), end=source.indexOf('async function campEditar(',start);
const editor=source.slice(start,end);
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('const CLAVES_SEGMENTO ='),source.indexOf('// La navegación agrupa')),context);
test('los filtros avanzados siguen presentes al guardar desde los pasos',()=>{
 const keys=vm.runInContext(editor.match(/const HEREDABLES = (\[[\s\S]*?\]);/)[1],context);
 for(const k of ['q','locales','visitas_min','visitas_max','sin_venir_desde','visito_desde','valor_min','nunca_ha_venido','es_nuevo','reservo_from','edad_min']) assert.ok(keys.includes(k),k);
 const seg=context.construirSegmento({locales:['Girona','Blanes'],visitas_min:2,edad_min:30,nunca_ha_venido:true,excluir_telefonos:['demo']});
 assert.equal(seg.locales.length,2);assert.equal(seg.visitas_min,2);assert.equal(seg.edad_min,30);assert.equal(seg.nunca_ha_venido,1);assert.equal(seg.excluir_telefonos[0],'demo');
 assert.doesNotMatch(editor,/\.\.\.heredados, q: f\.q/);
 assert.match(editor,/for \(const k of HEREDABLES\) delete heredados\[k\]/);
});
test('el recuento descarta respuestas de una audiencia antigua',()=>{
 assert.match(editor,/consulta !== consultaDest/);
 assert.match(editor,/firma !== JSON\.stringify\(filtros\(\)\)/);
 assert.match(editor,/if \(mostrar\) pintarDests/);
});
test('el avance solo cambia la pantalla y conserva los controles existentes',()=>{
 const wizard=source.slice(source.indexOf('function marketingPasos('),source.indexOf('function marketingCampo('));
 assert.doesNotMatch(wizard,/apiSend|fetch\(|submit\(/);
 assert.match(wizard,/next\.type = "button"/);
 assert.match(editor,/confirmModal\("¿Enviar esta campaña ahora por WhatsApp/);
 assert.match(editor,/confirmModal\("¿Guardar y enviar ahora por WhatsApp/);
});
