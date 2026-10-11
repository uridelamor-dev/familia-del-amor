// Serializa la toma de control y el envío final de Sara por conversación.
const turnos=new Map();
export async function conTurno(jid,fn){
 const anterior=turnos.get(jid)||Promise.resolve();
 const actual=anterior.catch(()=>{}).then(fn);turnos.set(jid,actual);
 try{return await actual;}finally{if(turnos.get(jid)===actual)turnos.delete(jid);}
}
