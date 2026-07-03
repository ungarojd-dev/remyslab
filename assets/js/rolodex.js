(function(){
  var root = document.getElementById("partnerRolodex");
  if (!root) return;
  var slides = Array.prototype.slice.call(root.querySelectorAll(".rolodex-slide"));
  if (!slides.length) return;
  var dotsWrap = document.getElementById("rolodexDots");
  var dots = slides.map(function(_, i){
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rolodex-dot" + (i === 0 ? " is-active" : "");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", "Go to partner " + (i + 1) + " of " + slides.length);
    b.addEventListener("click", function(){ goTo(i); });
    if (dotsWrap) dotsWrap.appendChild(b);
    return b;
  });

  var current = 0;
  var AUTO_MS = 5000;
  var timer = null;

  function goTo(i){
    slides[current].classList.remove("is-active");
    slides[current].setAttribute("aria-hidden", "true");
    dots[current].classList.remove("is-active");
    current = (i + slides.length) % slides.length;
    slides[current].classList.add("is-active");
    slides[current].setAttribute("aria-hidden", "false");
    dots[current].classList.add("is-active");
  }

  function next(){ goTo(current + 1); }
  function prev(){ goTo(current - 1); }

  function startAuto(){
    stopAuto();
    // Respects reduced-motion preference -- a forced-moving element is a real
    // accessibility problem for some users, so auto-advance simply doesn't run
    // for anyone who has that OS/browser setting on. Manual arrows/dots still work.
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer = setInterval(next, AUTO_MS);
  }
  function stopAuto(){ if (timer) { clearInterval(timer); timer = null; } }

  var nextBtn = document.getElementById("rolodexNext");
  var prevBtn = document.getElementById("rolodexPrev");
  if (nextBtn) nextBtn.addEventListener("click", function(){ next(); startAuto(); });
  if (prevBtn) prevBtn.addEventListener("click", function(){ prev(); startAuto(); });
  root.addEventListener("mouseenter", stopAuto);
  root.addEventListener("mouseleave", startAuto);
  root.addEventListener("focusin", stopAuto);
  root.addEventListener("focusout", startAuto);

  startAuto();
})();
