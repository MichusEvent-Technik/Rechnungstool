(function(){
  const LS={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}},set(k,v){localStorage.setItem(k,JSON.stringify(v));}};
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));

  function migrate(){
    const legacy=LS.get('settings',null);
    let firms=LS.get('firms',[]); if(!Array.isArray(firms)) firms=[];
    if(legacy && (legacy.name||legacy.iban) && !firms.length){
      firms.push({...legacy,id:Date.now()});
      LS.set('firms',firms);
      LS.set('defaultFirmId',firms[0].id);
    }
    let defaultFirmId = LS.get('defaultFirmId', firms[0]?.id||null);
    if(defaultFirmId && !firms.some(f=>String(f.id)===String(defaultFirmId))) defaultFirmId = firms[0]?.id||null;
    return {firms, defaultFirmId};
  }

  const mig=migrate();
  const state={
    firms: LS.get('firms', mig.firms||[]),
    customers: LS.get('customers',[]),
    products: LS.get('products',[]),
    invoices: LS.get('invoices',[]),
    defaultFirmId: mig.defaultFirmId
  };

  function saveFirms(){ LS.set('firms',state.firms); LS.set('defaultFirmId',state.defaultFirmId); }
  function saveCustomers(){ LS.set('customers',state.customers); }
  function saveProducts(){ LS.set('products',state.products); }
  function saveInvoices(){ LS.set('invoices',state.invoices); }
  function setDefaultFirm(id){ state.defaultFirmId=id; saveFirms(); }
  function getDefaultFirm(){ return state.firms.find(f=>String(f.id)===String(state.defaultFirmId)) || state.firms[0] || null; }

  function injectNav(active){
    const el=document.getElementById('site_nav'); if(!el) return;
    el.innerHTML=`<nav class="topnav"><a href="index.html" class="brand">Rechnungstool</a><a href="rechnung-stellen.html" ${active==='erstellen'?'class="active"':''}>Rechnung stellen</a><a href="firmen.html" ${active==='firmen'?'class="active"':''}>Firmen</a><a href="kunden.html" ${active==='kunden'?'class="active"':''}>Kunden</a><a href="produkte.html" ${active==='produkte'?'class="active"':''}>Produkte</a><a href="gespeichert.html" ${active==='gespeichert'?'class="active"':''}>Gespeichert</a><a href="gestellt.html" ${active==='gestellt'?'class="active"':''}>Gestellt</a><a href="bezahlt.html" ${active==='bezahlt'?'class="active"':''}>Bezahlte</a></nav>`;
  }

  function validIBAN(iban){const clean=(iban||'').toUpperCase().replace(/\s+/g,''); if(!/^CH|LI/.test(clean)) return false; if(clean.length!==21) return false; const toDigits=s=>s.replace(/[A-Z]/g,c=>(c.charCodeAt(0)-55)); const r=clean.slice(4)+clean.slice(0,4); let mod=0; for(const ch of toDigits(r)) mod=(mod*10+Number(ch))%97; return mod===1;}

  window.App={LS,$,$$,esc,state,saveFirms,saveCustomers,saveProducts,saveInvoices,setDefaultFirm,getDefaultFirm,injectNav,validIBAN};
})();
(function(){
  const {$} = window.App || {};
  function injectSidebar(active){
    const el=document.getElementById('site_sidebar'); if(!el) return;
    el.innerHTML = `
      <nav class="side">
        <div class="brand">Rechnungstool</div>
        <a href="rechnung-stellen.html" class="navlink ${active==='erstellen'?'active':''}" data-view="create">Rechnung stellen</a>
        <a href="firmen.html" class="navlink ${active==='firmen'?'active':''}" data-view="firm">Firmen</a>
        <a href="kunden.html" class="navlink ${active==='kunden'?'active':''}" data-view="customers">Kunden</a>
        <a href="produkte.html" class="navlink ${active==='produkte'?'active':''}" data-view="products">Produkte</a>
        <a href="gespeichert.html" class="navlink ${active==='gespeichert'?'active':''}" data-view="saved">Gespeichert</a>
        <a href="gestellt.html" class="navlink ${active==='gestellt'?'active':''}" data-view="issued">Gestellt</a>
        <a href="bezahlt.html" class="navlink ${active==='bezahlt'?'active':''}" data-view="paid">Bezahlte</a>
      </nav>
    `;
  }
  // Ensure global App
  if(!window.App) window.App = {};
  window.App.injectSidebar = injectSidebar;
})();