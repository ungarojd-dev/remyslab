(function(){
  var input=document.getElementById('contentSearch');
  var pills=[].slice.call(document.querySelectorAll('.filter-pill'));
  var cards=[].slice.call(document.querySelectorAll('[data-filter-card]'));
  var label=document.getElementById('resultsLabel');
  var active='all';
  function apply(){
    var query=(input&&input.value||'').trim().toLowerCase();
    var shown=0;
    cards.forEach(function(card){
      var category=(card.dataset.category||'').toLowerCase();
      var searchable=(card.dataset.search||card.textContent||'').toLowerCase();
      var visible=(active==='all'||category===active)&&(!query||searchable.indexOf(query)>-1);
      card.style.display=visible?'':'none';if(visible)shown++;
    });
    if(label)label.textContent=shown+' '+(shown===1?'result':'results');
    var empty=document.getElementById('emptyState');if(empty)empty.style.display=shown?'none':'';
  }
  pills.forEach(function(pill){pill.addEventListener('click',function(){pills.forEach(function(x){x.classList.remove('active');x.setAttribute('aria-selected','false')});pill.classList.add('active');pill.setAttribute('aria-selected','true');active=pill.dataset.filter||'all';apply();});});
  if(input)input.addEventListener('input',apply);
  apply();
})();
