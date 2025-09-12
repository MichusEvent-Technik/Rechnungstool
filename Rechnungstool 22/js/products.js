(function(){
  const {$,esc,state,saveProducts}=App;

  function renderProductList(){ const tb=$('#prod_list'); if(!tb) return; if(!state.products.length){ tb.innerHTML='<tr><td colspan="3" class="muted">Keine Produkte.</td></tr>'; return; } tb.innerHTML=''; state.products.forEach((p,i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${esc(p.name)}</td><td class='right'>${Number(p.price||0).toFixed(2)}</td><td class='right'><button class='btn sm' data-act='edit' data-idx='${i}'>Edit</button> <button class='btn warn sm' data-act='del' data-idx='${i}'>✕</button></td>`; tb.append(tr); }); }

  $('#add_product')?.addEventListener('click',()=>{ const p={name:$('#prod_name').value.trim(),price:Number($('#prod_price').value)}; if(!p.name||isNaN(p.price)){ alert('Name & Preis'); return; } state.products.push(p); saveProducts(); ['prod_name','prod_price'].forEach(id=>$('#'+id).value=''); renderProductList(); });

  $('#prod_table')?.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; const i=Number(b.dataset.idx); const p=state.products[i]; if(!p) return; if(b.dataset.act==='del'){ if(confirm('Löschen?')){ state.products.splice(i,1); saveProducts(); renderProductList(); } return; }
    if(b.dataset.act==='edit'){ const tr=b.closest('tr'); tr.innerHTML=`<td colspan="3"><div class='row'><input id='e_p_name' value='${esc(p.name)}'/><input id='e_p_price' type='number' step='0.05' min='0' value='${Number(p.price).toFixed(2)}'/></div><div class='inline'><button class='btn ok sm' data-act='save' data-idx='${i}'>Speichern</button><button class='btn sm' data-act='cancel'>Abbruch</button></div></td>`; return; }
    if(b.dataset.act==='cancel'){ renderProductList(); return; }
    if(b.dataset.act==='save'){ const np={name:$('#e_p_name').value.trim(),price:Number($('#e_p_price').value)}; if(!np.name||isNaN(np.price)){ alert('Fehlende Daten'); return; } state.products[i]=np; saveProducts(); renderProductList(); return; }
  });

  renderProductList();
})();