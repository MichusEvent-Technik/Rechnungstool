(function(){
  const {$,esc,state,saveCustomers}=App;

  $('#cust_is_company')?.addEventListener('change', e=>{ const isCompany=e.target.checked; $('#cust_private_fields').classList.toggle('hidden', isCompany); $('#cust_company_fields').classList.toggle('hidden', !isCompany); });

  function renderCustomerList(){ const tb=$('#cust_list'); if(!tb) return; if(!state.customers.length){ tb.innerHTML='<tr><td colspan="4" class="muted">Noch keine Kunden.</td></tr>'; return; } tb.innerHTML=''; state.customers.forEach((c,i)=>{ const name=c.isCompany?c.companyName:`${c.fname} ${c.lname}`; const addr=`${esc(c.street||'')} ${esc(c.no||'')}`.trim(); const place=`${esc(c.zip||'')} ${esc(c.city||'')}`.trim(); const tr=document.createElement('tr'); tr.innerHTML=`<td>${esc(name)}</td><td>${addr}</td><td>${place}</td><td>${esc(c.country||'')}</td><td class="right"><button class="btn sm" data-act="edit" data-idx="${i}">Edit</button> <button class="btn warn sm" data-act="del" data-idx="${i}">✕</button></td>`; tb.append(tr); }); }

  function resetCustomerForm(){ ['cust_fname','cust_lname','cust_company_name','cust_contact_person','cust_street','cust_no','cust_zip','cust_city'].forEach(id=>$('#'+id).value=''); $('#cust_is_company').checked=false; $('#cust_private_fields').classList.remove('hidden'); $('#cust_company_fields').classList.add('hidden'); $('#add_customer').classList.remove('hidden'); $('#update_customer').classList.add('hidden'); $('#cancel_update_customer').classList.add('hidden'); }

  $('#cancel_update_customer')?.addEventListener('click', resetCustomerForm);

  $('#add_customer')?.addEventListener('click', ()=>{ const isCompany=$('#cust_is_company').checked; const c={ isCompany, street:$('#cust_street').value.trim(), no:$('#cust_no').value.trim(), zip:$('#cust_zip').value.trim(), city:$('#cust_city').value.trim(), country:$('#cust_country').value };
    if(isCompany){ c.companyName=$('#cust_company_name').value.trim(); c.contactPerson=$('#cust_contact_person').value.trim(); if(!c.companyName){ alert('Firmenname fehlt'); return; } }
    else { c.fname=$('#cust_fname').value.trim(); c.lname=$('#cust_lname').value.trim(); if(!c.fname||!c.lname){ alert('Vor- und Nachname fehlen'); return; } }
    state.customers.push(c); saveCustomers(); resetCustomerForm(); renderCustomerList(); });

  $('#cust_table')?.addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b) return; const i=Number(b.dataset.idx); const c=state.customers[i]; if(!c) return; const act=b.dataset.act; if(act==='del'){ if(confirm('Löschen?')){ state.customers.splice(i,1); saveCustomers(); renderCustomerList(); } return;} if(act==='edit'){ $('#cust_is_company').checked=!!c.isCompany; $('#cust_fname').value=c.fname||''; $('#cust_lname').value=c.lname||''; $('#cust_company_name').value=c.companyName||''; $('#cust_contact_person').value=c.contactPerson||''; $('#cust_street').value=c.street||''; $('#cust_no').value=c.no||''; $('#cust_zip').value=c.zip||''; $('#cust_city').value=c.city||''; $('#cust_country').value=c.country||'CH'; $('#cust_private_fields').classList.toggle('hidden', !!c.isCompany); $('#cust_company_fields').classList.toggle('hidden', !c.isCompany); $('#add_customer').classList.add('hidden'); const up=$('#update_customer'); const cancel=$('#cancel_update_customer'); up.classList.remove('hidden'); cancel.classList.remove('hidden'); up.dataset.idx=i; document.querySelector('main').scrollIntoView({behavior:'smooth'}); return; } });

  $('#update_customer')?.addEventListener('click', e=>{ const i=Number(e.target.dataset.idx); if(isNaN(i)) return; const isCompany=$('#cust_is_company').checked; const nc={ isCompany, street:$('#cust_street').value.trim(), no:$('#cust_no').value.trim(), zip:$('#cust_zip').value.trim(), city:$('#cust_city').value.trim(), country:$('#cust_country').value };
    if(isCompany){ nc.companyName=$('#cust_company_name').value.trim(); nc.contactPerson=$('#cust_contact_person').value.trim(); if(!nc.companyName){ alert('Firmenname fehlt'); return; } } else { nc.fname=$('#cust_fname').value.trim(); nc.lname=$('#cust_lname').value.trim(); if(!nc.fname||!nc.lname){ alert('Vor- und Nachname fehlen'); return; } }
    state.customers[i]=nc; saveCustomers(); renderCustomerList(); resetCustomerForm(); });

  renderCustomerList();
})();