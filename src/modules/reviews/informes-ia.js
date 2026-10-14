// La salida es un objeto de herramienta, nunca prosa que haya que convertir a JSON.
const tema = {
  type:'object', additionalProperties:false, required:['tema','ids'],
  properties:{tema:{type:'string'},ids:{type:'array',minItems:1,items:{type:'string'}}}
};
export const TEMAS_TOOL = {
  name:'resumir_resenas',description:'Entrega los temas y las referencias exactas que los respaldan. Usa listas vacías cuando no haya temas.',
  input_schema:{type:'object',additionalProperties:false,required:['positivos','negativos'],properties:{
    positivos:{type:'array',maxItems:3,items:tema},negativos:{type:'array',maxItems:3,items:tema}
  }}
};
export async function analizarInformeIA(ai,{system,messages}) {
  for(const max_tokens of [4000,8000]) {
    const response=await ai.messages.create({model:'claude-haiku-4-5-20251001',max_tokens,system,messages,
      tools:[TEMAS_TOOL],tool_choice:{type:'tool',name:TEMAS_TOOL.name}});
    if(response.stop_reason==='max_tokens')continue;
    const blocks=(response.content || []).filter(b=>b.type==='tool_use' && b.name===TEMAS_TOOL.name);
    if(blocks.length!==1 || response.stop_reason!=='tool_use')throw Error('Análisis incompleto');
    const data=blocks[0].input;
    if(!data || !Array.isArray(data.positivos) || !Array.isArray(data.negativos))throw Error('Análisis incompleto');
    return data; // Las referencias se validan contra las reseñas originales en analizarTemas.
  }
  throw Error('Análisis incompleto');
}
