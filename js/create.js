(function(){
  const {$,esc,state,saveInvoices}=App;

  const tbody=$('#items tbody');
  const currentFlights=[]; const currentPassengers=[]; let editingInvoiceId=null;

  function fmtCHF(n){ return 'CHF\u00A0'+Number(n||0).toFixed(2); }

  function renderFirmSelect(){ const sel=$('#firm_select'); if(!sel) return; sel.innerHTML=''; if(!state.firms.length){ sel.innerHTML='<option value="">— keine Firma —</option>'; return; } state.firms.forEach(f=>{ const o=new Option((String(f.id)===String(state.defaultFirmId)?'★ ':'')+f.name,f.id); sel.append(o); }); if(!sel.value&&state.firms.length) sel.value=String(state.defaultFirmId||state.firms[0].id); }

  function refreshDropdowns(){ const selC=$('#sel_customer'); if(selC){ selC.innerHTML=state.customers.length?'':'<option value="">— kein Kunde —</option>'; state.customers.forEach((c,i)=>{ const name=c.isCompany?c.companyName:`${c.fname} ${c.lname}`; selC.append(new Option(`${name} (${c.zip||''} ${c.city||''})`,i)); }); }
    const selP=$('#sel_product'); if(selP){ selP.innerHTML=state.products.length?'':'<option value="">— kein Produkt —</option>'; state.products.forEach((p,i)=>selP.append(new Option(`${p.name} – CHF ${Number(p.price).toFixed(2)}`,i))); }
    const selPC=$('#passenger_customer_select'); if(selPC){ const cur=selPC.value; selPC.innerHTML='<option value="">– Kunde wählen –</option>'; state.customers.forEach((c,i)=>{ const name=c.isCompany?c.companyName:`${c.fname} ${c.lname}`; selPC.append(new Option(name,i)); }); if(cur) selPC.value=cur; }
  }

  function renumberPositions(){ Array.from(tbody.querySelectorAll('tr[data-row]')).forEach((tr,i)=>{ const c=tr.querySelector('.pos-label'); if(c) c.textContent=i+1; }); }
  function recalc(){ let sum=0; tbody.querySelectorAll('tr[data-row]').forEach(tr=>{ const qty=Number(tr.querySelector('.cell-qty input')?.value||0); const price=Number(tr.querySelector('.cell-price input')?.value||0); const total=qty*price; tr.dataset.total=String(total); tr.querySelector('.cell-total').textContent=total.toFixed(2); sum+=total; }); const vat=Number($('#vat').value||0); const vatAmt=sum*(vat/100); $('#sum').textContent=fmtCHF(sum); $('#vat_amt').textContent=fmtCHF(vatAmt); $('#grand').textContent=fmtCHF(sum+vatAmt); }
  function createRow({name,qty,price}){ const tr=document.createElement('tr'); tr.dataset.row='1'; tr.dataset.total='0'; tr.innerHTML=`<td class='cell-pos'><span class='pos-label'></span></td><td>${esc(name)}</td><td class='right cell-qty'><input type='number' min='0' step='1' value='${qty}' style='width:80px'></td><td class='right cell-price'><input type='number' min='0' step='0.05' value='${Number(price).toFixed(2)}' style='width:90px'></td><td class='right cell-total'>0.00</td><td class='right'><button class='btn warn sm' data-act='del-row'>✕</button></td>`; tr.querySelector('[data-act="del-row"]').addEventListener('click',()=>{ tr.remove(); recalc(); renumberPositions(); }); tr.querySelectorAll('input').forEach(inp=>inp.addEventListener('input',recalc)); tbody.append(tr); renumberPositions(); recalc(); }

  $('#add_item')?.addEventListener('click',()=>{ const i=$('#sel_product').value; const q=Number($('#qty').value||1); if(i===''||!(q>0)){ alert('Produkt & Menge'); return; } const p=state.products[Number(i)]; if(!p) return; createRow({name:p.name,qty:q,price:Number(p.price)}); });
  $('#add_free_item')?.addEventListener('click',()=>{ const name=$('#free_text_desc').value.trim(); const qty=Number($('#free_text_qty').value||0); const price=Number($('#free_text_price').value||0); if(!name||!(qty>0)) return; createRow({name,qty,price}); $('#free_text_desc').value=''; });
  $('#vat')?.addEventListener('input',recalc);

  // Flights
  function renderFlightTable(){ const wrap=$('#flight_table_wrap'); const tb=$('#flight_table tbody'); if(!tb) return; if(!currentFlights.length){ tb.innerHTML='<tr><td colspan="6" class="muted">Keine Flugdaten übernommen.</td></tr>'; if(wrap) wrap.style.display='none'; return; } if(wrap) wrap.style.display='block'; tb.innerHTML=''; currentFlights.forEach((f,i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${esc(f.date||'')}</td><td>${esc(f.dep||'')}</td><td>${esc(f.arr||'')}</td><td>${esc(f.time||'')}</td><td>${esc(f.routing||'')}</td><td class='right'><button class='btn sm' data-act='edit-flight' data-idx='${i}'>Edit</button> <button class='btn warn sm' data-act='del-flight' data-idx='${i}'>✕</button></td>`; tb.append(tr); }); }
  let editingFlightIndex=null;
  $('#add_flight_data')?.addEventListener('click',()=>{ const date=$('#flight_date').value||''; const dep=$('#flight_dep').value.trim().toUpperCase(); const arr=$('#flight_arr').value.trim().toUpperCase(); const time=$('#flight_time')?.value.trim(); const routing=$('#flight_routing')?.value.trim().toUpperCase(); if(!date && !dep && !arr && !time && !routing){ $('#flight_feedback').textContent='Keine Daten'; return; } const obj={date,dep,arr,time,routing}; if(editingFlightIndex!==null){ currentFlights[editingFlightIndex]=obj; editingFlightIndex=null; $('#add_flight_data').textContent='Flug hinzufügen'; } else currentFlights.push(obj); renderFlightTable(); $('#flight_feedback').textContent='Gespeichert'; setTimeout(()=>{ if($('#flight_feedback').textContent==='Gespeichert') $('#flight_feedback').textContent=''; },2000); ['flight_date','flight_dep','flight_arr','flight_time','flight_routing'].forEach(id=>$('#'+id).value=''); });
  document.addEventListener('click',e=>{ const btn=e.target.closest('#flight_table button'); if(!btn) return; const idx=Number(btn.dataset.idx); if(isNaN(idx)) return; if(btn.dataset.act==='del-flight'){ currentFlights.splice(idx,1); renderFlightTable(); $('#flight_feedback').textContent='Gelöscht'; setTimeout(()=>{ if($('#flight_feedback').textContent==='Gelöscht') $('#flight_feedback').textContent=''; },1500); if(editingFlightIndex===idx){ editingFlightIndex=null; $('#add_flight_data').textContent='Flug hinzufügen'; } } else if(btn.dataset.act==='edit-flight'){ const f=currentFlights[idx]; if(!f) return; editingFlightIndex=idx; $('#flight_date').value=f.date||''; $('#flight_dep').value=f.dep||''; $('#flight_arr').value=f.arr||''; $('#flight_time').value=f.time||''; $('#flight_routing').value=f.routing||''; $('#add_flight_data').textContent='Flug aktualisieren'; $('#flight_feedback').textContent='Bearbeite Flug '+(idx+1); setTimeout(()=>{ if($('#flight_feedback').textContent.startsWith('Bearbeite Flug')) $('#flight_feedback').textContent=''; },3000); } });

  // Passengers
  function renderPassengerList(){ const tb=$('#passenger_list'); if(!tb) return; if(!currentPassengers.length){ tb.innerHTML='<tr><td colspan="4" class="muted">Noch keine Passagiere.</td></tr>'; return; } tb.innerHTML=''; currentPassengers.forEach((p,i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${i+1}</td><td>${esc(p.fname)}</td><td>${esc(p.lname)}</td><td class='right'><button class='btn warn sm' data-px='${i}'>✕</button></td>`; tb.append(tr); }); }
  $('#add_passenger')?.addEventListener('click',()=>{ const idx=$('#passenger_customer_select').value; const fname=$('#passenger_fname').value.trim(); const lname=$('#passenger_lname').value.trim(); if(!fname||!lname){ $('#passenger_feedback').textContent='Vor- & Nachname nötig'; return; } currentPassengers.push({fname,lname,customerIndex: idx!==''?Number(idx):null}); $('#passenger_fname').value=''; $('#passenger_lname').value=''; $('#passenger_feedback').textContent='Hinzugefügt'; renderPassengerList(); });
  $('#passenger_customer_select')?.addEventListener('change',e=>{ const val=e.target.value; if(val===''){ return; } const c=state.customers[Number(val)]; if(!c) return; if(c.isCompany){ $('#passenger_fname').value=''; $('#passenger_lname').value=c.companyName; } else { $('#passenger_fname').value=c.fname||''; $('#passenger_lname').value=c.lname||''; } });
  document.addEventListener('click',e=>{ const b=e.target.closest('#passenger_table button[data-px]'); if(!b) return; const i=Number(b.dataset.px); if(isNaN(i)) return; currentPassengers.splice(i,1); renderPassengerList(); });

  // Save invoice
  $('#save_invoice')?.addEventListener('click',()=>{
    const status=$('#status');
    status.textContent='';
    const firmId=$('#firm_select').value;
    if(!firmId){ alert('Keine Firma'); return; }
    const ci=Number($('#sel_customer').value);
    const cust=state.customers[ci];
    if(!cust){ alert('Kunde fehlt'); return; }
    const title=($('#inv_title')?.value||'').trim();
    if(!title){ alert('Titel fehlt'); $('#inv_title').focus(); return; }
    const rows=Array.from($('#items tbody').querySelectorAll('tr[data-row]'));
    const items=rows.map((tr,i)=>({
      pos:i+1,
      name:tr.children[1].textContent.trim(),
      qty:Number(tr.querySelector('.cell-qty input').value),
      price:Number(tr.querySelector('.cell-price input').value),
      total:Number(tr.dataset.total)
    }));
    if(!items.length){ alert('Position hinzufügen'); return; }
    if(editingInvoiceId){
      const inv=state.invoices.find(i=>i.id===editingInvoiceId);
      if(inv){
        inv.no=$('#inv_no').value||inv.no;
        inv.title=title;
        inv.firmId=firmId;
        inv.customerIndex=ci;
        inv.vat=Number($('#vat').value||0);
        inv.items=items;
        inv.total=$('#grand').textContent;
        inv.flights=currentFlights.map(f=>({...f}));
        inv.passengers=currentPassengers.map(p=>({...p}));
      }
      editingInvoiceId=null;
      status.textContent='Aktualisiert';
    } else {
      const inv={
        id:Date.now(),
        no:$('#inv_no').value||String(Date.now()),
        title,
        firmId,
        customerIndex:ci,
        vat:Number($('#vat').value||0),
        items,
        total:$('#grand').textContent,
        created:new Date().toISOString(),
        flights:currentFlights.map(f=>({...f})),
        passengers:currentPassengers.map(p=>({...p})),
        issued:false,
        paid:false
      };
      state.invoices.push(inv);
      status.textContent='Gespeichert';
      $('#inv_title').value='';
    }
    saveInvoices();
  });

  function loadForEdit(){ const url=new URL(location.href); const id=url.searchParams.get('edit'); if(!id) return; const inv=state.invoices.find(i=>String(i.id)===String(id)); if(!inv) return; editingInvoiceId=inv.id; $('#inv_title').value=inv.title||''; $('#inv_no').value=inv.no||''; $('#firm_select').value=String(inv.firmId); $('#sel_customer').value=String(inv.customerIndex); $('#vat').value=inv.vat||0; $('#items tbody').innerHTML=''; (inv.items||[]).forEach(it=>createRow({name:it.name,qty:it.qty,price:it.price})); currentFlights.length=0; (inv.flights||[]).forEach(f=>currentFlights.push({...f})); renderFlightTable(); currentPassengers.length=0; (inv.passengers||[]).forEach(p=>currentPassengers.push({...p})); renderPassengerList(); const status=$('#status'); if(status) status.textContent='Bearbeitung aktiv – Speichern aktualisiert'; }

  // init
  renderFirmSelect(); refreshDropdowns();
  loadForEdit();
})();