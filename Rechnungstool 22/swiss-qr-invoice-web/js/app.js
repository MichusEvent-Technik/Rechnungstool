$('#firm_table')?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const idx=Number(b.dataset.idx);const f=firms[idx];if(!f)return;const act=b.dataset.act; if(act==='del'){if(!confirm('Firma löschen?'))return;const wasDef=f.id===defaultFirmId;firms.splice(idx,1);if(wasDef)defaultFirmId=firms[0]?.id||null;saveFirms();renderFirmList();return;} if(act==='def'){defaultFirmId=f.id;saveFirms();renderFirmList();return;} if(act==='edit'){const tr=b.closest('tr');tr.innerHTML=`<td colspan="7"><div class="row3" style="margin-bottom:8px"><div><label>Name</label><input id="e_f_name" value="${esc(f.name)}"/></div><div><label>IBAN</label><input id="e_f_iban" value="${esc(f.iban)}"/></div><div><label>Land</label><select id="e_f_country"><option ${f.country==='CH'?'selected':''}>CH</option><option ${f.country==='LI'?'selected':''}>LI</option></select></div></div><div class="row3"><div><label>Straße</label><input id="e_f_street" value="${esc(f.street)}"/></div><div><label>Nr.</label><input id="e_f_no" value="${esc(f.no||'')}"/></div><div><label>PLZ</label><input id="e_f_zip" value="${esc(f.zip)}"/></div></div><div class="row3"><div><label>Ort</label><input id="e_f_city" value="${esc(f.city)}"/></div><div style="align-self:end" class="inline"><button class="btn ok sm" data-act="save" data-idx="${idx}">Speichern</button><button class="btn sm" data-act="cancel">Abbruch</button></div><div></div></div></td>`;return;} if(act==='cancel'){renderFirmList();return;} if(act==='save'){const nf={name:$('#e_f_name').value.trim(),iban:$('#e_f_iban').value.trim(),country:$('#e_f_country').value,street:$('#e_f_street').value.trim(),no:$('#e_f_no').value.trim(),zip:$('#e_f_zip').value.trim(),city:$('#e_f_city').value.trim()};if(!nf.name||!nf.iban||!nf.street||!nf.zip||!nf.city){alert('Pflichtfelder fehlen');return;}if(!validIBAN(nf.iban)){alert('IBAN ungültig');return;}Object.assign(f,nf);saveFirms();renderFirmList();return;} });

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
    const tr=b.closest('tr');
    const companyChecked = c.isCompany ? 'checked' : '';
    const privateFields = c.isCompany ? 'hidden' : '';
    const companyFields = c.isCompany ? '' : 'hidden';

    tr.innerHTML=`<td colspan="5">
      <label class="inline"><input type="checkbox" id="edit_c_is_company" ${companyChecked} onchange="const isCo=this.checked; this.closest('td').querySelector('.private').classList.toggle('hidden',isCo); this.closest('td').querySelector('.company').classList.toggle('hidden',!isCo);"> Firmenkunde</label>
      <div class="private ${privateFields}"><div class="row"><input id="edit_c_fname" value="${esc(c.fname||'')} placeholder="Vorname""/><input id="edit_c_lname" value="${esc(c.lname||'')}" placeholder="Nachname"/></div></div>
      <div class="company ${companyFields}"><div class="row"><input id="edit_c_company_name" value="${esc(c.companyName||'')}" placeholder="Firma"/><input id="edit_c_contact_person" value="${esc(c.contactPerson||'')}" placeholder="Ansprechperson"/></div></div>
      <div class="row3" style="margin-top:8px"><input id="edit_c_street" value="${esc(c.street||'')} placeholder="Straße""/><input id="edit_c_no" value="${esc(c.no||'')}" placeholder="Nr."/><input id="edit_c_zip" value="${esc(c.zip||'')}" placeholder="PLZ"/></div>
      <div class="row3" style="margin-top:8px"><input id="edit_c_city" value="${esc(c.city||'')}" placeholder="Ort"/><select id="edit_c_country"><option>CH</option><option>LI</option><option>DE</option><option>AT</option><option>IT</option><option>FR</option></select><span class="inline"><button class="btn ok sm" data-act="save" data-idx="${i}">Speichern</button><button class="btn sm" data-act="cancel">Abbruch</button></span></div>
    </td>`;
    $('#edit_c_country').value = c.country || 'CH';
    return;
  }

  if(b.dataset.act==='cancel'){ renderCustomerList(); return; }
  
  if(b.dataset.act==='save'){
    const isCompany = document.getElementById('edit_c_is_company').checked;
    const nc = {
      isCompany,
      street: $('#edit_c_street').value.trim(),
      no: $('#edit_c_no').value.trim(),
      zip: $('#edit_c_zip').value.trim(),
      city: $('#edit_c_city').value.trim(),
      country: $('#edit_c_country').value
    };

    if (isCompany) {
      nc.companyName = $('#edit_c_company_name').value.trim();
      nc.contactPerson = $('#edit_c_contact_person').value.trim();
      if (!nc.companyName) { alert('Firmenname fehlt'); return; }
    } else {
      nc.fname = $('#edit_c_fname').value.trim();
      nc.lname = $('#edit_c_lname').value.trim();
      if (!nc.fname || !nc.lname) { alert('Vor- und Nachname fehlen'); return; }
    }
    
    customers[i] = nc;
    LS.set('customers', customers);
    renderCustomerList();
    refreshDropdowns();
    return;
  }
});

