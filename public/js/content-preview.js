/* El borrador privado solo se lee al abrir una vista previa explícita. */
(() => {
  const preview = new URLSearchParams(location.search).get('vista_previa') === '1';
  window.webContentFetch = async () => {
    const response = await fetch('/api/content');
    if (!preview || !response.ok) return response;
    const body = await response.json();
    try {
      let raw = sessionStorage.getItem('web-preview-changes');
      // Una pestaña nueva con noopener no hereda sessionStorage. Lee el borrador privado
      // mediante la sesión existente, nunca mediante un token en la URL.
      if(raw === null) {
        const token = localStorage.getItem('token');
        if(!token) throw new Error('Sin sesión para previsualizar');
        const r = await fetch('/api/content/editor',{headers:{Authorization:'Bearer '+token}});
        const editor = await r.json();
        if(!r.ok || !editor.ok) throw new Error('No se pudo recuperar el borrador');
        body.data = editor.data || {};
        raw = JSON.stringify(editor.borrador?.cambios || {});
      }
      const cambios = JSON.parse(raw);
      body.data = { ...body.data };
      for (const [key,value] of Object.entries(cambios)) { if(value===null) delete body.data[key]; else body.data[key]=value; }
    } catch { window.webPreviewError = true; const badge=document.getElementById('webPreviewBadge'); if(badge)badge.textContent='No se pudo cargar el borrador · mostrando la web publicada'; }
    return new Response(JSON.stringify(body), {headers:{'Content-Type':'application/json'}});
  };
  if (preview) {
    document.addEventListener('click', e => {
      const a=e.target.closest('a[href]'); if(!a || e.defaultPrevented) return;
      const url=new URL(a.href,location.href);
      if(url.origin===location.origin && /^\/(index|local|locales|nosotros|eventos|trabaja)\.html$/.test(url.pathname)) {url.searchParams.set('vista_previa','1');a.href=url.href;}
    },true);
    document.addEventListener('submit', e => { e.preventDefault(); e.stopImmediatePropagation(); alert('Vista previa: los formularios no se envían.'); }, true);
    document.addEventListener('DOMContentLoaded', () => {
      const badge=document.createElement('div'); badge.id='webPreviewBadge'; badge.textContent=window.webPreviewError ? 'No se pudo cargar el borrador · mostrando la web publicada' : 'Vista previa · contenido sin publicar';
      badge.style.cssText='position:fixed;bottom:8px;left:8px;z-index:99999;background:#172b26;color:white;border-radius:8px;padding:8px 12px;font:13px system-ui;pointer-events:none';
      document.body.appendChild(badge);
      window.addEventListener('load',()=>{if(window.webPreviewError)badge.textContent='No se pudo cargar el borrador · mostrando la web publicada';});
    });
  }
})();
