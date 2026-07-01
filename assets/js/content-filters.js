(function(){
  var input=document.getElementById('contentSearch');
  var typePills=[].slice.call(document.querySelectorAll('.type-pill'));
  var catPills=[].slice.call(document.querySelectorAll('.filter-pill:not(.type-pill)'));
  var cards=[].slice.call(document.querySelectorAll('[data-filter-card]'));
  var label=document.getElementById('resultsLabel');
  var activeType='all';
  var activeCat='all';
  function apply(){
    var query=(input&&input.value||'').trim().toLowerCase();
    var shown=0;
    cards.forEach(function(card){
      var type=(card.dataset.type||'').toLowerCase();
      var category=(card.dataset.category||'').toLowerCase();
      var searchable=(card.dataset.search||card.textContent||'').toLowerCase();
      // Type and category filters combine (both must match, when set to something other than
      // "all") so a visitor can narrow to e.g. Reviews + Toys at the same time, not just one
      // axis or the other.
      var visible=(activeType==='all'||type===activeType)&&(activeCat==='all'||category===activeCat)&&(!query||searchable.indexOf(query)>-1);
      card.style.display=visible?'':'none';if(visible)shown++;
    });
    if(label)label.textContent=shown+' '+(shown===1?'result':'results');
    var empty=document.getElementById('emptyState');if(empty)empty.style.display=shown?'none':'';
  }
  typePills.forEach(function(pill){pill.addEventListener('click',function(){typePills.forEach(function(x){x.classList.remove('active');x.setAttribute('aria-selected','false')});pill.classList.add('active');pill.setAttribute('aria-selected','true');activeType=pill.dataset.typeFilter||'all';apply();});});
  catPills.forEach(function(pill){pill.addEventListener('click',function(){catPills.forEach(function(x){x.classList.remove('active');x.setAttribute('aria-selected','false')});pill.classList.add('active');pill.setAttribute('aria-selected','true');activeCat=pill.dataset.filter||'all';apply();});});
  if(input)input.addEventListener('input',apply);
  apply();
})();
