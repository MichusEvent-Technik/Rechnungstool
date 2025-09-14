document.addEventListener('DOMContentLoaded',()=>{
// --- Storage Helper ---
const LS={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){console.warn('LS.set failed',e);}}};

// Migration: altes single settings -> firms
const legacy=LS.get('settings',{name:'',iban:'',street:'',no:'',zip:'',city:'',country:'CH'});
let firms=LS.get('firms',[]);if(!Array.isArray(firms))firms=[];
if(!firms.length&&(legacy.name||legacy.iban)){firms.push({...legacy,id:Date.now()});LS.set('firms',firms);LS.set('defaultFirmId',firms[0].id);} // first becomes default
let defaultFirmId=LS.get('defaultFirmId',firms[0]?.id||null);
if(defaultFirmId&&!firms.some(f=>f.id===defaultFirmId))defaultFirmId=firms[0]?.id||null;

// New: migrate/add per-firm invoice sequence (year + counter)
(function(){
  const y=new Date().getFullYear();
  let changed=false;
  firms.forEach(f=>{
    if(f.invoiceSeqYear==null){f.invoiceSeqYear=y;changed=true;}
    if(f.invoiceSeqCounter==null){f.invoiceSeqCounter=1;changed=true;}
  });
  if(changed){LS.set('firms',firms);LS.set('defaultFirmId',defaultFirmId);} // persist silently
})();

// Data
const customers=LS.get('customers',[]);const products=LS.get('products',[]);const invoices=LS.get('invoices',[]);let editingInvoiceId=null;
let editingFirmIndex=null;

// DOM helpers
const $=s=>document.querySelector(s);const $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
const fmtCHF=n=>`CHF\u00A0${Number(n||0).toFixed(2)}`;

// Helpers: invoice number generation per firm
function nextInvoiceNoForFirm(f){
  if(!f) return '';
  const y=new Date().getFullYear();
  const seq=(f.invoiceSeqYear===y? (f.invoiceSeqCounter||1) : 1);
  return `${y}-${String(seq).padStart(3,'0')}`;
}
function consumeInvoiceNoForFirm(f){
  const y=new Date().getFullYear();
  if(f.invoiceSeqYear!==y){ f.invoiceSeqYear=y; f.invoiceSeqCounter=1; }
  const no=`${y}-${String(f.invoiceSeqCounter||1).padStart(3,'0')}`;
  f.invoiceSeqCounter=(f.invoiceSeqCounter||1)+1;
  saveFirms();
  return no;
}

// Navigation
const VIEWS=['create','firm','customers','products','saved','issued','paid'];
function showView(n){
  VIEWS.forEach(v=>$('#view-'+v)?.classList.toggle('hidden',v!==n));
  $$('.navlink').forEach(b=>b.classList.toggle('active',b.dataset.view===n));
  if(n==='saved'){renderSavedInvoices();}
  if(n==='issued'){renderIssuedInvoices();}
  if(n==='paid'){renderPaidInvoices();}
}
$('.sidebar')?.addEventListener('click',e=>{const b=e.target.closest('.navlink');if(b)showView(b.dataset.view);});showView('create');

// Generic table sorting function
function setupTableSorting(tableId, dataArray, renderFunction) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const headers = table.querySelectorAll('thead th');
  let currentSort = { column: -1, direction: 'asc' };
  
  headers.forEach((header, index) => {
    // Skip the last column (actions) from sorting
    if (index === headers.length - 1) return;
    
    header.classList.add('sortable-header');
    header.addEventListener('click', () => {
      // Reset other headers
      headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      
      // Toggle direction if same column, otherwise default to asc
      if (currentSort.column === index) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.direction = 'asc';
      }
      currentSort.column = index;
      
      // Add visual indicator
      header.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
      
      // Sort the data array
      sortTableData(dataArray, index, currentSort.direction, tableId);
      
      // Re-render
      renderFunction();
    });
  });
}

function sortTableData(dataArray, columnIndex, direction, tableId) {
  dataArray.sort((a, b) => {
    let aVal, bVal;
    
    // Get values based on table type and column
    if (tableId === 'cust_table') {
      switch (columnIndex) {
        case 0: // Name
          aVal = a.isCompany ? a.companyName : `${a.fname} ${a.lname}`;
          bVal = b.isCompany ? b.companyName : `${b.fname} ${b.lname}`;
          break;
        case 1: // Address
          aVal = `${a.street || ''} ${a.no || ''}`.trim();
          bVal = `${b.street || ''} ${b.no || ''}`.trim();
          break;
        case 2: // Place
          aVal = `${a.zip || ''} ${a.city || ''}`.trim();
          bVal = `${b.zip || ''} ${b.city || ''}`.trim();
          break;
        case 3: // Country
          aVal = a.country || '';
          bVal = b.country || '';
          break;
      }
    } else if (tableId === 'prod_table') {
      switch (columnIndex) {
        case 0: // Name
          aVal = a.name || '';
          bVal = b.name || '';
          break;
        case 1: // Price
          aVal = Number(a.price || 0);
          bVal = Number(b.price || 0);
          break;
      }
    } else if (tableId.includes('invoices_table')) {
      // For invoice tables
      switch (columnIndex) {
        case 0: // Nr
          aVal = a.no || '';
          bVal = b.no || '';
          break;
        case 1: // Title
          aVal = a.title || '';
          bVal = b.title || '';
          break;
        case 2: // Date
          aVal = new Date(a.created);
          bVal = new Date(b.created);
          break;
        case 3: // Customer
          const custA = customers[a.customerIndex];
          const custB = customers[b.customerIndex];
          aVal = custA ? (custA.isCompany ? custA.companyName : `${custA.fname} ${custA.lname}`) : '';
          bVal = custB ? (custB.isCompany ? custB.companyName : `${custB.fname} ${custB.lname}`) : '';
          break;
        case 4: // Firm
          const firmA = firms.find(f => f.id === a.firmId);
          const firmB = firms.find(f => f.id === b.firmId);
          aVal = firmA ? firmA.name : '';
          bVal = firmB ? firmB.name : '';
          break;
        case 5: // Total
          aVal = parseFloat((a.total || '').replace(/[^\d.-]/g, '')) || 0;
          bVal = parseFloat((b.total || '').replace(/[^\d.-]/g, '')) || 0;
          break;
      }
    }
    
    // Handle different data types
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    } else if (aVal instanceof Date && bVal instanceof Date) {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    } else {
      // String comparison
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
      if (direction === 'asc') {
        return aVal.localeCompare(bVal);
      } else {
        return bVal.localeCompare(aVal);
      }
    }
  });
}

// Apply flight placeholders, header labels, and section title on load
(function(){
  const dep=$('#flight_dep'); if(dep) dep.placeholder='LSZG';
  const arr=$('#flight_arr'); if(arr) arr.placeholder='LSGS';
  const time=$('#flight_time'); if(time) time.placeholder='01:40';
  const routing=$('#flight_routing'); if(routing) routing.placeholder='Jungfraujoch';
  const wrap=document.getElementById('flight_table_wrap');
  if(wrap){ const h=wrap.querySelector('h2, h3'); if(h) h.textContent='Flugdaten (optional)'; }
  const thead=document.querySelector('#flight_table thead');
  if(thead){ thead.innerHTML='<tr><th>Datum</th><th>Departure ICAO</th><th>Arrival ICAO</th><th>Flight Time</th><th>Routing</th><th></th></tr>'; }
})();

// Inject auto-generate checkbox next to invoice number input
(function(){
  const noEl=$('#inv_no');
  if(!noEl) return;
  // Inject minimal style for gray-out when auto
  if(!document.getElementById('autoNoStyle')){
    const st=document.createElement('style');
    st.id='autoNoStyle';
    st.textContent='input.auto-no{opacity:.65; pointer-events:none;} #inv_auto_hint{margin-left:8px; color:#9ca3af; font-size:12px;}';
    document.head.appendChild(st);
  }
  if(!$('#inv_auto_no')){
    noEl.insertAdjacentHTML('afterend', `<label class="inline" style="margin-left:8px;user-select:none"><input type="checkbox" id="inv_auto_no"> automatisch</label><span id="inv_auto_hint" class="muted" style="display:none"></span>`);
  }
  const chk=$('#inv_auto_no');
  const hint=$('#inv_auto_hint');
  function applySuggestion(){
    const f=getSelectedFirm();
    if(!chk?.checked||!f){
      noEl.readOnly=false;
      noEl.classList.remove('auto-no');
      if(hint){ hint.style.display='none'; hint.textContent=''; }
      return;
    }
    const gen=nextInvoiceNoForFirm(f);
    noEl.value=gen;
    noEl.readOnly=true;
    noEl.classList.add('auto-no');
    if(hint){ hint.textContent='→ '+gen; hint.style.display='inline'; }
  }
  chk?.addEventListener('change',applySuggestion);
  $('#firm_select')?.addEventListener('change',applySuggestion);
  noEl.addEventListener('input',()=>{ if(chk?.checked){ chk.checked=false; noEl.readOnly=false; noEl.classList.remove('auto-no'); if(hint){ hint.style.display='none'; } }});
  // initial
  applySuggestion();
})();

// Ensure paid invoices table exists with correct IDs and columns
(function(){
  try{
    const view = document.getElementById('view-paid');
    if(!view) return;
    if(!view.querySelector('#paid_invoices_table')){
      view.insertAdjacentHTML('beforeend', `
        <div class="card">
          <h2>Bezahlte Rechnungen</h2>
          <table class="table" id="paid_invoices_table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Titel</th>
                <th>Datum</th>
                <th>Kunde</th>
                <th>Firma</th>
                <th class="right">Total</th>
                <th class="right">Aktionen</th>
              </tr>
            </thead>
            <tbody id="paid_invoices_list">
              <tr><td colspan="7" class="muted">Keine bezahlten Rechnungen.</td></tr>
            </tbody>
          </table>
        </div>
      `);
    }
  }catch(e){}
})();

// Attach layout classes to Positionen rows for clean grid layout
(function(){
  try{
    const byId = id => document.getElementById(id);
    const findRow = el => el?.closest('.row') || el?.closest('.inline') || el?.parentElement;

    const prodEl = byId('sel_product');
    const prodRow = findRow(prodEl);
    if(prodRow && !prodRow.classList.contains('posline')){
      prodRow.classList.add('posline','posline-product');
    }

    const freeEl = byId('free_text_desc');
    const freeRow = findRow(freeEl);
    if(freeRow && !freeRow.classList.contains('posline')){
      freeRow.classList.add('posline','posline-free');
    }
  }catch(e){}
})();

// Nur im Register: Icon beim Tab "Firma" hinzufügen
(function(){
  const firmTab=document.querySelector('.navlink[data-view="firm"]');
  if(!firmTab) return;
  if(!firmTab.querySelector('.icon-firm')){
    const ico=document.createElement('span');
    ico.className='icon-firm';
    ico.textContent='\uD83C\uDFE2'; // 🏢
    ico.style.marginLeft='6px';
    ico.setAttribute('aria-hidden','true');
    firmTab.appendChild(ico);
  }
})();

// Icons für alle Register in der Sidebar hinzufügen (hinter den Text)
(function(){
  const icons={
    create:'\uD83D\uDCDD',  // 📝
    firm:'\uD83C\uDFE2',    // 🏢
    customers:'\uD83D\uDC65', // 👥
    products:'\uD83D\uDCE6',  // 📦
    saved:'\uD83D\uDCBE',     // 💾
    issued:'\uD83D\uDCE4',    // 📤
    paid:'\uD83D\uDCB0'       // 💰
  };
  document.querySelectorAll('.navlink[data-view]').forEach(tab=>{
    const key=tab.getAttribute('data-view');
    const emoji=icons[key];
    if(!emoji) return;
    const cls='icon-'+key;
    if(tab.querySelector('.'+cls)) return; // schon vorhanden
    const s=document.createElement('span');
    s.className=cls;
    s.textContent=emoji;
    s.style.marginLeft='6px';
    s.setAttribute('aria-hidden','true');
    tab.appendChild(s);
  });
})();

function saveFirms(){LS.set('firms',firms);LS.set('defaultFirmId',defaultFirmId);}function getDefaultFirm(){return firms.find(f=>f.id===defaultFirmId)||firms[0];}
function getSelectedFirm(){const v=$('#firm_select')?.value;return firms.find(f=>String(f.id)===v)||getDefaultFirm();}

function renderFirmSelect(){const sel=$('#firm_select');if(!sel)return;sel.innerHTML='';if(!firms.length){sel.innerHTML='<option value="">— keine Firma —</option>';return;}firms.forEach(f=>{const o=new Option((f.id===defaultFirmId?'★ ':'')+f.name,f.id);sel.append(o);});if(!sel.value&&firms.length)sel.value=String(defaultFirmId||firms[0].id);} 

