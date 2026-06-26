#!/usr/bin/env node
/**
 * render-compare.mjs — builds compare/index.html from data/compare.json
 * -----------------------------------------------------------------------
 * Mirrors the card layout from the peptide site (mypeptideprice): one card
 * per group, vendor offers as rows inside, sorted cheapest-first, with a
 * sticky filter bar and live count. The one structural difference, kept on
 * purpose: the peptide site's card = one product (same molecule, many
 * vendors). Here the card = one CATEGORY ("Harnesses"), because brands don't
 * share product names — there's no shared ID to group by at the product
 * level. Grouping by category instead of guessing at product equivalence is
 * what keeps this honest; a vendor row never claims to BE another row's item.
 *
 * Facts only — price, brand, stock, discount code. No Remy verdicts, no
 * "good for X" editorializing. That's intentionally Tested Gear's job on a
 * different page; this page stays a neutral price browser.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const attr = s => esc(s).replace(/'/g, "&#39;");
const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function initials(name) {
  return String(name || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

/** One vendor offer row inside a category card. Facts only: name, brand, stock, code, price. No editorial tags. */
function vendorRow(p, isCheapest) {
  const oos = p.in_stock === false ? `<span class="supplier-oos">Out of stock</span>` : `<span>Listed</span>`;
  const discount = p.discount_code ? `<span class="supplier-discount">Code ${esc(p.discount_code)}</span>` : "";
  const cheapestBadge = isCheapest ? `<span class="supplier-best">Lowest price</span>` : "";

  return `        <a class="supplier-row affiliate-link" href="${attr(p.url)}" target="_blank" rel="nofollow sponsored noopener"
          data-product="${attr(p.name)}" data-category="compare_${attr(p.category)}" data-result="not_tested"
          data-placement="price_compare" data-network="${attr(p.brand_name)}" data-discount="${attr(p.discount_code || "")}">
          <div class="supplier-left">
            <span class="supplier-initials">${esc(initials(p.brand_name))}</span>
            <div style="min-width:0">
              <div class="supplier-name">${esc(p.name)}</div>
              <div class="supplier-sub">${esc(p.brand_name)} · ${oos}${discount}</div>
            </div>
          </div>
          <div class="supplier-price-wrap">
            <div class="supplier-price">${esc(p.price)}</div>
            ${cheapestBadge}
            <div class="supplier-go">Visit brand ›</div>
          </div>
        </a>`;
}

/** One category card: header + vendor rows, sorted cheapest first (build-compare already sorts this way). */
function categoryCard(cat, products) {
  const cheapestValue = Math.min(...products.map(p => p.price_value ?? Infinity));
  const brandCount = new Set(products.map(p => p.brand_id)).size;
  const rows = products.map(p => vendorRow(p, p.price_value === cheapestValue)).join("\n");
  return `      <article class="product-card" data-cat="${attr(cat.id)}">
        <header class="product-card-head">
          <div class="product-card-meta">Dog Gear · Live Prices</div>
          <div class="product-title-row">
            <h2 class="product-title">${esc(cat.label)}</h2>
            <span class="vendor-count">${brandCount} brand${brandCount === 1 ? "" : "s"}</span>
          </div>
        </header>
        <div class="supplier-head">
          <span>Sorted low to high</span>
          <span>${products.length} listing${products.length === 1 ? "" : "s"}</span>
        </div>
        <div class="suppliers">
${rows}
        </div>
      </article>`;
}

function chip(label, value, active) {
  return `<button type="button" class="catalog-chip${active ? " active" : ""}" data-chip="${attr(value)}">${esc(label)}</button>`;
}

function jsonLd(data) {
  return JSON.stringify({
    "@context": "https://schema.org", "@type": "ItemList",
    name: "Price Compare — Remy's Lab",
    description: "Live prices for dog gear across multiple brands, grouped by category.",
    itemListElement: data.products.slice(0, 50).map((p, i) => ({
      "@type": "ListItem", position: i + 1,
      item: { "@type": "Product", name: p.name, ...(p.image ? { image: p.image } : {}),
        offers: { "@type": "Offer", price: String(p.price_value), priceCurrency: "USD", url: p.url } }
    }))
  });
}