// --- Produkte ---
function renderProductList(){const tb=$('#prod_list');if(!tb)return;if(!products.length){tb.innerHTML='<tr><td colspan="3" class="muted">Keine Produkte.</td></tr>';return;}tb.innerHTML='';products.forEach((p,i)=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(p.name)}</td><td class='right'>${Number(p.price||0).toFixed(2)}</td><td class='right'><button class='btn sm' data-act='edit' data-idx='${i}'>Edit</button> <button class='btn warn sm' data-act='del' data-idx='${i}'>✕</button></td>`;tb.append(tr);});}
// ...existing code... -->
$('#add_product')?.addEventListener('click',()=>{const p={name:$('#prod_name').value.trim(),price:Number($('#prod_price').value)};if(!p.name||isNaN(p.price)){alert('Name & Preis');return;}products.push(p);LS.set('products',products);['prod_name','prod_price'].forEach(id=>$('#'+id).value='');renderProductList();refreshDropdowns();});
$('#prod_table')?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const i=Number(b.dataset.idx);const p=products[i];if(!p)return;if(b.dataset.act==='del'){if(confirm('Löschen?')){products.splice(i,1);LS.set('products',products);renderProductList();refreshDropdowns();}return;}if(b.dataset.act==='edit'){const tr=b.closest('tr');tr.innerHTML=`<td colspan="3"><div class='row'><input id='e_p_name' value='${esc(p.name)}'/><input id='e_p_price' type='number' step='0.05' min='0' value='${Number(p.price).toFixed(2)}'/></div><div class='inline'><button class='btn ok sm' data-act='save' data-idx='${i}'>Speichern</button><button class='btn sm' data-act='cancel'>Abbruch</button></div></td>`;return;}if(b.dataset.act==='cancel'){renderProductList();return;}if(b.dataset.act==='save'){const np={name:$('#e_p_name').value.trim(),price:Number($('#e_p_price').value)};if(!np.name||isNaN(np.price)){alert('Fehlende Daten');return;}products[i]=np;LS.set('products',products);renderProductList();refreshDropdowns();return;} });

function refreshDropdowns(){
  const selC=$('#sel_customer');
  if(selC){
    selC.innerHTML=customers.length?'':'<option value="">— kein Kunde —</option>';
    customers.forEach((c,i)=>{
      const name = c.isCompany ? c.companyName : `${c.fname} ${c.lname}`;
      selC.append(new Option(`${name} (${c.zip||''} ${c.city||''})`,i));
    });
  }
  const selP=$('#sel_product');
  if(selP){
    selP.innerHTML=products.length?'':'<option value="">— kein Produkt —</option>';
    products.forEach((p,i)=>selP.append(new Option(`${p.name} – CHF ${Number(p.price).toFixed(2)}`,i)));
  }
  renderFirmSelect();
}

// Positionen
// ...existing code... -->
async function generateQR(){const firm=getSelectedFirm();if(!firm){alert('Keine Firma gewählt');return;}if(!['name','iban','street','zip','city'].every(k=>firm[k])){alert('Firmendaten unvollständig');return;}if(!validIBAN(firm.iban)){alert('IBAN ungültig');return;}const ci=Number($('#sel_customer').value);const cust=customers[ci];if(!cust){alert('Kunde wählen');return;}const amount=Number($('#grand').textContent.replace(/[^0-9.]/g,''))||0;if(!(amount>0)){alert('Gesamtbetrag fehlt');return;}const refType=($$('input[name="reftype"]').find(r=>r.checked)||{}).value||'NON';let ref=$('#ref_input').value.trim();if(refType==='SCOR'&&!ref)ref=makeSCOR($('#inv_no').value||Date.now());
  const debtorName = cust.isCompany ? cust.companyName : `${cust.fname} ${cust.lname}`;
  const debtorAddress = cust.isCompany && cust.contactPerson ? `${cust.contactPerson}\n${cust.street}` : cust.street;

  const data={
    amount,
    currency:'CHF',
    creditor:{account:firm.iban.replace(/\s+/g,''),name:firm.name,address:firm.street,buildingNumber:firm.no,zip:firm.zip,city:firm.city,country:firm.country},
    debtor:{
      name: debtorName,
      address: debtorAddress,
      buildingNumber:cust.no,
      zip:cust.zip,
      city:cust.city,
      country:cust.country
    }
  };
  if(refType!=='NON')data.reference=ref;const msg=$('#message').value.trim();if(msg)data.unstructuredMessage=msg;let SwissQRBill;try{({SwissQRBill}=await import('https://cdn.jsdelivr.net/npm/swissqrbill@4.2.0/+esm'));}catch(e){alert('SwissQRBill nicht geladen');return;}const svg=new SwissQRBill(data);const el=svg.element;const box=$('#qr_container');box.innerHTML='';box.append(el);lastSVG=el.outerHTML;
  
  const spcDebtor = {
    name: debtorName,
    address: cust.street, // SPC hat keine separate Zeile für Ansprechperson
    buildingNumber: cust.no,
    zip: cust.zip,
    city: cust.city,
    country: cust.country
  };
  
  $('#spc_preview').value=buildSPC({creditor:data.creditor,amount,debtor:spcDebtor,referenceType:refType,reference:ref,message:msg});
  $('#status').textContent='✔︎ QR erstellt';
}
$('#gen_qr')?.addEventListener('click',generateQR);

$('#download_svg')?.addEventListener('click',()=>{if(!lastSVG){alert('QR zuerst');return;}const blob=new Blob([lastSVG],{type:'image/svg+xml'});const url=URL.createObjectURL(blob);const a=Object.assign(document.createElement('a'),{href:url,download:`qr-${($('#inv_no').value||'rechnung')}.svg`});document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);});
// ...existing code... -->
$('#print_invoice')?.addEventListener('click',()=>{if(!lastSVG){alert('QR zuerst');return;}const firm=getSelectedFirm();const cust=customers[Number($('#sel_customer').value)];
  const debtorName = cust.isCompany ? cust.companyName : `${cust.fname} ${cust.lname}`;
  let debtorAddress = '';
  if (cust.isCompany && cust.contactPerson) {
    debtorAddress += `${cust.contactPerson}<br>`;
  }
  debtorAddress += `${cust.street} ${cust.no||''}<br>${cust.zip} ${cust.city}<br>${cust.country}`;

  const rows=Array.from($('#items tbody').querySelectorAll('tr[data-row]')).map((tr,i)=>`<tr><td>${i+1}</td><td>${tr.children[1].textContent}</td><td style='text-align:right'>${tr.children[2].textContent}</td><td style='text-align:right'>${tr.children[3].textContent}</td><td style='text-align:right'>${tr.children[4].textContent}</td></tr>`).join('');const css='body{font-family:Arial,Helvetica,sans-serif;margin:40px} h1{font-size:20px;margin:0 0 16px} table{border-collapse:collapse;width:100%;font-size:13px} th,td{border-bottom:1px solid #ddd;padding:6px} tfoot td{font-weight:bold}';const w=window.open('','_blank');w.document.write(`<!doctype html><html><head><meta charset='utf-8'><style>${css}</style></head><body><h1>Rechnung ${$('#inv_no').value||''}</h1><div style='display:flex;gap:40px;align-items:flex-start'><div><h3 style="margin:0 0 6px">Rechnung an</h3><div>${debtorName}<br>${debtorAddress}</div><h3 style="margin:18px 0 6px">Zahlung an</h3><div>${firm.name}<br>${firm.street} ${firm.no||''}<br>${firm.zip} ${firm.city}<br>${firm.country}<br>IBAN ${firm.iban}</div></div><div style='max-width:230px'>${lastSVG}</div></div><h3 style='margin:24px 0 8px'>Positionen</h3><table><thead><tr><th>#</th><th>Text</th><th>Menge</th><th>Preis</th><th>Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan=4 style='text-align:right'>Zwischensumme</td><td>${$('#sum').textContent}</td></tr><tr><td colspan=4 style='text-align:right'>MWST</td><td>${$('#vat_amt').textContent}</td></tr><tr><td colspan=4 style='text-align:right'>Gesamt</td><td>${$('#grand').textContent}</td></tr></tfoot></table></body></html>`);w.document.close();w.focus();w.print();});

// Initial renders
renderFirmList();renderCustomerList();renderProductList();refreshDropdowns();