function renderFirmSummary(){const box=$('#firm_summary'); if(!box) return; const f=getDefaultFirm(); if(!f){ box.innerHTML='<div class="muted">Keine Standard-Firma.</div>'; return; } const nextNo=nextInvoiceNoForFirm(f); let rightContent=''; if(f.logo||f.qrSvg){ // Right side: horizontal layout, auto-scaled to text height
    rightContent+='<div style="display:flex;gap:8px;align-items:flex-start">';
    if(f.logo){ rightContent+=`<div><div class="muted" style="margin-bottom:4px;font-size:10px">Logo</div><img src="${f.logo}" alt="Logo" style="height:120px;width:auto;border:1px solid #374151;border-radius:4px;background:#0b1324;padding:4px"></div>`; }
    if(f.qrSvg){ rightContent+=`<div><div class="muted" style="margin-bottom:4px;font-size:10px">QR-SVG</div><img src="${f.qrSvg}" alt="QR-SVG" style="height:120px;width:auto;border:1px solid #374151;border-radius:4px;background:#0b1324;padding:4px"></div>`; }
    rightContent+='</div>';
  }
  box.innerHTML=`<div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between"><div style="flex:1;min-width:0"><div>Name</div><div style="font-size:18px;font-weight:600;color:#f9fafb">${esc(f.name)}</div><div>IBAN</div><div>${esc(f.iban)}</div><div>Adresse</div><div>${esc(f.street)} ${esc(f.no||'')}</div><div>Ort</div><div>${esc(f.zip)} ${esc(f.city)}</div><div>Land</div><div>${esc(f.country)}</div><div>Nächste Nr.</div><div><span class="pill">${esc(nextNo)}</span></div></div>${rightContent}</div>`
}

function validIBAN(iban){const clean=(iban||'').toUpperCase().replace(/\s+/g,'');if(!/^CH|LI/.test(clean))return false;if(clean.length!==21)return false;const toDigits=s=>s.replace(/[A-Z]/g,c=>(c.charCodeAt(0)-55));const r=clean.slice(4)+clean.slice(0,4);let mod=0;for(const ch of toDigits(r))mod=(mod*10+Number(ch))%97;return mod===1;}

function renderFirmList(){
  const container=$('#firm_list');
  if(!container) return;
  const table = container.closest('table');
  if(table){ const thead = table.querySelector('thead'); if(thead) thead.remove(); const thRow = table.querySelector('tr th')?.closest('tr'); if(thRow) thRow.remove(); }
  function renderInfoRow(html){ container.innerHTML=''; const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan='100%'; td.innerHTML=html; tr.appendChild(td); container.appendChild(tr); }
  if(!firms.length){ renderInfoRow('<div class="muted">Noch keine Firma.</div>'); renderFirmSelect(); renderFirmSummary(); return; }
  container.innerHTML=''; const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan='100%'; const host=document.createElement('div'); host.id='firm_cards_host'; td.appendChild(host); tr.appendChild(td); container.appendChild(tr);

  firms.forEach((f,i)=>{
    const isDefault = f.id===defaultFirmId;
    const nextNo=nextInvoiceNoForFirm(f);

    // Right content (logo/QR) styling — unified for all cards
    const wrapStyle = 'display:flex;gap:8px;align-items:flex-start';
    const imgStyle = 'height:120px;width:auto;border:1px solid #374151;border-radius:4px;background:#0b1324;padding:4px';

    let rightContent='';
    if(f.logo||f.qrSvg){
      rightContent+=`<div style="${wrapStyle}">`;
      // Order: first logo, then SVG
      if(f.logo){ rightContent+=`<div><div class="muted" style="margin-bottom:4px;font-size:10px">Logo</div><img src="${f.logo}" alt="Logo" style="${imgStyle}"></div>`; }
      if(f.qrSvg){ rightContent+=`<div><div class="muted" style="margin-bottom:4px;font-size:10px">QR-SVG</div><img src="${f.qrSvg}" alt="QR-SVG" style="${imgStyle}"></div>`; }
      rightContent+='</div>';
    }

    const card=document.createElement('div');
    card.className='card';
    card.style.cssText='margin-bottom:16px;width:100%;box-sizing:border-box';
    if(isDefault) card.style.borderColor='#10b981';

    const header =
      `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;width:100%">
        <h3 style="margin:0;font-size:16px;flex:1">${esc(f.name)} ${isDefault?'<span class="badge default">STD</span>':''} <span class="badge">${esc(nextNo)}</span></h3>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class='btn sm' data-act='def' data-idx='${i}' title='Standard'>★</button>
          <button class='btn sm' data-act='edit' data-idx='${i}'>Edit</button>
          <button class='btn warn sm' data-act='del' data-idx='${i}'>✕</button>
        </div>
      </div>`;

    if(isDefault){
      // Standard firm: always show firm data left, logo/QR right
      const leftContent = `<div style="flex:1;min-width:0;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:baseline">
        <div>IBAN</div><div>${esc(f.iban)}</div>
        <div>Adresse</div><div>${esc(f.street)} ${esc(f.no||'')}</div>
        <div>Ort</div><div>${esc(f.zip)} ${esc(f.city)}</div>
        <div>Land</div><div>${esc(f.country)}</div>
      </div>`;
      card.innerHTML = header + `<div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between;width:100%">${leftContent}${rightContent}</div>`;
    } else {
      // Non-default: always show firm data left, logo/QR right
      const leftContent = `<div style="flex:1;min-width:0;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:baseline">
        <div>IBAN</div><div>${esc(f.iban)}</div>
        <div>Adresse</div><div>${esc(f.street)} ${esc(f.no||'')}</div>
        <div>Ort</div><div>${esc(f.zip)} ${esc(f.city)}</div>
        <div>Land</div><div>${esc(f.country)}</div>
        <div>Nächste Nr.</div><div><span class="pill">${esc(nextNo)}</span></div>
      </div>`;
      card.innerHTML = header + `<div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between;width:100%">${leftContent}${rightContent}</div>`;
    }

    host.appendChild(card);
  });

  renderFirmSelect();
  renderFirmSummary();
}

function resetFirmForm(){['cred_name','cred_iban','cred_street','cred_no','cred_zip','cred_city'].forEach(id=>{$('#'+id)&&($('#'+id).value='');});const countryEl=$('#cred_country');if(countryEl)countryEl.value='CH';const st=$('#firm_form_status');if(st)st.textContent='';const addBtn=$('#add_firm');const upd=$('#update_firm');const canc=$('#cancel_update_firm');addBtn&&addBtn.classList.remove('hidden');upd&&upd.classList.add('hidden');canc&&canc.classList.add('hidden');editingFirmIndex=null;const pv=$('#cred_logo_preview');if(pv)pv.style.display='none';const li=$('#cred_logo');if(li)li.value='';window.__currentLogoData=null; // QR SVG reset
const qpv=$('#cred_qr_preview'); if(qpv) qpv.style.display='none'; const qi=$('#cred_qr_template'); if(qi) qi.value=''; const qfb=$('#cred_qr_feedback'); if(qfb) qfb.textContent=''; window.__currentQrSvgData=null; const qdb=$('#cred_qr_delete'); if(qdb) qdb.style.display='none'; const ldb=$('#cred_logo_delete'); if(ldb) ldb.style.display='none'; const y=new Date().getFullYear();$('#cred_seq_year')&&($('#cred_seq_year').value=String(y));$('#cred_seq_counter')&&($('#cred_seq_counter').value='1');const termsEl=$('#cred_terms');if(termsEl)termsEl.value='';}

// Inject editable sequence controls into firm form as grid child
(function(){
  const grid=document.querySelector('#view-firm .grid2')||document.querySelector('main .grid2');
  if(!grid) return;
  if(document.getElementById('cred_seq_counter')) return; // already injected
  grid.insertAdjacentHTML('beforeend', `
    <label id="firm_seq_row">Rechnungszähler
      <div class="inline" style="gap:8px;align-items:center">
        <input id="cred_seq_year" type="number" min="2000" max="9999" style="width:100px" title="Jahr">
        <span>–</span>
        <input id="cred_seq_counter" type="number" min="1" step="1" style="width:100px" title="Nächster Zähler (z.B. 1 = 001)">
      </div>
    </label>
  `);
  const y=new Date().getFullYear();
  const yr=document.getElementById('cred_seq_year');
  const ctr=document.getElementById('cred_seq_counter');
  if(yr) yr.value=String(y);
  if(ctr) ctr.value='1';
})();

// Inject QR Einzahlungschein (SVG) and terms into firm form as grid children
(function(){
  const grid=document.querySelector('#view-firm .grid2')||document.querySelector('main .grid2');
  if(!grid) return;
  if(!document.getElementById('cred_qr_template')){
    grid.insertAdjacentHTML('beforeend', `
      <label id="firm_qr_row">QR Einzahlungschein (SVG)
        <div class="inline" style="gap:8px;align-items:center">
          <input id="cred_qr_template" type="file" accept=".svg,image/svg+xml">
          <span id="cred_qr_feedback" class="muted"></span>
        </div>
        <img id="cred_qr_preview" alt="QR Einzahlungschein" style="max-width:200px;height:auto;border:1px solid #374151;border-radius:4px;background:#0b1324;padding:4px;margin-top:6px;display:none">
        <button type="button" id="cred_qr_delete" class="btn warn sm" style="margin-top:4px;display:none">QR-SVG löschen</button>
      </label>
    `);
  }
  if(!document.getElementById('firm_terms_row')){
    grid.insertAdjacentHTML('beforeend', `
      <label id="firm_terms_row" class="col-span-2">Rechnungsbedingungen
        <textarea id="cred_terms" placeholder="Ihre Rechnungsbedingungen (optional)" style="width:100%;min-height:80px;resize:vertical"></textarea>
      </label>
    `);
  }
})();

// Ensure SVG upload shows preview and validates
(function(){
  const input=document.getElementById('cred_qr_template'); if(!input) return;
  const pv=document.getElementById('cred_qr_preview');
  const fb=document.getElementById('cred_qr_feedback');
  const del=document.getElementById('cred_qr_delete');
  input.addEventListener('change',function(){
    const file=this.files&&this.files[0];
    if(!file){ if(pv) pv.style.display='none'; if(fb) fb.textContent=''; if(del) del.style.display='none'; window.__currentQrSvgData=null; return; }
    const isSvg = file.type==='image/svg+xml' || (/\.svg$/i).test(file.name);
    if(!isSvg){ if(fb) fb.textContent='Nur SVG-Dateien erlaubt'; this.value=''; if(del) del.style.display='none'; window.__currentQrSvgData=null; if(pv) pv.style.display='none'; return; }
    if(file.size>500*1024){ if(fb) fb.textContent='Datei > 500KB, bitte verkleinern'; this.value=''; if(del) del.style.display='none'; window.__currentQrSvgData=null; if(pv) pv.style.display='none'; return; }
    const r=new FileReader();
    r.onload=e=>{ window.__currentQrSvgData=e.target.result; if(pv){ pv.src=e.target.result; pv.style.display='block'; } if(fb) fb.textContent='SVG geladen'; if(del) del.style.display='block'; };
    r.readAsDataURL(file);
  });
})();

// --- Fix: Firma-Formular sauber im 2-Spalten-Grid anordnen ---
(function fixFirmFormGrid(){
  try{
    const grid=document.querySelector('#view-firm .grid2')||document.querySelector('main .grid2');
    if(!grid) return;

    const byId=id=>document.getElementById(id);
    const labelOf=id=>byId(id)?.closest('label');

    const name   =labelOf('cred_name');
    const iban   =labelOf('cred_iban');
    const street =labelOf('cred_street');
    const no     =labelOf('cred_no');
    const zip    =labelOf('cred_zip');
    const city   =labelOf('cred_city');
    const country=labelOf('cred_country');
    const logo   =labelOf('cred_logo');
    const seqRow =byId('firm_seq_row');
    const qrRow  =byId('firm_qr_row');
    const terms  =byId('firm_terms_row');

    if(terms) terms.classList.add('col-span-2'); // über beide Spalten

    [
      name, iban,
      street, no,
      zip, city,          // PLZ | Ort unverändert
      country, seqRow,    // Land | Zähler
      logo, qrRow,        // Logo | QR
      terms               // Bedingungen über ganze Breite
    ].forEach(el=>{ if(el) grid.appendChild(el); });
  }catch(e){ /* no-op */ }
})();