function page(data) {
  const when = data.generated_at ? new Date(data.generated_at) : null;
  const whenStr = when && !isNaN(when) ? when.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

  const cats = data.category_summary; // [{id,label,brand_count,product_count}]
  const grouped = cats.map(c => ({ ...c, products: data.products.filter(p => p.category === c.id) }));
  const brandNames = [...new Set(data.products.map(p => p.brand_name))].sort();

  const cards = grouped.map(c => categoryCard(c, c.products)).join("\n\n");
  const catChips = `${chip("All", "All", true)}\n      ${cats.map(c => chip(c.label, c.id, false)).join("\n      ")}`;
  const brandChips = `${chip("All", "All", true)}\n      ${brandNames.map(b => chip(b, b, false)).join("\n      ")}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-TS4KTRPL');</script>
<!-- End Google Tag Manager -->
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Remy's Lab | Live Dog Gear Price Compare</title>
<meta name="description" content="Compare live prices for dog gear across multiple brands — harnesses, leashes, chews, and more, sorted cheapest first. From Remy's Lab."/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<link rel="canonical" href="https://remyslab.com/"/>
<link rel="icon" type="image/png" href="/assets/icons/favicon-remy-scientist-transparent-v2.png"/>
<meta name="theme-color" content="#f7f5ef"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="Remy's Lab"/>
<meta property="og:title" content="Remy's Lab | Live Dog Gear Price Compare"/>
<meta property="og:description" content="Live prices for dog gear across multiple brands, grouped by category."/>
<meta property="og:url" content="https://remyslab.com/"/>
<meta property="og:image" content="https://remyslab.com/assets/logos/remys-lab-logo-science-dog-transparent-v2.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=DM+Mono:wght@500&display=swap" media="print" onload="this.media='all'"/>
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@500&display=swap"/></noscript>
<script type="application/ld+json">
${jsonLd(data)}
</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{font-family:"DM Sans",system-ui,-apple-system,sans-serif;background:#f7f5ef;color:#1b1713;-webkit-font-smoothing:antialiased;line-height:1.5;padding-bottom:52px;overflow-x:clip}
a{text-decoration:none;color:inherit}
img{display:block;max-width:100%}
:root{--bg:#f7f5ef;--surface:#fffdfa;--line:#e4dccf;--green:#1f3a2e;--green-deep:#163024;--gold:#c8920a;--text:#1b1713;--muted:#6c665d;--shadow:0 10px 28px rgba(31,58,46,.08)}
.page{width:min(100%,1180px);max-width:100%;margin:0 auto;padding:0 0 24px;overflow-x:clip}
.site-nav{display:flex;align-items:center;justify-content:space-between;margin:0 16px 16px;gap:8px;padding-top:20px}
.nav-logo{display:flex;align-items:center;gap:9px;flex-shrink:0;text-decoration:none}
.nav-logo img{width:36px;height:36px;object-fit:contain}
.nav-logo span{font-size:15px;font-weight:800;color:var(--text);letter-spacing:-.02em}
.nav-tabs{display:flex;gap:4px;flex-wrap:wrap}
.nav-tab{font-size:13px;font-weight:700;padding:7px 13px;border-radius:999px;color:var(--muted);background:transparent;border:1px solid transparent}
.nav-tab.active{background:var(--green);color:#fff;border-color:var(--green)}
.cmp-head{text-align:center;padding:0 16px 12px}
.cmp-head h1{font-size:23px;font-weight:800;letter-spacing:-.02em;margin-bottom:5px}
.cmp-head p{font-size:13px;color:var(--muted);max-width:440px;margin:0 auto;line-height:1.5}
.cmp-disclosure{max-width:1148px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 13px;margin:14px auto 4px;font-size:12px;color:var(--muted);line-height:1.5}
.cmp-disclosure strong{color:var(--text)}

/* Sticky controls bar, mirrors the peptide site's catalog-controls */
.catalog-controls{position:sticky;top:0;z-index:50;border-bottom:1px solid var(--line);background:rgba(247,245,239,.92);backdrop-filter:blur(10px);margin-top:10px}
.catalog-control-inner{max-width:1180px;margin:0 auto;padding:10px 16px}
.catalog-filter-title{margin:8px 0 5px;color:var(--muted);font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase}
.catalog-chips{display:flex;gap:5px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.catalog-chips::-webkit-scrollbar{display:none}
.catalog-chip{flex:0 0 auto;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--text);padding:6px 11px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.catalog-chip.active{border-color:var(--green);background:var(--green);color:#fff}
.catalog-summary{display:flex;justify-content:space-between;gap:8px;margin:10px 16px 4px;color:var(--muted);font-size:11.5px}

.catalog-main{padding:6px 16px 0;max-width:1180px;margin:0 auto}
.catalog-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}
.product-card{height:100%;display:flex;flex-direction:column}
.suppliers{flex:1}
@media (max-width:920px){.catalog-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:620px){.catalog-grid{grid-template-columns:1fr;gap:10px}.catalog-main{padding:6px 16px 0}}
.product-card{overflow:hidden;border:1px solid var(--line);border-radius:18px;background:var(--surface);box-shadow:var(--shadow)}
.product-card[hidden]{display:none}
.product-card-head{padding:13px 14px 9px;border-bottom:1px solid var(--line)}
.product-card-meta{color:var(--green);font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;opacity:.75}
.product-title-row{display:flex;align-items:baseline;justify-content:space-between;gap:9px;margin-top:4px}
.product-title{font-size:18px;font-weight:800;letter-spacing:-.01em}
.vendor-count{flex:0 0 auto;border-radius:999px;background:#ecf5ee;padding:4px 9px;color:var(--green);font-size:10.5px;font-weight:700}
.supplier-head{display:flex;justify-content:space-between;gap:6px;padding:9px 14px 6px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.3px;text-transform:uppercase}
.suppliers{padding:0 12px 4px}
.supplier-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 2px;border-top:1px solid #ece4d5}
.supplier-row:first-child{border-top:none}
.supplier-row:hover{background:#fbf8f1;border-radius:10px}
.supplier-left{display:flex;gap:9px;min-width:0;align-items:flex-start}
.supplier-initials{flex:0 0 auto;display:flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:9px;background:#ecf5ee;color:var(--green);font-size:11px;font-weight:800;margin-top:1px}
.supplier-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:700;max-width:32ch}
.supplier-sub{display:flex;flex-wrap:wrap;gap:6px;margin-top:1px;color:var(--muted);font-size:11px}
.supplier-discount{color:var(--gold);font-weight:700}
.supplier-oos{color:#a04848;font-weight:700}
.supplier-price-wrap{text-align:right;flex:0 0 auto}
.supplier-price{font-size:14px;font-weight:800;color:var(--green-deep)}
.supplier-best{display:inline-block;margin-top:2px;font-size:9.5px;font-weight:700;color:var(--green);background:#ecf5ee;border-radius:999px;padding:1.5px 7px;white-space:nowrap}
.supplier-go{margin-top:2px;color:var(--muted);font-size:10.5px}

.catalog-empty{border:1px solid var(--line);border-radius:14px;background:var(--surface);padding:26px;text-align:center;color:var(--muted);font-size:13.5px}
.cmp-foot{margin:22px 16px 0;font-size:12px;color:var(--muted);text-align:center;line-height:1.5}
.cmp-foot a{color:var(--green);text-decoration:underline;text-underline-offset:2px}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style>
</head>
<body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TS4KTRPL" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>

<nav class="site-nav" aria-label="Site navigation">
  <a class="nav-logo" href="/">
    <img src="/assets/icons/remys-lab-dog-scientist-icon-transparent-v2.png" alt="Remy's Lab" width="36" height="36"/>
    <span>Remy's Lab</span>
  </a>
  <div class="nav-tabs" role="tablist">
    <a class="nav-tab active" href="/" role="tab" aria-current="page">Compare</a>
    <a class="nav-tab" href="/remyslinks/" role="tab">Remy's Links</a>
    <a class="nav-tab" href="/blog/" role="tab">Lab Notes</a>
    <a class="nav-tab" href="/tested-gear/" role="tab">Tested Gear</a>
  </div>
</nav>

<header class="cmp-head">
  <h1>Price Compare 🔍</h1>
  <p>Live prices for dog gear across a handful of brands. Each card is a category — harnesses, leashes, and so on — with every brand's price laid out cheapest first.</p>
</header>

<p class="cmp-disclosure"><strong>Heads up:</strong> this is a price browser, not a Remy-tested list. For stuff he's actually tried, see <a href="/tested-gear/" style="color:var(--green);text-decoration:underline">Tested Gear</a>. Prices pull from each brand's own store and can change.</p>

<div class="page">
  <div class="catalog-controls">
    <div class="catalog-control-inner">
      <div class="catalog-filter-title">Category</div>
      <div class="catalog-chips" id="catChips">
      ${catChips}
      </div>
      <div class="catalog-filter-title">Brand</div>
      <div class="catalog-chips" id="brandChips">
      ${brandChips}
      </div>
    </div>
  </div>

  <div class="catalog-summary">
    <span id="catalogStatus">Showing ${cats.length} categories · ${data.product_count} listings</span>
    <span>${whenStr ? `Updated ${esc(whenStr)}` : ""}</span>
  </div>

  <main class="catalog-main">
    <div class="catalog-grid" id="catalogGrid">
${cards}
    </div>
  </main>

  <p class="cmp-foot">Prices pulled directly from each brand's store. <a href="/disclaimer.html">How links on this page work</a>.</p>
</div>

<script>
(function(){
  var state={cat:"All",brand:"All"};
  function apply(){
    var cards=document.querySelectorAll(".product-card");
    var visible=0;
    cards.forEach(function(card){
      var matchesCat = state.cat==="All" || card.dataset.cat===state.cat;
      var rows=card.querySelectorAll(".supplier-row");
      var anyBrandMatch=false;
      rows.forEach(function(row){
        var brandMatch = state.brand==="All" || row.dataset.network===state.brand;
        row.style.display = brandMatch ? "" : "none";
        if(brandMatch) anyBrandMatch=true;
      });
      var show = matchesCat && anyBrandMatch;
      card.hidden = !show;
      if(show) visible++;
    });
    document.getElementById("catalogStatus").textContent =
      "Showing " + visible + " categor" + (visible===1?"y":"ies") + " · ${data.product_count} listings";
  }
  function wire(containerId, key){
    var container=document.getElementById(containerId);
    container.querySelectorAll("[data-chip]").forEach(function(btn){
      btn.addEventListener("click", function(){
        container.querySelectorAll("[data-chip]").forEach(function(b){b.classList.remove("active")});
        btn.classList.add("active");
        state[key]=btn.dataset.chip;
        apply();
      });
    });
  }
  wire("catChips","cat");
  wire("brandChips","brand");
})();
</script>

<script src="/assets/js/tracking.js" defer></script>
</body>
</html>
`;
}

async function main() {
  const data = JSON.parse(await readFile(path.join(ROOT, "data", "compare.json"), "utf8"));
  await writeFile(path.join(ROOT, "index.html"), page(data));
  console.log(`[render] wrote index.html (${data.product_count} listings, ${data.category_summary.length} categories)`);
}
main().catch(err => { console.error("[render] FATAL:", err.message); process.exit(1); });
