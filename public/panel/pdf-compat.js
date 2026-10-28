// PDF.js usa APIs recientes también dentro del worker. Compatibilidad local
// para Safari sin cambiar la biblioteca ni enviar documentos a otros servicios.
for(const C of [Map,WeakMap]){
 if(!C.prototype.getOrInsertComputed)Object.defineProperty(C.prototype,'getOrInsertComputed',{configurable:true,writable:true,value:function(key,fn){if(this.has(key))return this.get(key);const value=fn(key);this.set(key,value);return value;}});
 if(!C.prototype.getOrInsert)Object.defineProperty(C.prototype,'getOrInsert',{configurable:true,writable:true,value:function(key,value){if(this.has(key))return this.get(key);this.set(key,value);return value;}});
}
if(!Promise.withResolvers)Object.defineProperty(Promise,'withResolvers',{configurable:true,writable:true,value:function(){let resolve,reject;const promise=new this((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}});
if(!Promise.try)Object.defineProperty(Promise,'try',{configurable:true,writable:true,value:function(fn,...args){return new this(resolve=>resolve(fn(...args)));}});