// Inject logo upload into firm form with preview and delete button
(function(){
  const input=document.getElementById('cred_logo'); if(!input) return;
  const preview=document.getElementById('cred_logo_preview');
  const del=document.getElementById('cred_logo_delete');
  if(!preview && !del){
    input.insertAdjacentHTML('afterend', `
      <img id="cred_logo_preview" alt="Logo" style="max-width:200px;height:auto;border:1px solid #374151;border-radius:4px;background:#0b1324;padding:4px;margin-top:6px;display:none">
      <button type="button" id="cred_logo_delete" class="btn warn sm" style="margin-top:4px;display:none">Logo löschen</button>
    `);
  } else if(preview && !del){
    preview.insertAdjacentHTML('afterend', `<button type="button" id="cred_logo_delete" class="btn warn sm" style="margin-top:4px;display:none">Logo löschen</button>`);
  } else if(!preview && del){
    del.insertAdjacentHTML('beforebegin', `<img id="cred_logo_preview" alt="Logo" style="max-width:200px;height:auto;border:1px solid #374151;border-radius:4px;background:#0b1324;padding:4px;margin-top:6px;display:none">`);
  }

  // Minimal: add change handler for preview + saving
  input.addEventListener('change',function(){
    const file=this.files&&this.files[0];
    const pv=document.getElementById('cred_logo_preview');
    const delBtn=document.getElementById('cred_logo_delete');
    if(!file){ if(pv) pv.style.display='none'; if(delBtn) delBtn.style.display='none'; window.__currentLogoData=null; return; }
    if(!(file.type||'').startsWith('image/')){ alert('Nur Bilddateien erlaubt'); this.value=''; if(pv) pv.style.display='none'; if(delBtn) delBtn.style.display='none'; window.__currentLogoData=null; return; }
    if(file.size>500*1024){ alert('Datei > 500KB, bitte verkleinern'); this.value=''; if(pv) pv.style.display='none'; if(delBtn) delBtn.style.display='none'; window.__currentLogoData=null; return; }
    const r=new FileReader();
    r.onload=e=>{ window.__currentLogoData=e.target.result; if(pv){ pv.src=e.target.result; pv.style.display='block'; } if(delBtn) delBtn.style.display='block'; };
    r.readAsDataURL(file);
  });
})();

// Logo delete handler
$('#cred_logo_delete')?.addEventListener('click',()=>{
  if(confirm('Logo wirklich löschen?')){
    const pv=$('#cred_logo_preview'); if(pv) pv.style.display='none';
    const inp=$('#cred_logo'); if(inp) inp.value='';
    const db=$('#cred_logo_delete'); if(db) db.style.display='none';
    window.__currentLogoData=null;
    if(editingFirmIndex!=null){
      const f=firms[editingFirmIndex]; if(f) delete f.logo;
    }
  }
});

// QR delete handler  
$('#cred_qr_delete')?.addEventListener('click',()=>{
  if(confirm('QR-SVG wirklich löschen?')){
    const pv=$('#cred_qr_preview'); if(pv) pv.style.display='none';
    const inp=$('#cred_qr_template'); if(inp) inp.value='';
    const db=$('#cred_qr_delete'); if(db) db.style.display='none';
    const fb=$('#cred_qr_feedback'); if(fb) fb.textContent='';
    window.__currentQrSvgData=null;
    if(editingFirmIndex!=null){
      const f=firms[editingFirmIndex]; if(f) delete f.qrSvg;
    }
  }
});

$('#update_firm')?.addEventListener('click',()=>{if(editingFirmIndex==null)return;const name=$('#cred_name').value.trim();const iban=$('#cred_iban').value.trim();const street=$('#cred_street').value.trim();const no=$('#cred_no').value.trim();const zip=$('#cred_zip').value.trim();const city=$('#cred_city').value.trim();const country=$('#cred_country').value;const terms=$('#cred_terms')?.value.trim()||'';const st=$('#firm_form_status');const fb=$('#iban_feedback');if(st)st.textContent='';if(fb)fb.textContent='';if(!name||!iban||!street||!zip||!city){st&&(st.innerHTML='<span class="danger">Pflichtfelder fehlen.</span>');return;}if(!validIBAN(iban)){fb&&(fb.innerHTML='<span class="danger">IBAN ungültig.</span>');return;}const f=firms[editingFirmIndex];if(!f){resetFirmForm();return;}const seqYear=parseInt($('#cred_seq_year')?.value)||new Date().getFullYear();const seqCounter=Math.max(1,parseInt($('#cred_seq_counter')?.value)||1);Object.assign(f,{name,iban,street,no,zip,city,country,invoiceSeqYear:seqYear,invoiceSeqCounter:seqCounter,terms});if(window.__currentLogoData){f.logo=window.__currentLogoData;} if(window.__currentQrSvgData){f.qrSvg=window.__currentQrSvgData;} saveFirms();renderFirmList();st&&(st.innerHTML='<span class="success">Aktualisiert.</span>');resetFirmForm();});

$('#add_firm')?.addEventListener('click',()=>{const name=$('#cred_name').value.trim();const iban=$('#cred_iban').value.trim();const street=$('#cred_street').value.trim();const no=$('#cred_no').value.trim();const zip=$('#cred_zip').value.trim();const city=$('#cred_city').value.trim();const country=$('#cred_country').value;const terms=$('#cred_terms')?.value.trim()||'';const st=$('#firm_form_status');const fb=$('#iban_feedback');if(st)st.textContent='';if(fb)fb.textContent='';if(!name||!iban||!street||!zip||!city){st&&(st.innerHTML='<span class="danger">Pflichtfelder fehlen.</span>');return;}if(!validIBAN(iban)){fb&&(fb.innerHTML='<span class="danger">IBAN ungültig.</span>');return;}const seqYear=parseInt($('#cred_seq_year')?.value)||new Date().getFullYear();const seqCounter=Math.max(1,parseInt($('#cred_seq_counter')?.value)||1);const newFirm={id:Date.now(),name,iban,street,no,zip,city,country,invoiceSeqYear:seqYear,invoiceSeqCounter:seqCounter,terms};if(window.__currentLogoData){newFirm.logo=window.__currentLogoData;} if(window.__currentQrSvgData){newFirm.qrSvg=window.__currentQrSvgData;} firms.push(newFirm);if(!defaultFirmId)defaultFirmId=newFirm.id;saveFirms();renderFirmList();resetFirmForm();st&&(st.innerHTML='<span class="success">Firma gespeichert.</span>');});

$('#cancel_update_firm')?.addEventListener('click',()=>{resetFirmForm();});

// --- Firmen ---
$('#firm_list')?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const idx=Number(b.dataset.idx);const f=firms[idx];if(!f)return;const act=b.dataset.act; if(act==='del'){if(!confirm('Firma löschen?'))return;const wasDef=f.id===defaultFirmId;firms.splice(idx,1);if(wasDef)defaultFirmId=firms[0]?.id||null;saveFirms();renderFirmList();return;} if(act==='def'){defaultFirmId=f.id;saveFirms();renderFirmList();return;} if(act==='edit'){editingFirmIndex=idx;$('#cred_name').value=f.name||'';$('#cred_iban').value=f.iban||'';$('#cred_street').value=f.street||'';$('#cred_no').value=f.no||'';$('#cred_zip').value=f.zip||'';$('#cred_city').value=f.city||'';$('#cred_country').value=f.country||'CH';$('#cred_terms').value=f.terms||'';const pv=$('#cred_logo_preview'); if(pv){ if(f.logo){ pv.src=f.logo; pv.style.display='block'; window.__currentLogoData=f.logo; const ldb=$('#cred_logo_delete'); if(ldb) ldb.style.display='block'; } else { pv.style.display='none'; window.__currentLogoData=null; const ldb=$('#cred_logo_delete'); if(ldb) ldb.style.display='none'; } } // QR preview
const qpv=$('#cred_qr_preview'); if(qpv){ if(f.qrSvg){ qpv.src=f.qrSvg; qpv.style.display='block'; window.__currentQrSvgData=f.qrSvg; const qdb=$('#cred_qr_delete'); if(qdb) qdb.style.display='block'; } else { qpv.style.display='none'; window.__currentQrSvgData=null; const qdb=$('#cred_qr_delete'); if(qdb) qdb.style.display='none'; } }
const addBtn=$('#add_firm');const upd=$('#update_firm');const canc=$('#cancel_update_firm');addBtn&&addBtn.classList.add('hidden');upd&&upd.classList.remove('hidden');canc&&canc.classList.remove('hidden');const st=$('#firm_form_status');if(st)st.textContent='Bearbeitung aktiv – Änderungen speichern oder Abbruch';const y=f.invoiceSeqYear||new Date().getFullYear();const c=f.invoiceSeqCounter||1;$('#cred_seq_year')&&($('#cred_seq_year').value=String(y));$('#cred_seq_counter')&&($('#cred_seq_counter').value=String(c));addBtn?.closest('.card')?.scrollIntoView({behavior:'smooth'});return;}
});

// --- Kunden ---
$('#cust_is_company')?.addEventListener('change', e => {
  const isCompany = e.target.checked;
  $('#cust_private_fields').classList.toggle('hidden', isCompany);
  $('#cust_company_fields').classList.toggle('hidden', !isCompany);
});

function renderCustomerList(){
  const tb=$('#cust_list');
  if(!tb) return;
  if(!customers.length){
    tb.innerHTML='<tr><td colspan="4" class="muted">Noch keine Kunden.</td></tr>';
    return;
  }
  tb.innerHTML='';
  customers.forEach((c,i)=>{
    const name = c.isCompany ? c.companyName : `${c.fname} ${c.lname}`;
    const addr=`${esc(c.street||'')} ${esc(c.no||'')}`.trim();
    const place=`${esc(c.zip||'')} ${esc(c.city||'')}`.trim();
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(name)}</td><td>${addr}</td><td>${place}</td><td>${esc(c.country||'')}</td><td class="right"><button class="btn sm" data-act="edit" data-idx="${i}">Edit</button> <button class="btn warn sm" data-act="del" data-idx="${i}">✕</button></td>`;
    tb.append(tr);
  });
}

$('#add_customer')?.addEventListener('click',()=>{
  const isCompany = $('#cust_is_company').checked;
  let customer = {
    isCompany,
    street: $('#cust_street').value.trim(),
    no: $('#cust_no').value.trim(),
    zip: $('#cust_zip').value.trim(),
    city: $('#cust_city').value.trim(),
    country: $('#cust_country').value
  };

  if (isCompany) {
    customer.companyName = $('#cust_company_name').value.trim();
    customer.contactPerson = $('#cust_contact_person').value.trim();
    if (!customer.companyName) { alert('Firmenname fehlt'); return; }
  } else {
    customer.fname = $('#cust_fname').value.trim();
    customer.lname = $('#cust_lname').value.trim();
    if (!customer.fname || !customer.lname) { alert('Vor- und Nachname fehlen'); return; }
  }

  customers.push(customer);
  LS.set('customers',customers);
  
  // Reset fields
  ['cust_fname', 'cust_lname', 'cust_company_name', 'cust_contact_person', 'cust_street', 'cust_no', 'cust_zip', 'cust_city'].forEach(id => $('#'+id).value = '');
  $('#cust_is_company').checked = false;
  $('#cust_private_fields').classList.remove('hidden');
  $('#cust_company_fields').classList.add('hidden');

  renderCustomerList();
  refreshDropdowns();
});

$('#cust_table')?.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  const i=Number(b.dataset.idx); const c=customers[i]; if(!c) return;
  
  if(b.dataset.act==='del'){
    if(confirm('Löschen?')){ customers.splice(i,1); LS.set('customers',customers); renderCustomerList(); refreshDropdowns(); }
    return;
  }
  
  if(b.dataset.act==='edit'){
    const c = customers[i];
    // Statt inline zu bearbeiten, füllen wir das Hauptformular oben
    const isCompany = c.isCompany || false;
    $('#cust_is_company').checked = isCompany;
    
    $('#cust_fname').value = c.fname || '';
    $('#cust_lname').value = c.lname || '';
    $('#cust_company_name').value = c.companyName || '';
    $('#cust_contact_person').value = c.contactPerson || '';
    
    $('#cust_street').value = c.street || '';
    $('#cust_no').value = c.no || '';
    $('#cust_zip').value = c.zip || '';
    $('#cust_city').value = c.city || '';
    $('#cust_country').value = c.country || 'CH';

    // Formularfelder basierend auf Kundentyp ein-/ausblenden
    $('#cust_private_fields').classList.toggle('hidden', isCompany);
    $('#cust_company_fields').classList.toggle('hidden', !isCompany);

    // Button-Logik ändern
    $('#add_customer').classList.add('hidden');
    const updateButton = $('#update_customer');
    const cancelButton = $('#cancel_update_customer');
    
    updateButton.classList.remove('hidden');
    cancelButton.classList.remove('hidden');
    updateButton.dataset.idx = i; // Index für den Update-Vorgang speichern

    // Zum Formular scrollen
    $('#add_customer').closest('.card').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  if(b.dataset.act==='cancel'){ renderCustomerList(); return; }
});

function resetCustomerForm() {
  ['cust_fname', 'cust_lname', 'cust_company_name', 'cust_contact_person', 'cust_street', 'cust_no', 'cust_zip', 'cust_city'].forEach(id => $('#'+id).value = '');
  $('#cust_is_company').checked = false;
  $('#cust_private_fields').classList.remove('hidden');
  $('#cust_company_fields').classList.add('hidden');
  
  $('#add_customer').classList.remove('hidden');
  $('#update_customer').classList.add('hidden');
  $('#cancel_update_customer').classList.add('hidden');
}

$('#cancel_update_customer')?.addEventListener('click', resetCustomerForm);

$('#update_customer')?.addEventListener('click', e => {
  const i = Number(e.target.dataset.idx);
  if (isNaN(i)) return;

  const isCompany = $('#cust_is_company').checked;
  const nc = {
    isCompany,
    street: $('#cust_street').value.trim(),
    no: $('#cust_no').value.trim(),
    zip: $('#cust_zip').value.trim(),
    city: $('#cust_city').value.trim(),
    country: $('#cust_country').value
  };

  if (isCompany) {
    nc.companyName = $('#cust_company_name').value.trim();
    nc.contactPerson = $('#cust_contact_person').value.trim();
    if (!nc.companyName) { alert('Firmenname fehlt'); return; }
  } else {
    nc.fname = $('#cust_fname').value.trim();
    nc.lname = $('#cust_lname').value.trim();
    if (!nc.fname || !nc.lname) { alert('Vor- und Nachname fehlen'); return; }
  }
  
  customers[i] = nc;
  LS.set('customers', customers);
  renderCustomerList();
  refreshDropdowns();
  resetCustomerForm();
});

// --- Produkte ---
function renderProductList(){const tb=$('#prod_list');if(!tb)return;if(!products.length){tb.innerHTML='<tr><td colspan="3" class="muted">Keine Produkte.</td></tr>';return;}tb.innerHTML='';products.forEach((p,i)=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(p.name)}</td><td class='right'>${Number(p.price||0).toFixed(2)}</td><td class='right'><button class='btn sm' data-act='edit' data-idx='${i}'>Edit</button> <button class='btn warn sm' data-act='del' data-idx='${i}'>✕</button></td>`;tb.append(tr);});}

