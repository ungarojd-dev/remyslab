(function(){
  function networkFromUrl(url){
    if(url.indexOf('amazon')>-1||url.indexOf('amzn')>-1)return 'Amazon Associates';
    if(url.indexOf('packleashes')>-1)return 'Pack Leashes';
    if(url.indexOf('brooksandroo')>-1)return 'Brooks & Roo';
    return 'Other';
  }
  function copyText(text){
    if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text);
    var area=document.createElement('textarea');
    area.value=text;area.setAttribute('readonly','');area.style.position='absolute';area.style.left='-9999px';
    document.body.appendChild(area);area.select();document.execCommand('copy');document.body.removeChild(area);
    return Promise.resolve();
  }
  document.addEventListener('click',function(event){
    var affiliate=event.target.closest('a.affiliate-link,a[rel*="sponsored"]');
    if(affiliate){
      var href=affiliate.getAttribute('href')||'';
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({
        event:'affiliate_click',
        product_name:affiliate.dataset.product||'',
        product_category:affiliate.dataset.category||'',
        lab_result:affiliate.dataset.result||'',
        button_text:affiliate.textContent.trim(),
        button_location:affiliate.dataset.placement||'',
        affiliate_network:affiliate.dataset.network||networkFromUrl(href),
        discount_code:affiliate.dataset.discount||'',
        affiliate_url:href
      });
    }
    var copyButton=event.target.closest('.coupon-copy');
    if(copyButton){
      var code=copyButton.dataset.code||'';
      if(!code)return;
      copyText(code).then(function(){
        var old=copyButton.textContent;
        copyButton.textContent='Copied';copyButton.classList.add('copied');
        setTimeout(function(){copyButton.textContent=old;copyButton.classList.remove('copied');},1600);
      });
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({
        event:'coupon_code_copy',
        product_name:copyButton.dataset.product||'',
        product_category:copyButton.dataset.category||'',
        button_text:copyButton.textContent.trim(),
        button_location:copyButton.dataset.placement||'',
        discount_code:code
      });
    }
  });
})();
