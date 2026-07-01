(function(){
  var input=document.getElementById('contentSearch');
  var typePills=[].slice.call(document.querySelectorAll('.type-pill'));
  var catPills=[].slice.call(document.querySelectorAll('.filter-pill:not(.type-pill)'));
  var cards=[].slice.call(document.querySelectorAll('[data-filter-card]'));
  var label=document.getElementById('resultsLabel');
  var sortSelect=document.getElementById('sortSelect');
  var activeType='all';
  var activeCat='all';

  // All cards share one parent (the results container). Found once, dynamically, rather than
  // hardcoded to a specific class name, since this script runs on more than one page layout
  // (.note-list on the combined Lab Notes page, .guide-grid on a guides-only page, etc.) --
  // hardcoding one container class here would silently break sorting on any other page.
  var container=cards.length?cards[0].parentElement:null;

  function parseDate(card){
    var raw=card.dataset.date;
    if(!raw)return 0;
    var t=new Date(raw+'T12:00:00Z').getTime();
    return isNaN(t)?0:t;
  }

  function applySort(){
    if(!container||!sortSelect)return;
    var dir=sortSelect.value==='oldest'?1:-1;
    var sorted=cards.slice().sort(function(a,b){
      return (parseDate(a)-parseDate(b))*dir;
    });
    // Insert each card immediately before a fixed reference point (the empty-state element,
    // when present) rather than a plain appendChild. Blindly appending would push every card
    // after other siblings in the same container (the results-row / empty-state elements),
    // which would leave the empty-state message sitting above the cards instead of below them.
    var reference=document.getElementById('emptyState');
    sorted.forEach(function(card){
      if(reference&&reference.parentElement===container){container.insertBefore(card,reference);}
      else{container.appendChild(card);}
    });
  }

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
  if(sortSelect)sortSelect.addEventListener('change',applySort);
  applySort();
  apply();
})();