$('#add_product')?.addEventListener('click',()=>{const p={name:$('#prod_name').value.trim(),price:Number($('#prod_price').value)};if(!p.name||isNaN(p.price)){alert('Name & Preis');return;}products.push(p);LS.set('products',products);['prod_name','prod_price'].forEach(id=>$('#'+id).value='');renderProductList();refreshDropdowns();});

$('#prod_table')?.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  const i=Number(b.dataset.idx); const p=products[i]; if(!p) return;
  
  if(b.dataset.act==='del'){
    if(confirm('Löschen?')){ products.splice(i,1); LS.set('products',products); renderProductList(); refreshDropdowns(); }
    return;
  }
  
  if(b.dataset.act==='edit'){
    const p = products[i];
    // Fill main form with product data
    $('#prod_name').value = p.name || '';
    $('#prod_price').value = Number(p.price || 0).toFixed(2);

    // Change button logic
    $('#add_product').classList.add('hidden');
    const updateButton = $('#update_product');
    const cancelButton = $('#cancel_update_product');
    
    updateButton.classList.remove('hidden');
    cancelButton.classList.remove('hidden');
    updateButton.dataset.idx = i; // Store index for update operation

    // Scroll to form
    $('#add_product').closest('.card').scrollIntoView({ behavior: 'smooth' });
    return;
  }
});

// Ensure update/cancel buttons exist for product form
(function(){
  try{
    const add=document.getElementById('add_product');
    if(!add) return;
    if(!document.getElementById('update_product')){
      const up=document.createElement('button');
      up.id='update_product';
      up.className='btn sm hidden';
      up.textContent='Änderung speichern';
      add.insertAdjacentElement('afterend', up);
    }
    if(!document.getElementById('cancel_update_product')){
      const ca=document.createElement('button');
      ca.id='cancel_update_product';
      ca.className='btn sm hidden';
      ca.textContent='Abbrechen';
      const ref=document.getElementById('update_product')||add;
      ref.insertAdjacentElement('afterend', ca);
    }
  }catch(e){}
})();

function resetProductForm() {
  ['prod_name', 'prod_price'].forEach(id => $('#'+id).value = '');
  
  $('#add_product').classList.remove('hidden');
  $('#update_product').classList.add('hidden');
  $('#cancel_update_product').classList.add('hidden');
}

$('#cancel_update_product')?.addEventListener('click', resetProductForm);

$('#update_product')?.addEventListener('click', e => {
  const i = Number(e.target.dataset.idx);
  if (isNaN(i)) return;

  const np = {
    name: $('#prod_name').value.trim(),
    price: Number($('#prod_price').value)
  };

  if (!np.name || isNaN(np.price)) { alert('Name & Preis fehlen'); return; }
  
  products[i] = np;
  LS.set('products', products);
  renderProductList();
  refreshDropdowns();
  resetProductForm();
});

function refreshDropdowns(){
  const selC=$('#sel_customer');
  const prevCustName = selC && selC.value!=='' ? selC.value : null;
  if(selC){
    selC.innerHTML=customers.length?'':'<option value="">— kein Kunde —</option>';
    const sorted = customers.slice().sort((a,b)=>{
      const nameA = a.isCompany ? (a.companyName||'') : `${a.fname||''} ${a.lname||''}`.trim();
      const nameB = b.isCompany ? (b.companyName||'') : `${b.fname||''} ${b.lname||''}`.trim();
      return nameA.localeCompare(nameB,'de',{sensitivity:'base'});
    });
    sorted.forEach(c=>{
      const name = c.isCompany ? c.companyName : `${c.fname} ${c.lname}`;
      selC.append(new Option(`${name} (${c.zip||''} ${c.city||''})`, name));
    });
    if(prevCustName) selC.value = prevCustName;
  }
  // Passenger customer select
  const selPC=$('#passenger_customer_select');
  const prevPCName = selPC && selPC.value!=='' ? selPC.value : null;
  if(selPC){
    selPC.innerHTML='<option value="">– Kunde wählen –</option>';
    const sortedPC = customers.slice().sort((a,b)=>{
      const nameA = a.isCompany ? (a.companyName||'') : `${a.fname||''} ${a.lname||''}`.trim();
      const nameB = b.isCompany ? (b.companyName||'') : `${b.fname||''} ${b.lname||''}`.trim();
      return nameA.localeCompare(nameB,'de',{sensitivity:'base'});
    });
    sortedPC.forEach(c=>{
      const name=c.isCompany?c.companyName:`${c.fname} ${c.lname}`;
      selPC.append(new Option(name,name));
    });
    if(prevPCName) selPC.value = prevPCName;
  }
  const selP=$('#sel_product');
  const prevProdName = selP && selP.value!=='' ? selP.value : null;
  if(selP){
    selP.innerHTML=products.length?'':'<option value="">— kein Produkt —</option>';
    const sortedP = products.slice().sort((a,b)=>{
      const nameA = (a && a.name) ? String(a.name) : '';
      const nameB = (b && b.name) ? String(b.name) : '';
      return nameA.localeCompare(nameB,'de',{sensitivity:'base'});
    });
    sortedP.forEach(p=>{
      selP.append(new Option(`${p.name} – CHF ${Number(p.price).toFixed(2)}`, p.name));
    });
    if(prevProdName) selP.value = prevProdName;
  }
  renderFirmSelect();
}

// Ensure update/cancel buttons exist for text form
(function(){
  try{
    const add=document.getElementById('add_text');
    if(!add) return;
    if(!document.getElementById('update_text')){
      const up=document.createElement('button');
      up.id='update_text';
      up.className='btn hidden';
      up.style.cssText='flex-shrink:0';
      up.textContent='Änderung speichern';
      add.insertAdjacentElement('afterend', up);
    }
    if(!document.getElementById('cancel_update_text')){
      const ca=document.createElement('button');
      ca.id='cancel_update_text';
      ca.className='btn hidden';
      ca.style.cssText='flex-shrink:0';
      ca.textContent='Abbrechen';
      const ref=document.getElementById('update_text')||add;
      ref.insertAdjacentElement('afterend', ca);
    }
  }catch(e){}
})();

function resetTextForm() {
  $('#text_input').value = '';
  $('#add_text').classList.remove('hidden');
  $('#update_text').classList.add('hidden');
  $('#cancel_update_text').classList.add('hidden');
}

$('#cancel_update_text')?.addEventListener('click', resetTextForm);

$('#update_text')?.addEventListener('click', e => {
  const i = Number(e.target.dataset.idx);
  if (isNaN(i)) return;

  const newText = $('#text_input').value.trim();
  if (!newText) { alert('Text fehlt'); return; }
  
  currentTexts[i] = { text: newText };
  renderTextList();
  resetTextForm();
});

// Positionen
const tbody=$('#items tbody');
function recalc(){let sum=0;tbody && tbody.querySelectorAll('tr[data-row]').forEach(tr=>{const qty=Number(tr.querySelector('.cell-qty input')?.value||0);const price=Number(tr.querySelector('.cell-price input')?.value||0);const total=qty*price;tr.dataset.total=String(total);tr.querySelector('.cell-total').textContent=total.toFixed(2);sum+=total;});const vat=Number($('#vat')?.value||0);if($('#sum')) $('#sum').textContent=fmtCHF(sum);if($('#vat_amt')) $('#vat_amt').textContent=fmtCHF(sum*(vat/100));if($('#grand')) $('#grand').textContent=fmtCHF(sum+sum*(vat/100));} 
function addRow(pi,qty){const p=products[pi];if(!p)return;createRow({name:p.name,qty,price:Number(p.price)});}
function createRow({name,qty,price}){
  const tr=document.createElement('tr');
  tr.dataset.row='1';
  tr.dataset.total='0';
  tr.draggable=true;
  tr.innerHTML=`<td class='cell-pos'><span class='drag-handle' title='Ziehen'>≡</span><span class='pos-label'></span></td><td>${esc(name)}</td><td class='right cell-qty'><div class='qtywrap'><input class='no-spin' type='number' min='0' step='1' value='${qty}' style='width:80px'><div class='spinbox'><button type='button' class='spin up' data-dir='1'>▲</button><button type='button' class='spin dn' data-dir='-1'>▼</button></div></div></td><td class='right cell-price'><div class='qtywrap'><input class='no-spin' type='number' min='0' step='1' value='${Number(price).toFixed(2)}' style='width:90px'><div class='spinbox'><button type='button' class='spin up' data-dir='1'>▲</button><button type='button' class='spin dn' data-dir='-1'>▼</button></div></div></td><td class='right cell-total'>0.00</td><td class='right'><button class='btn warn sm' data-act='del-row'>✕</button></td>`;
  const delBtn=tr.querySelector('button[data-act="del-row"]');
  delBtn.addEventListener('click',()=>{tr.remove();recalc();renumberPositions();});
  tr.querySelectorAll('input').forEach(inp=>inp.addEventListener('input',recalc));
  // Einzelne Spinner-Listener entfallen – globale Delegation unten
  tr.addEventListener('dragstart',e=>{try{e.dataTransfer.setData('text/plain','');}catch{} tr.classList.add('dragging'); e.dataTransfer.effectAllowed='move';});
  tr.addEventListener('dragend',()=>{tr.classList.remove('dragging'); renumberPositions();});
  tbody.append(tr);
  renumberPositions();
  recalc();
}
tbody?.addEventListener('dragover',e=>{e.preventDefault();const dragging=tbody.querySelector('tr.dragging');if(!dragging)return;const after=getDragAfterElement(tbody,e.clientY);if(after==null){tbody.append(dragging);}else{tbody.insertBefore(dragging,after);} });
function getDragAfterElement(container,y){const els=[...container.querySelectorAll('tr[data-row]:not(.dragging)')];
  return els.reduce((closest,child)=>{const box=child.getBoundingClientRect();const offset=y-box.top-box.height/2; if(offset<0 && offset>closest.offset){return {offset,element:child};} else {return closest;}},{offset:Number.NEGATIVE_INFINITY}).element;
}
function renumberPositions(){ if(!tbody) return; Array.from(tbody.querySelectorAll('tr[data-row]')).forEach((tr,i)=>{const lbl=tr.querySelector('.pos-label');if(lbl)lbl.textContent=i+1;});}
function sortByPositions(){} // no-op (manual input removed)
$('#add_item')?.addEventListener('click',()=>{const name=$('#sel_product').value;const q=Number($('#qty').value||1);if(!name||!(q>0)){alert('Produkt & Menge');return;}const prod=products.find(p=>p.name===name);if(!prod){alert('Produkt nicht gefunden');return;}createRow({name:prod.name,qty:q,price:Number(prod.price)});});$('#vat')?.addEventListener('input',recalc);
// Spinner: einmaliger Delegations-Handler + Halten für schnelleres Inkrement
let spinTimer=null;let spinDelayTimer=null;
function stepSpin(input,dir){const cur=Number(input.value||0);input.value=String(Math.max(0,cur+dir));input.dispatchEvent(new Event('input'));}
document.addEventListener('mousedown',e=>{const b=e.target.closest('.qtywrap .spin');if(!b)return; e.preventDefault(); const input=b.closest('.qtywrap').querySelector('input');if(!input)return; const dir=Number(b.dataset.dir)||0; stepSpin(input,dir); // initial
  // nach kurzer Verzögerung wiederholt
  spinDelayTimer=setTimeout(()=>{spinTimer=setInterval(()=>stepSpin(input,dir),100);},400);
});
document.addEventListener('mouseup',()=>{clearInterval(spinTimer);clearTimeout(spinDelayTimer);spinTimer=null;spinDelayTimer=null;});
document.addEventListener('mouseleave',()=>{clearInterval(spinTimer);clearTimeout(spinDelayTimer);spinTimer=null;spinDelayTimer=null;});
document.addEventListener('click',e=>{const b=e.target.closest('.qtywrap .spin');if(!b)return; // Klick schon durch mousedown behandelt
  e.preventDefault();
});

// Freie Position hinzufügen (ohne störende Alert-Meldung)
$('#add_free_item')?.addEventListener('click',()=>{const name=$('#free_text_desc').value.trim();const qty=Number($('#free_text_qty').value||0);const price=Number($('#free_text_price').value||0);if(!name)return; // Name Pflicht
  if(!(qty>0))return; // Menge >0 nötig
  createRow({name,qty,price});
  $('#free_text_desc').value='';
});
$$('input[name="reftype"]').forEach(r=>r.addEventListener('change',()=>$('#ref_input').classList.toggle('hidden',r.value!=='SCOR'||!r.checked)));
// Mehrere Flüge unterstützen
const currentFlights=[]; // {date,dep,arr,time,routing}
function renderFlightTable(){
  const wrap=$('#flight_table_wrap');
  const tb=$('#flight_table tbody');
  // Update header labels
  const thead=document.querySelector('#flight_table thead');
  if(thead){ thead.innerHTML = '<tr><th>Datum</th><th>Departure ICAO</th><th>Arrival ICAO</th><th>Flight Time</th><th>Routing</th><th></th></tr>'; }
  if(!tb)return; if(!currentFlights.length){tb.innerHTML='<tr><td colspan="6" class="muted">Keine Flugdaten übernommen.</td></tr>'; if(wrap) wrap.style.display=currentFlights.length?'block':'none'; return;}
  if(wrap) wrap.style.display='block';
  tb.innerHTML='';
  currentFlights.forEach((f,i)=>{
    const tr=document.createElement('tr');
    tr.dataset.flightRow=i;
    tr.dataset.row='1';        // so getDragAfterElement picks it up
    tr.draggable=true;         // enable DnD
    tr.innerHTML=`<td>${esc(f.date||'')}</td><td>${esc(f.dep||'')}</td><td>${esc(f.arr||'')}</td><td>${esc(f.time||'')}</td><td>${esc(f.routing||'')}</td><td class='right'><button class='btn sm' data-act='edit-flight' data-idx='${i}'>Edit</button> <button class='btn warn sm' data-act='del-flight' data-idx='${i}'>✕</button></td>`;
    tr.addEventListener('dragstart',e=>{ try{ e.dataTransfer.setData('text/plain',''); }catch{} tr.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
    tr.addEventListener('dragend',()=>{
      tr.classList.remove('dragging');
      // Commit new order back to currentFlights based on DOM row order
      const order = Array.from(tb.querySelectorAll('tr[data-row]')).map(r=>Number(r.dataset.flightRow)).filter(n=>!Number.isNaN(n));
      if(order.length===currentFlights.length){
        const next = order.map(idx=>currentFlights[idx]);
        currentFlights.length=0; next.forEach(x=>currentFlights.push(x));
        renderFlightTable();
      }
    });
    tb.append(tr);
  });
  if(!tb.dataset.dragInit){
    tb.addEventListener('dragover',e=>{
      e.preventDefault();
      const dragging=tb.querySelector('tr.dragging');
      if(!dragging) return;
      const after=getDragAfterElement(tb,e.clientY);
      if(after==null){ tb.append(dragging); } else { tb.insertBefore(dragging,after); }
    });
    tb.dataset.dragInit='1';
  }
}
let editingFlightIndex=null;
$('#add_flight_data')?.addEventListener('click',()=>{
  const date=$('#flight_date').value||'';
  const dep=$('#flight_dep').value.trim().toUpperCase();
  const arr=$('#flight_arr').value.trim().toUpperCase();
  const time=$('#flight_time')?.value.trim();
  const routing=$('#flight_routing')?.value.trim().toUpperCase();
  if(!date && !dep && !arr && !time && !routing){$('#flight_feedback').textContent='Keine Daten';return;}
  const obj={date,dep,arr,time,routing};
  if(editingFlightIndex!==null){currentFlights[editingFlightIndex]=obj;editingFlightIndex=null;$('#add_flight_data').textContent='Flug hinzufügen';}
  else currentFlights.push(obj);
  renderFlightTable();
  $('#flight_feedback').textContent='Gespeichert';
  setTimeout(()=>{if($('#flight_feedback').textContent==='Gespeichert')$('#flight_feedback').textContent='';},2000);
  // Felder leeren
  ['flight_date','flight_dep','flight_arr','flight_time','flight_routing'].forEach(id=>{const el=$('#'+id); if(el) el.value='';});
});
document.addEventListener('click',e=>{
  const btn=e.target.closest('#flight_table button'); if(!btn)return;
  const idx=Number(btn.dataset.idx); if(isNaN(idx))return;
  if(btn.dataset.act==='del-flight'){
    currentFlights.splice(idx,1); renderFlightTable(); $('#flight_feedback').textContent='Gelöscht'; setTimeout(()=>{if($('#flight_feedback').textContent==='Gelöscht')$('#flight_feedback').textContent='';},1500); if(editingFlightIndex===idx) {editingFlightIndex=null; $('#add_flight_data').textContent='Flug hinzufügen';}
  } else if(btn.dataset.act==='edit-flight'){
    const f=currentFlights[idx]; if(!f)return; editingFlightIndex=idx; $('#flight_date').value=f.date||''; $('#flight_dep').value=f.dep||''; $('#flight_arr').value=f.arr||''; $('#flight_time').value=f.time||''; $('#flight_routing').value=f.routing||''; $('#add_flight_data').textContent='Flug aktualisieren'; $('#flight_feedback').textContent='Bearbeite Flug '+(idx+1); setTimeout(()=>{if($('#flight_feedback').textContent.startsWith('Bearbeite Flug'))$('#flight_feedback').textContent='';},3000);
  }
});

function makeSCOR(ref){const base=(ref||'').replace(/\s+/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');const prep=base+'RF00';let mod=0;for(const ch of prep.replace(/[A-Z]/g,c=>(c.charCodeAt(0)-55)))mod=(mod*10+Number(ch))%97;return 'RF'+String(98-mod).padStart(2,'0')+base;}
function buildSPC({creditor,amount,currency='CHF',debtor,referenceType='NON',reference='',message=''}){const L=[];L.push('SPC','0200','1',creditor.account.replace(/\s+/g,''),'S',creditor.name,creditor.address,String(creditor.buildingNumber||''),String(creditor.zip||''),creditor.city,creditor.country,'','','','','','', '',amount?Number(amount).toFixed(2):'',currency);if(debtor&&debtor.name){L.push('S',debtor.name,debtor.address||'',String(debtor.buildingNumber||''),String(debtor.zip||''),String(debtor.city||''),debtor.country||'CH');}else{L.push('','','','','','','');}L.push(referenceType,referenceType==='NON'?'':reference,message||'','EPD');return L.join('\n');}

// QR Code Funktionalität entfernt
// Passagiere
const currentPassengers=[]; // {fname,lname,customerIndex|null}
// Texte
const currentTexts=[]; // {text}
function renderTextList(){
  const tb=$('#text_list');
  if(!tb)return;
  if(!currentTexts.length){tb.innerHTML='<tr><td colspan="3" class="muted">Noch keine Texte.</td></tr>';return;}
  tb.innerHTML='';
  currentTexts.forEach((t,i)=>{
    const tr=document.createElement('tr');
    tr.draggable=true;
    tr.dataset.text=String(i);
    tr.dataset.row='1';
    tr.innerHTML=`<td>${i+1}</td><td>${esc(t.text)}</td><td class='right'><button class='btn sm' data-act='edit' data-idx='${i}'>Edit</button> <button class='btn warn sm' data-tx='${i}'>✕</button></td>`;
    tr.addEventListener('dragstart',e=>{ try{ e.dataTransfer.setData('text/plain',''); }catch{} tr.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
    tr.addEventListener('dragend',()=>{
      tr.classList.remove('dragging');
      const order = Array.from(tb.querySelectorAll('tr[data-row]')).map(r=>Number(r.dataset.text)).filter(n=>!Number.isNaN(n));
      if(order.length===currentTexts.length){
        const newArr = order.map(idx=>currentTexts[idx]);
        currentTexts.length=0; newArr.forEach(x=>currentTexts.push(x));
        renderTextList();
      }
    });
    tb.append(tr);
  });
  if(!tb.dataset.dragInit){
    tb.addEventListener('dragover',e=>{
      e.preventDefault();
      const dragging=tb.querySelector('tr.dragging');
      if(!dragging) return;
      const after=getDragAfterElement(tb,e.clientY);
      if(after==null){ tb.append(dragging); } else { tb.insertBefore(dragging,after); }
    });
    tb.dataset.dragInit='1';
  }
}
function renderPassengerList(){
  const tb=$('#passenger_list');
  if(!tb)return;
  if(!currentPassengers.length){tb.innerHTML='<tr><td colspan="4" class="muted">Noch keine Passagiere.</td></tr>';return;}
  tb.innerHTML='';
  currentPassengers.forEach((p,i)=>{
    const tr=document.createElement('tr');
    tr.draggable=true;
    tr.dataset.pass=String(i);
    tr.dataset.row='1';  // so getDragAfterElement picks es up
    tr.innerHTML=`<td>${i+1}</td><td>${esc(p.fname)}</td><td>${esc(p.lname)}</td><td class='right'><button class='btn warn sm' data-px='${i}'>✕</button></td>`;
    tr.addEventListener('dragstart',e=>{ try{ e.dataTransfer.setData('text/plain',''); }catch{} tr.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
    tr.addEventListener('dragend',()=>{
      tr.classList.remove('dragging');
      // Commit new order back to currentPassengers based on DOM row order
      const order = Array.from(tb.querySelectorAll('tr[data-row]')).map(r=>Number(r.dataset.pass)).filter(n=>!Number.isNaN(n));
      if(order.length===currentPassengers.length){
        const newArr = order.map(idx=>currentPassengers[idx]);
        currentPassengers.length=0; newArr.forEach(x=>currentPassengers.push(x));
        renderPassengerList();
      }
    });
    tb.append(tr);
  });
  // Attach dragover once on tbody to handle reordering while dragging
  if(!tb.dataset.dragInit){
    tb.addEventListener('dragover',e=>{
      e.preventDefault();
      const dragging=tb.querySelector('tr.dragging');
      if(!dragging) return;
      const after=getDragAfterElement(tb,e.clientY);
      if(after==null){ tb.append(dragging); } else { tb.insertBefore(dragging,after); }
    });
    tb.dataset.dragInit='1';
  }
}

// Enable drag-and-drop sorting for passengers
(function(){
  const tb = $('#passenger_list');
  if(!tb) return;

  // --- DRAG & DROP ---
  // Passenger rows are draggable; add dragstart/dragend to apply new order to currentPassengers
  function renderPassengerList(){
    const tb=$('#passenger_list');
    if(!tb)return;
    if(!currentPassengers.length){tb.innerHTML='<tr><td colspan="4" class="muted">Noch keine Passagiere.</td></tr>';return;}
    tb.innerHTML='';
    currentPassengers.forEach((p,i)=>{
      const tr=document.createElement('tr');
      tr.draggable=true;
      tr.dataset.pass=String(i);
      tr.innerHTML=`<td>${i+1}</td><td>${esc(p.fname)}</td><td>${esc(p.lname)}</td><td class='right'><button class='btn warn sm' data-px='${i}'>✕</button></td>`;
      tr.addEventListener('dragstart',e=>{ try{ e.dataTransfer.setData('text/plain',''); }catch{} tr.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
      tr.addEventListener('dragend',()=>{
        tr.classList.remove('dragging');
        // Commit new order back to currentPassengers based on DOM row order
        const order = Array.from(tb.querySelectorAll('tr')).map(r=>Number(r.dataset.pass)).filter(n=>!Number.isNaN(n));
        if(order.length===currentPassengers.length){
          const newArr = order.map(idx=>currentPassengers[idx]);
          currentPassengers.length=0; newArr.forEach(x=>currentPassengers.push(x));
          renderPassengerList();
        }
      });
      tb.append(tr);
    });
    // Attach dragover once on tbody to handle reordering while dragging
    if(!tb.dataset.dragInit){
      tb.addEventListener('dragover',e=>{
        e.preventDefault();
        const dragging=tb.querySelector('tr.dragging');
        if(!dragging) return;
        const after=getDragAfterElement(tb,e.clientY);
        if(after==null){ tb.append(dragging); } else { tb.insertBefore(dragging,after); }
      });
      tb.dataset.dragInit='1';
    }
  }

  renderPassengerList();
})();

$('#add_passenger')?.addEventListener('click',()=>{const idx=$('#passenger_customer_select').value;const fname=$('#passenger_fname').value.trim();const lname=$('#passenger_lname').value.trim();if(!fname||!lname){$('#passenger_feedback').textContent='Vor- & Nachname nötig';return;}currentPassengers.push({fname,lname,customerIndex: idx!==''?Number(idx):null});$('#passenger_fname').value='';$('#passenger_lname').value='';$('#passenger_feedback').textContent='Hinzugefügt';renderPassengerList();});
$('#add_text')?.addEventListener('click',()=>{const text=$('#text_input').value.trim();if(!text){$('#text_feedback').textContent='Text nötig';return;}currentTexts.push({text});$('#text_input').value='';$('#text_feedback').textContent='Hinzugefügt';renderTextList();});
$('#passenger_customer_select')?.addEventListener('change',e=>{const name=e.target.value; if(!name){return;} const c=customers.find(cust=>{const custName=cust.isCompany?cust.companyName:`${cust.fname} ${cust.lname}`;return custName===name;}); if(!c)return; if(c.isCompany){ $('#passenger_fname').value='';$('#passenger_lname').value=c.companyName;}else{$('#passenger_fname').value=c.fname||'';$('#passenger_lname').value=c.lname||'';}}
);
document.addEventListener('click',e=>{const b=e.target.closest('#passenger_table button[data-px]');if(!b)return;const i=Number(b.dataset.px);if(isNaN(i))return;currentPassengers.splice(i,1);renderPassengerList();});
document.addEventListener('click',e=>{const b=e.target.closest('#text_table button[data-tx]');if(!b)return;const i=Number(b.dataset.tx);if(isNaN(i))return;currentTexts.splice(i,1);renderTextList();});

$('#text_table')?.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  const i=Number(b.dataset.idx); const t=currentTexts[i]; if(!t) return;
  
  if(b.dataset.act==='edit'){
    // Fill main form with text data
    $('#text_input').value = t.text || '';

    // Change button logic
    $('#add_text').classList.add('hidden');
    const updateButton = $('#update_text');
    const cancelButton = $('#cancel_update_text');
    
    updateButton.classList.remove('hidden');
    cancelButton.classList.remove('hidden');
    updateButton.dataset.idx = i; // Store index for update operation

    // Scroll to form
    $('#add_text').closest('.card').scrollIntoView({ behavior: 'smooth' });
    return;
  }
});

$('#save_invoice')?.addEventListener('click',()=>{const status=$('#status');status.textContent='';const firm=getSelectedFirm();if(!firm){alert('Keine Firma');return;}const custName=$('#sel_customer').value;const cust=customers.find(c=>{const name=c.isCompany?c.companyName:`${c.fname} ${c.lname}`;return name===custName;});if(!cust){alert('Kunde fehlt');return;}const title=($('#inv_title')?.value||'').trim();if(!title){alert('Titel fehlt');$('#inv_title').focus();return;}const rows=Array.from($('#items tbody').querySelectorAll('tr[data-row]'));const items=rows.map((tr,i)=>({pos:i+1,name:tr.children[1].textContent.trim(),qty:Number(tr.querySelector('.cell-qty input').value),price:Number(tr.querySelector('.cell-price input').value),total:Number(tr.dataset.total)}));if(!items.length){alert('Position hinzufügen');return;}const customerIndex=customers.indexOf(cust);if(editingInvoiceId){const inv=invoices.find(i=>i.id===editingInvoiceId);if(inv){inv.no=$('#inv_no').value||inv.no;inv.title=title;inv.firmId=firm.id;inv.customerIndex=customerIndex;inv.vat=Number($('#vat').value||0);inv.items=items;inv.total=$('#grand').textContent;inv.flights=currentFlights.map(f=>({...f}));inv.passengers=currentPassengers.map(p=>({...p}));inv.texts=currentTexts.map(t=>({...t}));}editingInvoiceId=null;status.textContent='✅ Aktualisiert';}else{const auto=$('#inv_auto_no')?.checked; if(auto){ const newNo=consumeInvoiceNoForFirm(firm); $('#inv_no').value=newNo; } const inv={id:Date.now(),no:$('#inv_no').value||String(Date.now()),title,firmId:firm.id,customerIndex,vat:Number($('#vat').value||0),items,total:$('#grand').textContent,created:new Date().toISOString(),flights:currentFlights.map(f=>({...f})),passengers:currentPassengers.map(p=>({...p})),texts:currentTexts.map(t=>({...t})),issued:false};invoices.push(inv);status.textContent='💾 Gespeichert';$('#inv_title').value='';}
LS.set('invoices',invoices);renderSavedInvoices();renderIssuedInvoices();renderPaidInvoices();});
// Druck mit QR entfernt

function renderSavedInvoices(){
  const tb=$('#saved_invoices_list');
  if(!tb) return;
  const list=invoices.filter(i=>!i.issued);
  if(!list.length){tb.innerHTML='<tr><td colspan="7" class="muted">Noch keine gespeicherten Rechnungen.</td></tr>';return;}
  tb.innerHTML='';
  list.slice().sort((a,b)=>b.id-a.id).forEach(inv=>{
    const firm=firms.find(f=>f.id===inv.firmId);
    const cust=customers[inv.customerIndex];
    const custName=cust? (cust.isCompany?cust.companyName:`${cust.fname} ${cust.lname}`):'—';
    const firmName=firm?firm.name:'—';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(inv.no)}</td><td>${esc(inv.title||'')}</td><td>${new Date(inv.created).toLocaleDateString()}</td><td>${esc(custName)}</td><td>${esc(firmName)}</td><td class='right'>${esc(inv.total)}</td><td class='right'><button class='btn sm' data-act='edit' data-id='${inv.id}'>Edit</button> <button class='btn sm' data-act='issue' data-id='${inv.id}'>Stellen</button> <button class='btn sm' data-act='view' data-id='${inv.id}'>Anzeigen</button> <button class='btn warn sm' data-act='del' data-id='${inv.id}'>✕</button></td>`;
    tb.append(tr);
  });
}
function renderIssuedInvoices(){
  const tb=$('#issued_invoices_list');
  if(!tb)return;
  const list=invoices.filter(i=>i.issued && !i.paid);
  if(!list.length){tb.innerHTML='<tr><td colspan="7" class="muted">Keine gestellten Rechnungen.</td></tr>';return;}
  tb.innerHTML='';
  list.slice().sort((a,b)=>b.id-a.id).forEach(inv=>{
    const firm=firms.find(f=>f.id===inv.firmId);
    const cust=customers[inv.customerIndex];
    const custName=cust?(cust.isCompany?cust.companyName:`${cust.fname} ${cust.lname}`):'—';
    const firmName=firm?firm.name:'—';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(inv.no)}</td><td>${esc(inv.title||'')}</td><td>${new Date(inv.created).toLocaleDateString()}</td><td>${esc(custName)}</td><td>${esc(firmName)}</td><td class='right'>${esc(inv.total)}</td><td class='right'><button class='btn sm' data-act='view' data-id='${inv.id}'>Anzeigen</button> <button class='btn ok sm' data-act='paid' data-id='${inv.id}'>Bezahlt</button> <button class='btn warn sm' data-act='del' data-id='${inv.id}'>✕</button></td>`;
    tb.append(tr);
  });
}

// New: render paid invoices
function renderPaidInvoices(){
  // Try common tbody ids; fall back to the table's tbody
  const tb = document.querySelector('#paid_invoices_list') || document.querySelector('#paid_invoices_table tbody');
  if(!tb) return;
  const list=invoices.filter(i=>i.paid);
  if(!list.length){tb.innerHTML='<tr><td colspan="7" class="muted">Keine bezahlten Rechnungen.</td></tr>';return;}
  tb.innerHTML='';
  list.slice().sort((a,b)=>b.id-a.id).forEach(inv=>{
    const firm=firms.find(f=>f.id===inv.firmId);
    const cust=customers[inv.customerIndex];
    const custName=cust?(cust.isCompany?cust.companyName:`${cust.fname} ${cust.lname}`):'—';
    const firmName=firm?firm.name:'—';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(inv.no)}</td><td>${esc(inv.title||'')}</td><td>${new Date(inv.created).toLocaleDateString()}</td><td>${esc(custName)}</td><td>${esc(firmName)}</td><td class='right'>${esc(inv.total)}</td><td class='right'><button class='btn sm' data-act='view' data-id='${inv.id}'>Anzeigen</button> <button class='btn warn sm' data-act='del' data-id='${inv.id}'>✕</button></td>`;
    tb.append(tr);
  });
}

function handleInvoiceButton(b){
  const id=Number(b.dataset.id);
  const idx=invoices.findIndex(i=>i.id===id);
  if(idx<0)return;
  const act=b.dataset.act;
  if(act==='del'){
    if(confirm('Rechnung löschen?')){invoices.splice(idx,1);LS.set('invoices',invoices);renderSavedInvoices();renderIssuedInvoices();renderPaidInvoices();}
    return;
  }
  if(act==='issue'){
    invoices[idx].issued=true;LS.set('invoices',invoices);renderSavedInvoices();renderIssuedInvoices();return;
  }
  if(act==='paid'){
    const inv=invoices[idx];
    const label = inv?.no ? `Nr. ${inv.no}` : (inv?.title ? `"${inv.title}"` : '');
    if(!confirm(`Soll die Rechnung ${label} als bezahlt markiert und verschoben werden?`)) return;
    invoices[idx].issued=true; // ensure state
    invoices[idx].paid=true;
    LS.set('invoices',invoices);
    renderIssuedInvoices();
    renderPaidInvoices();
    return;
  }
  if(act==='edit'){
    const inv=invoices[idx];editingInvoiceId=inv.id;showView('create');refreshDropdowns();
    $('#inv_title').value=inv.title||'';$('#inv_no').value=inv.no||'';$('#firm_select').value=String(inv.firmId);
    const cust=customers[inv.customerIndex];
    if(cust){
      const custName=cust.isCompany?cust.companyName:`${cust.fname} ${cust.lname}`;
      $('#sel_customer').value=custName;
    }
    $('#vat').value=inv.vat||0;
    $('#items tbody').innerHTML='';inv.items.forEach(it=>createRow({name:it.name,qty:it.qty,price:it.price}));
    currentFlights.length=0; if(Array.isArray(inv.flights))inv.flights.forEach(f=>currentFlights.push({...f})); renderFlightTable();
    currentPassengers.length=0; if(Array.isArray(inv.passengers))inv.passengers.forEach(p=>currentPassengers.push({...p})); renderPassengerList();
    currentTexts.length=0; if(Array.isArray(inv.texts))inv.texts.forEach(t=>currentTexts.push({...t})); renderTextList();
    const status=$('#status'); if(status) status.textContent='Bearbeitung aktiv – Speichern aktualisiert';
    return;
  }
  if(act==='view'){
    const inv=invoices[idx];
    const firm=firms.find(f=>f.id===inv.firmId)||{};
    const cust=customers[inv.customerIndex]||{};
    const fmtDate=d=>{try{return new Date(d).toLocaleDateString('de-CH');}catch{return d||'';}};
    const itemsRows=inv.items.map(it=>`<tr><td>${it.pos}</td><td>${escapeHTML(it.name ?? it.description ?? it.title ?? it.text ?? '')}</td>
<td>${it.qty}</td><td>${it.price.toFixed(2)}</td><td>${it.total.toFixed(2)}</td></tr>`).join('');
    const subtotal=inv.items.reduce((s,it)=>s+it.total,0);
    const vatRate=Number(inv.vat||0);
    const vatAmt=subtotal*(vatRate/100);
    const grand=subtotal+vatAmt;
    let flightsBlock='';
    if(inv.flights&&inv.flights.length){
      const fr=inv.flights.map((f,i)=>`<tr><td>${i+1}</td><td>${escapeHTML(f.date||'')}</td><td>${escapeHTML(f.dep||'')}</td><td>${escapeHTML(f.arr||'')}</td><td>${escapeHTML(f.time||'')}</td><td>${escapeHTML(f.routing||'')}</td></tr>`).join('');
      flightsBlock=`<h3>Flugdaten</h3><table class='table small'><thead><tr><th>#</th><th>Datum</th><th>Departure ICAO</th><th>Arrival ICAO</th><th>Flight Time</th><th>Routing</th></tr></thead><tbody>${fr}</tbody></table>`;
    }
    let paxBlock='';
    if(inv.passengers&&inv.passengers.length){
      paxBlock=`<h3>Passagiere</h3><ul class='pax'>${inv.passengers.map(p=>`<li>${esc(p.fname)} ${esc(p.lname)}</li>`).join('')}</ul>`;
    }
    let textBlock='';
    if(inv.texts&&inv.texts.length){
      textBlock=`<h3>Zusätzliche Informationen</h3><ul class='pax'>${inv.texts.map(t=>`<li>${esc(t.text)}</li>`).join('')}</ul>`;
    }
    let termsBlock='';
    if(firm.terms){
      termsBlock=`<h3>Rechnungsbedingungen</h3><div class='refBox'>${esc(firm.terms).replace(/\n/g,'<br>')}</div>`;
    }
    const refType=document.querySelector('input[name="reftype"]:checked')?.value||'NON';
    const refVal=($('#ref_input')?.value||'').trim();
    const reference=(refType==='SCOR')? (refVal||makeSCOR(inv.no||inv.id)) : '';
    const msg=$('#message')?.value||'';
    const firmAddr=`${esc(firm.street||'')} ${esc(firm.no||'')}<br>${esc(firm.zip||'')} ${esc(firm.city||'')}<br>${esc(firm.country||'')}`;
    const custName=cust.isCompany?esc(cust.companyName||''):`${esc(cust.fname||'')} ${esc(cust.lname||'')}`.trim();
    const custAddr=`${esc(cust.street||'')} ${esc(cust.no||'')}<br>${esc(cust.zip||'')} ${esc(cust.city||'')}<br>${esc(cust.country||'')}`;
    // Minimal: prepare logo or name for header
    const logoOrName = firm.logo ? `<img src="${firm.logo}" alt="Logo" style="max-height:36mm;width:auto;object-fit:contain;display:block">` : esc(firm.name||'Firma');
    const style=`<style>
      :root{--font:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}
      body{font:12px/1.35 var(--font);margin:0;background:#0b1220;padding:0;color:#e5e7eb}
      .sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:18mm 18mm 20mm;box-sizing:border-box;position:relative;color:#000}
      .qr-page{width:210mm;height:297mm;margin:0 auto;background:#fff;padding:0;box-sizing:border-box;position:relative;page-break-before:always;display:flex;align-items:flex-end;justify-content:center;padding-bottom:20mm;}
      .qr-page img{width:210mm;height:auto;max-height:277mm;object-fit:contain;}
      h1{margin:0 0 6mm;font:700 20px var(--font);letter-spacing:.5px;color:#1f2937}
      h2{margin:14px 0 4px;font:600 14px var(--font);color:#374151} h3{margin:12px 0 4px;font:600 12px var(--font);color:#4b5563}
      .meta{display:flex;justify-content:space-between;margin-bottom:10mm;}
      .bloc{max-width:46%;}
      .small{font-size:11px;color:#6b7280;}
      table{border-collapse:collapse;width:100%;}
      .table{background:#fff;color:#000;border:1px solid #d1d5db}
      .table th,.table td{border:1px solid #d1d5db;padding:4px 6px;vertical-align:top;}
      .table th{background:#f9fafb;color:#374151;}
      .table tbody tr:nth-child(even){background:#f9fafb}
      .items th{background:#f3f4f6;color:#374151;border-color:#d1d5db;}
      .r{text-align:right;}
      .totals{margin-top:4mm;max-width:60mm;margin-left:auto;border:1px solid #d1d5db}
      .totals td{padding:4px 8px;border-bottom:1px solid #d1d5db}
      .highlight{font-weight:600;border-top:2px solid #374151;background:#f3f4f6}
      ul.pax{margin:2mm 0 4mm 4mm;padding:0;}
      ul.pax li{margin:0 0 2px;}
      .refBox{margin-top:6mm;padding:8px 12px;border:1px solid #d1d5db;background:#f9f9f9;font-size:11px;color:#374151}
      .footer{position:absolute;left:0;right:0;bottom:10mm;text-align:center;font-size:10px;color:#6b7280;}
      .headFlex{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4mm;border-bottom:2px solid #e5e7eb;padding-bottom:4mm;}
      .logoBox{font-size:18px;font-weight:600;letter-spacing:.5px;color:#1f2937}
      .firmInfo{text-align:right;font-size:11px;color:#374151;line-height:1.4}
      .firmName{font-size:14px;font-weight:600;color:#1f2937;margin-bottom:2mm}
      .actionsBar{position:fixed;top:6px;right:8px;display:flex;gap:6px;}
      .actionsBar button{background:#1f2937;color:#fff;border:0;padding:6px 10px;border-radius:4px;cursor:pointer;font:12px var(--font);} .actionsBar button:nth-child(2){background:#2563eb;}
      @media print{.actionsBar{display:none;} body{background:#fff;color:#000} .sheet{box-shadow:none;margin:0;background:#fff;color:#000} .qr-page{background:#fff;}}
    </style>`;
    const html=`<!doctype html><html><head><meta charset='utf-8'><title>Rechnung ${esc(inv.no)}</title>${style}</head><body><div class='actionsBar no-print'><button onclick='window.close()'>Schliessen</button><button onclick='window.print()'>Drucken / PDF</button></div><div class='sheet'><div class='headFlex'><div class='logoBox'>${logoOrName}</div><div class='firmInfo'><div class='firmName'>${esc(firm.name||'')}</div>${firmAddr}</div></div><h1>${esc(inv.title||'Rechnung')}</h1><div class='meta'><div class='bloc'><h2>Rechnung an</h2><strong>${custName||'—'}</strong><br>${custAddr}</div><div class='bloc'><table style='width:100%;font-size:11px' class='table'><tr><td>Nr.</td><td>${esc(inv.no||'')}</td></tr><tr><td>Datum</td><td>${fmtDate(inv.created)}</td></tr><tr><td>MWST</td><td>${vatRate.toFixed(2)}%</td></tr>${reference?`<tr><td>Referenz</td><td>${esc(reference)}</td></tr>`:''}</table></div></div><h2>Leistungen</h2><table class='table items'><thead><tr><th style='width:18mm'>Pos</th><th>Bezeichnung</th><th style='width:22mm'>Menge</th><th style='width:26mm'>Preis</th><th style='width:28mm'>Total</th></tr></thead><tbody>${itemsRows || '<tr><td colspan="5" class="empty">Keine Positionen</td></tr>'}</tbody></table><div class="totals"><table><tr><td>Zwischensumme</td><td class="right">${subtotal.toFixed(2)}</td></tr><tr><td>MWST ${vatRate.toFixed(2)}%</td><td class="right">${vatAmt.toFixed(2)}</td></tr><tr class="total"><td>GESAMT</td><td class="right">${grand.toFixed(2)}</td></tr></table></div>${flightsBlock}${paxBlock}${textBlock}${msg?`<div class="note"><strong>Mitteilung:</strong> ${escapeHTML(inv.message)}</div>`:''}${termsBlock}</div>${firm.qrSvg?`<div class='qr-page'><img src="${firm.qrSvg}" alt="QR Einzahlungschein"></div>`:''}</body></html>`;
    const w=window.open('', '_blank');
    if(!w)return;w.document.write(html);w.document.close();
    return;
  }
}
// Zielgerichtete Listener nur auf den Tabellen
$('#saved_invoices_table')?.addEventListener('click',e=>{const b=e.target.closest('button[data-act]');if(b)handleInvoiceButton(b);});
$('#issued_invoices_table')?.addEventListener('click',e=>{const b=e.target.closest('button[data-act]');if(b)handleInvoiceButton(b);});
$('#paid_invoices_table')?.addEventListener('click',e=>{const b=e.target.closest('button[data-act]');if(b)handleInvoiceButton(b);});

// Initiale Render-Aufrufe für Rechnungslisten
renderSavedInvoices();
renderIssuedInvoices();
renderPaidInvoices();

// Initial renders
renderFirmList();renderCustomerList();renderProductList();refreshDropdowns();
// Falls direkt zu Saved navigiert wird
if(location.hash==='#saved')showView('saved');

// Setup all tables with sorting
(function setupAllTableSortings(){
  // Customers
  setupTableSorting('cust_table', customers, renderCustomerList);
  
  // Products
  setupTableSorting('prod_table', products, renderProductList);
  
  // Saved Invoices
  setupTableSorting('saved_invoices_table', invoices.filter(i=>!i.issued), renderSavedInvoices);
  
  // Issued Invoices
  setupTableSorting('issued_invoices_table', invoices.filter(i=>i.issued && !i.paid), renderIssuedInvoices);
  
  // Paid Invoices
  setupTableSorting('paid_invoices_table', invoices.filter(i=>i.paid), renderPaidInvoices);
})();

// --- Sichern / Laden (neu) ---
(function(){
  var wired = false;
  function byId(id){ return document.getElementById(id); }
  function setStatus(msg, isError){
    var el = byId('sichern_status');
    if (!el) return;
    el.textContent = msg || '';
    if (el.classList) el.classList.toggle('danger', !!isError);
  }
  function collectAllLocalStorage(){
    var data = {};
    for (var i=0;i<localStorage.length;i++){
      var key = localStorage.key(i);
      try { data[key] = localStorage.getItem(key); } catch(e){}
    }
    return data;
  }
  function exportAll(){
    var payload = {
      type: 'Rechnungstool-Backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      origin: location.origin,
      data: collectAllLocalStorage()
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var ts = new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
    a.download = 'rechnungstool-backup-' + ts + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 0);
    setStatus('Export erstellt.');
  }
  function importFromFile(file){
    var reader = new FileReader();
    reader.onerror = function(){ setStatus('Datei konnte nicht gelesen werden.', true); };
    reader.onload = function(){
      try{
        var obj = JSON.parse(reader.result);
        var data = obj && obj.data && typeof obj.data==='object' ? obj.data : obj;
        if (!data || typeof data!== 'object'){ setStatus('Ungültiges JSON-Format.', true); return; }
        var imported = 0, failed = 0;
        Object.keys(data).forEach(function(k){
          var v = data[k];
          if (typeof v !== 'string') { try { v = JSON.stringify(v); } catch(_) { v = String(v); } }
          try { localStorage.setItem(k, v); imported++; }
          catch(e){ failed++; }
        });
        // Post-Import Normalisierung: fehlende Felder ergänzen (kompatibel, ohne Funktionen zu ändern)
        try{
          var invStr = localStorage.getItem('invoices');
          if(invStr){
            var invArr = JSON.parse(invStr);
            if(Array.isArray(invArr)){
              var invChanged = false;
              invArr.forEach(function(inv){ if(!Array.isArray(inv.texts)) { inv.texts = []; invChanged = true; } });
              if(invChanged) localStorage.setItem('invoices', JSON.stringify(invArr));
            }
          }
          var firmsStr = localStorage.getItem('firms');
          if(firmsStr){
            var firmArr = JSON.parse(firmsStr);
            if(Array.isArray(firmArr)){
              var firmChanged = false;
              firmArr.forEach(function(f){ if(f.terms==null) { f.terms=''; firmChanged = true; } });
              if(firmChanged) localStorage.setItem('firms', JSON.stringify(firmArr));
            }
          }
        }catch(_){ /* still continue */ }
        if (failed===0) setStatus('Import erfolgreich. Seite neu laden empfohlen.');
        else setStatus('Import teilweise erfolgreich: ' + imported + ' ok, ' + failed + ' Fehler.', true);
      }catch(e){ setStatus('Import fehlgeschlagen: Ungültiges JSON.', true); }
    };
    reader.readAsText(file);
  }
  function replaceWithClone(el){ if (!el || !el.parentNode) return el; var c = el.cloneNode(true); el.parentNode.replaceChild(c, el); return c; }
  function wire(){
    if (wired) return;
    var exportBtn = byId('export_json_btn');
    var importBtn = byId('import_json_btn');
    var fileInput = byId('import_json_input');
    if (!exportBtn || !importBtn || !fileInput) return; // view not present
    // Remove any previously attached listeners by cloning
    exportBtn = replaceWithClone(exportBtn);
    importBtn = replaceWithClone(importBtn);
    fileInput = replaceWithClone(fileInput);
    // Bind a single set of listeners (capture to avoid duplicates)
    exportBtn.addEventListener('click', function(e){ e.stopImmediatePropagation && e.stopImmediatePropagation(); exportAll(); }, true);
    importBtn.addEventListener('click', function(e){ e.stopImmediatePropagation && e.stopImmediatePropagation(); fileInput.value=''; fileInput.click(); }, true);
    fileInput.addEventListener('change', function(e){ var f = e.target.files && e.target.files[0]; if (f) importFromFile(f); }, true);
    wired = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
});
(function(){
  // Utility escape if not present
  if (typeof window.escapeHTML !== 'function') {
    window.escapeHTML = function(str){
      return (str==null?'':String(str)).replace(/[&<>"]|'/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[s]));
    };
  }
  
  function fmt(n){return 'CHF ' + Number(n||0).toFixed(2);}  
  function formatDate(d){ if(!d) return ''; try { return new Date(d).toLocaleDateString('de-CH'); } catch(e){ return d||''; } }

  // Build pretty invoice HTML
  window.openInvoicePreview = function(inv){
    const wrap = document.getElementById('invoice_preview');
    const container = document.getElementById('invoice_print_container');
    if(!wrap||!container) return;

    const firm = inv.firm || {};
    // Neue robuste IBAN-Erkennung
    const firmIban = ['iban','IBAN','cred_iban','ibanNr','iban_no'].map(k=>firm[k]).find(v=>v && String(v).trim().length>0) || '';

    const cust = inv.customer || {};
    const items = inv.items || [];
    const flights = inv.flights || [];
    const passengers = inv.passengers || [];
    const totals = inv.totals || {sum:0, vat:0, grand:0};

    function addrBlock(p){
      const lines = [];
      if(p.company) lines.push(escapeHTML(p.company));
      else if(p.name) lines.push(escapeHTML(p.name));
      const nameLine = [p.fname,p.lname].filter(Boolean).join(' ');
      if(nameLine && !p.company) lines.push(escapeHTML(nameLine));
      const streetLine = [p.street,p.no].filter(Boolean).join(' ');
      if(streetLine) lines.push(escapeHTML(streetLine));
      const cityLine = [p.zip,p.city].filter(Boolean).join(' ');
      if(cityLine) lines.push(escapeHTML(cityLine));
      if(p.country) lines.push(escapeHTML(p.country));
      return lines.join('<br>');
    }

    const firmAddr = addrBlock(firm);
    const custAddr = addrBlock(cust);

    const itemsRows = items.map((it,i)=>`<tr><td>${escapeHTML(it.name||'')}</td><td class="right">${it.qty}</td><td class="right">${Number(it.price||0).toFixed(2)}</td><td class="right">${Number((it.qty||0)*(it.price||0)).toFixed(2)}</td></tr>`).join('');

    const flightsTable = flights.length ? `<table class="striped"><thead><tr><th>#</th><th>Datum</th><th>Departure ICAO</th><th>Arrival ICAO</th><th>Flight Time</th><th>Routing</th></tr></thead><tbody>${flights.map((f,i)=>`<tr><td>${i+1}</td><td>${escapeHTML(f.date||'')}</td><td>${escapeHTML(f.dep||'')}</td><td>${escapeHTML(f.arr||'')}</td><td>${escapeHTML(f.time||'')}</td><td>${escapeHTML(f.routing||'')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Keine Flugdaten</div>';

    const paxTable = passengers.length ? `<table class="striped"><thead><tr><th>#</th><th>Vorname</th><th>Nachname</th></tr></thead><tbody>${passengers.map((p,i)=>`<tr><td>${i+1}</td><td>${escapeHTML(p.fname||'')}</td><td>${escapeHTML(p.lname||'')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Keine Passagiere</div>';

    const vatPct = inv.vatPct!=null? Number(inv.vatPct):0;
    const ref = inv.reference || '';

    const paymentInfo = `<div class="pay-info"><strong>Zahlungsinformation:</strong><br>${firm.name? escapeHTML(firm.name)+'<br>':''}${firmIban? ('IBAN: '+escapeHTML(firmIban)+'<br>'):''}Bitte überweisen Sie den Gesamtbetrag innerhalb von 30 Tagen ohne Abzüge.</div>`;

    container.innerHTML = `
      <div class="title-row">
        <div>
          <h1>${escapeHTML(inv.title || 'Rechnung')}</h1>
          <!-- Removed creation date line -->
        </div>
        <div class="doc-id">
          <div><strong>Rechnungsnr.:</strong> ${escapeHTML(inv.number||'')}</div>
          ${inv.issued ? '<div class="badge">GESTELLT</div>':''}
          ${inv.paid ? '<div class="badge" style="background:#059669">BEZAHLT</div>':''}
        </div>
      </div>
      <div class="meta-grid">
        <div class="panel firm"><strong>Aussteller</strong><br>${firmAddr || '<span class="empty">(keine Firmendaten)</span>'}${firmIban?'<br><span class="kv"><span>IBAN</span>'+escapeHTML(firmIban)+'</span>':''}</div>
        <div class="panel"><strong>Kunde</strong><br>${custAddr || '<span class="empty">(kein Kunde)</span>'}</div>
      </div>
      <h2>Positionen</h2>
      <table class="striped"><thead><tr><th>#</th><th>Bezeichnung</th><th>Menge</th><th>Preis CHF</th><th>Total CHF</th></tr></thead><tbody>${itemsRows || '<tr><td colspan="5" class="empty">Keine Positionen</td></tr>'}</tbody></table>
      <div class="totals">
        <table>
          <tr><td>Zwischensumme</td><td class="right">${totals.sum? Number(totals.sum).toFixed(2):'0.00'}</td></tr>
          <tr><td>MWST (${vatPct.toFixed(1)}%)</td><td class="right">${totals.vat? Number(totals.vat).toFixed(2):'0.00'}</td></tr>
          <tr class="total"><td>GESAMT</td><td class="right">${totals.grand? Number(totals.grand).toFixed(2):'0.00'}</td></tr>
        </table>
      </div>
      <div class="flights-passengers">
        <div class="section-box">
          <h3>Flugdaten (optional)</h3>
          ${flightsTable}
        </div>
        <div class="section-box">
          <h3>Passagiere</h3>
          ${paxTable}
        </div>
      </div>
      ${inv.message? `<div class="note"><strong>Mitteilung:</strong> ${escapeHTML(inv.message)}</div>`:''}
      ${ref? `<div class="ref-box"><strong>Referenz:</strong> ${escapeHTML(ref)}</div>`:''}
      ${paymentInfo}
    `;
    wrap.classList.remove('hidden');
  };

  // Bind preview modal buttons (once)
  document.addEventListener('click',function(e){
    const t=e.target;
    if(t.id==='close_preview'){document.getElementById('invoice_preview')?.classList.add('hidden');}
    if(t.id==='print_preview'){window.print();}
  });

  // Hook into existing invoice action handler if present
  const origHandle = window.handleInvoiceTableClick;
  window.handleInvoiceTableClick = function(ev){
    const btn = ev.target.closest('button[data-act]');
    if(!btn) return; 
    if(btn.dataset.act==='view'){
      ev.preventDefault();
      const id = btn.dataset.id; if(!id) return;
      const inv = (window.invoices||[]).find(i=>String(i.id)===String(id));
      if(inv) openInvoicePreview(inv);
      return; // prevent fallthrough to original
    }
    if(typeof origHandle==='function') origHandle(ev); // delegate others
  };
})();

// UI Design Tokens & Baseline Styles (minimal, scoped, a11y-safe)
(function injectUiTokens(){
  try{
    if(document.getElementById('ui_tokens')) return;
    const css = `
/* === UI Tokens (additiv, minimal) === */
:root{
  /* Spacing 4/8/16 Scale */
  --space-1: .25rem;  /* 4px  */
  --space-2: .5rem;   /* 8px  */
  --space-3: .75rem;  /* 12px */
  --space-4: 1rem;    /* 16px */
  --space-6: 1.5rem;  /* 24px */
  --space-8: 2rem;    /* 32px */

  /* Radius/Transitions */
  --radius-1: 6px;
  --radius-2: 8px;
  --dur-1: 160ms;
  --ease-1: ease-out;

  /* Typo (REM-Skala auf 16px Basis) */
  --fs-base: 1rem;     /* 16px */
  --fs-sm: .9375rem;   /* 15px */
  --fs-xs: .875rem;    /* 14px */
  --fs-h1: 1.5rem;     /* 24px */
  --fs-h2: 1.25rem;    /* 20px */
  --fs-h3: 1.125rem;   /* 18px */
  --lh-base: 1.45;
  --lh-tight: 1.25;

  /* Farben: neutral belassen, Fokus-Ring gut sichtbar */
  --focus: #6ea8fe;
}

/* Basis: Zeilenhöhe/Overflow-Fix, ohne Farben zu verändern */
html{ font-size:16px; }
body{ line-height: var(--lh-base); }
*,*::before,*::after{ box-sizing: border-box; }
img,svg,canvas{ max-width:100%; height:auto; display:block; }

/* Typo-Hierarchie – nur Größen/Abstände */
h1,h2,h3,h4,h5,h6{ line-height: var(--lh-tight); margin: 0 0 var(--space-3); }
h1{ font-size: var(--fs-h1); }
h2{ font-size: var(--fs-h2); }
h3{ font-size: var(--fs-h3); }

/* Views scopen, um globale Regressionen zu vermeiden */
#view-create, #view-firm, #view-customers, #view-products, #view-saved, #view-issued, #view-paid{
  --container-pad-x: var(--space-4);
  --container-pad-y: var(--space-4);
}

/* Formular-Layout Harmonisierung */
#view-create label,
#view-firm label,
#view-customers label,
#view-products label{
  display:block;
  margin: 0 0 var(--space-2);
  font-size: var(--fs-sm);
  line-height: var(--lh-tight);
}

/* Inputs/Select/Textareas – Größe, Padding, Radius, Fokus */
#view-create input:not([type="checkbox"]):not([type="radio"]),
#view-create select,
#view-create textarea,
#view-firm input:not([type="checkbox"]):not([type="radio"]),
#view-firm select,
#view-firm textarea,
#view-customers input:not([type="checkbox"]):not([type="radio"]),
#view-customers select,
#view-customers textarea,
#view-products input:not([type="checkbox"]):not([type="radio"]),
#view-products select,
#view-products textarea{
  width: 100%;
  min-height: 44px;
  padding: .625rem .75rem; /* ~10/12px */
  border-radius: var(--radius-2);
  line-height: var(--lh-base);
  transition: box-shadow var(--dur-1) var(--ease-1), transform var(--dur-1) var(--ease-1);
}

#view-create input:focus, #view-create select:focus, #view-create textarea:focus,
#view-firm input:focus,   #view-firm select:focus,   #view-firm textarea:focus,
#view-customers input:focus, #view-customers select:focus, #view-customers textarea:focus,
#view-products input:focus,  #view-products select:focus,  #view-products textarea:focus{
  outline: 2px solid var(--focus);
  outline-offset: 1px;
  box-shadow: 0 0 0 3px rgba(110,168,254,.2);
}

/* Buttons vereinheitlichen (Größe/Transitions) */
.btn{
  min-height: 40px;
  padding: .5rem .875rem;
  border-radius: var(--radius-2);
  line-height: 1;
  transition: opacity var(--dur-1) var(--ease-1), transform var(--dur-1) var(--ease-1);
}
.btn:hover{ opacity:.95; }
.btn:active{ transform: translateY(1px); }
.btn.sm{ min-height: 32px; padding: .375rem .625rem; }

/* Tabellen – Zell-Padding/Zeilenhöhe; horizontales Scrollen erlauben */
#view-saved table,
#view-issued table,
#view-paid table,
#view-products table,
#view-customers table{
  width: 100%;
  border-collapse: collapse;
}

#view-saved th, #view-saved td,
#view-issued th, #view-issued td,
#view-paid th, #view-paid td,
#view-products th, #view-products td,
#view-customers th, #view-customers td{
  padding: .625rem .75rem; /* 10/12px */
  line-height: var(--lh-base);
  vertical-align: middle;
  white-space: nowrap;
}

/* Sortierbare Tabellen-Header */
.sortable-header{
  cursor: pointer;
  user-select: none;
  position: relative;
}
.sortable-header:hover{
  background-color: rgba(255,255,255,0.1);
}
.sortable-header::after{
  content: ' ⇅';
  font-size: 12px;
  opacity: 0.5;
}
.sortable-header.sort-asc::after{
  content: ' ↑';
  opacity: 1;
}
.sortable-header.sort-desc::after{
  content: ' ↓';
  opacity: 1;
}

.table-wrap{ overflow-x: auto; }

/* Zeilenabstände in Formularblöcken (4/8/16-Scale) */
#view-create .form-row,
#view-firm .form-row,
#view-customers .form-row,
#view-products .form-row{ margin-bottom: var(--space-4); }

#view-create .form-row + .form-row,
#view-firm .form-row + .form-row,
#view-customers .form-row + .form-row,
#view-products .form-row + .form-row{ margin-top: var(--space-2); }

/* Kleinere Controls nebeneinander (bestehende Inline-Gruppen nicht brechen) */
.inline,
.row{ gap: var(--space-2); }

/* Responsiv – Typo und Paddings leicht zurücknehmen */
@media (max-width: 900px){
  :root{
    --fs-h1: 1.375rem; /* 22px */
    --fs-h2: 1.1875rem;/* 19px */
    --fs-h3: 1.0625rem;/* 17px */
  }
  #view-create, #view-firm, #view-customers, #view-products{
    --container-pad-x: var(--space-3);
    --container-pad-y: var(--space-3);
  }
  /* Tabellen dürfen umbrechen, um horizontales Scrollen zu reduzieren */
  #view-saved th, #view-saved td,
  #view-issued th, #view-issued td,
  #view-paid th, #view-paid td{
    white-space: normal;
  }
}

/* A11y: klare Fokusmarkierung auch auf Links in Listen/Aktionen */
a:focus, .btn:focus{
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}`;
    const st = document.createElement('style');
    st.id = 'ui_tokens';
    st.textContent = css;
    document.head.appendChild(st);
  }catch(e){}
})();
