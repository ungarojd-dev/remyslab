#!/usr/bin/env node
/**
 * render-compare.mjs — builds index.html from data/compare.json
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
 * "good for X" editorializing. That's intentionally Lab Notes' job on a
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
  const cheapestBadge = isCheapest ? `<span class="supplier-best">Lowest price</span>` : "";
  const productCategory = `compare_${p.category}`;

  // Real product photo when Shopify gave us one; brand-initials badge as a graceful
  // fallback both when there's no image and if a CDN image URL ever fails to load.
  const fallback = `<span class='supplier-initials'>${esc(initials(p.brand_name))}</span>`;
  const thumb = p.image
    ? `<img class="supplier-thumb" src="${attr(p.image)}" alt="" loading="lazy" decoding="async"
         onerror="this.outerHTML='${fallback.replace(/'/g, "&#39;")}'">`
    : fallback;

  const copyButton = p.discount_code
    ? `<button type="button" class="supplier-copy coupon-copy" data-code="${attr(p.discount_code)}" data-product="${attr(p.name)}" data-category="${attr(productCategory)}" data-placement="price_compare_code">Grab code</button>`
    : "";

  // Show the discount math only when we actually have a percentage to do math with — older
  // cached fallback rows (from before discount_percent existed) just show plain price + a
  // generic "code ready" note, same as always, until the next live fetch backfills the field.
  const hasPercent = p.discount_code && Number.isFinite(p.discount_percent);
  const discountNote = p.discount_code
    ? (hasPercent
        ? `<span class="supplier-discount">${p.discount_percent}% off with ${esc(p.discount_code)}</span>`
        : `<span class="supplier-discount">Code ready</span>`)
    : "";
  const priceBlock = hasPercent && p.effective_price != null
    ? `<div class="supplier-price-was">${esc(p.price)}</div><div class="supplier-price supplier-price-discounted">$${p.effective_price.toFixed(2)}</div>`
    : `<div class="supplier-price">${esc(p.price)}</div>`;

  return `        <div class="supplier-row"
          data-network="${attr(p.brand_name)}"
          data-search="${attr([p.name, p.brand_name, p.category, p.discount_code || ""].join(" "))}">
          <div class="supplier-left">
            ${thumb}
            <div class="supplier-copy-wrap">
              <div class="supplier-name" title="${attr(p.name)}">${esc(p.name)}</div>
              <div class="supplier-sub">${esc(p.brand_name)} · ${oos}${discountNote}</div>
            </div>
          </div>
          <div class="supplier-price-wrap">
            ${priceBlock}
            ${cheapestBadge}
            <div class="supplier-buttons">
              ${copyButton}
              <a class="supplier-go affiliate-link" href="${attr(p.url)}" target="_blank" rel="nofollow sponsored noopener"
                data-product="${attr(p.name)}" data-category="${attr(productCategory)}" data-result="not_tested"
                data-placement="price_compare" data-network="${attr(p.brand_name)}" data-discount="${attr(p.discount_code || "")}">Visit brand site</a>
            </div>
          </div>
        </div>`;
}

/** One category card: header + vendor rows, sorted cheapest first (build-compare already sorts this way).
 *  Shows the first 5 rows by default; the rest sit behind a "Show N more" toggle (same pattern as the
 *  peptide site's product cards) so a deep category like Collars doesn't dominate the page on load. */
function categoryCard(cat, products) {
  const cheapestValue = Math.min(...products.map(p => (p.effective_price ?? p.price_value) ?? Infinity));
  const brandCount = new Set(products.map(p => p.brand_id)).size;
  const VISIBLE = 5;
  const rows = products.map((p, i) => {
    const row = vendorRow(p, (p.effective_price ?? p.price_value) === cheapestValue);
    if (i < VISIBLE) return row;
    // Hidden rows: wrap so plain CSS/JS toggling works with no framework.
    return row.replace('<div class="supplier-row', '<div hidden class="supplier-row extra-row');
  }).join("\n");
  const hiddenCount = Math.max(0, products.length - VISIBLE);
  const firstBatch = Math.min(10, hiddenCount);
  const expandBtn = hiddenCount
    ? `<div class="expand-row" data-action-row>
        <button type="button" class="expand-button" data-action="expand-card">Show ${firstBatch} more listing${firstBatch === 1 ? "" : "s"}${hiddenCount > firstBatch ? ` (${hiddenCount} left)` : ""}</button>
        <button type="button" class="collapse-button" data-action="collapse-card" hidden>Show fewer listings</button>
      </div>`
    : "";
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
        ${expandBtn}
      </article>`;
}

function chip(label, value, active) {
  return `<button type="button" class="catalog-chip${active ? " active" : ""}" data-chip="${attr(value)}">${esc(label)}</button>`;
}

function jsonLd(data) {
  return JSON.stringify({
    "@context": "https://schema.org", "@type": "ItemList",
    name: "Dog Gear Price Compare | Remy's Lab",
    description: "Compare dog gear prices, partner codes, and tested notes from Remy's Lab.",
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
<title>Compare Dog Gear Prices | Remy's Lab</title>
<meta name="description" content="Compare dog gear prices by category, see partner codes, and jump to Remy-tested notes when we have them."/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<link rel="canonical" href="https://remyslab.com/"/>
<link rel="icon" type="image/png" href="/assets/icons/favicon.png"/>
<meta name="theme-color" content="#f5f8fc"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="Remy's Lab"/>
<meta property="og:title" content="Compare Dog Gear Prices | Remy's Lab"/>
<meta property="og:description" content="Compare dog gear prices by category, see partner codes, and jump to Remy-tested notes when we have them."/>
<meta property="og:url" content="https://remyslab.com/"/>
<meta property="og:image" content="https://remyslab.com/assets/logos/og-image.jpg"/>
<meta name="twitter:card" content="summary_large_image"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Roboto+Mono:wght@500;600&family=Source+Sans+3:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'"/>
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Roboto+Mono:wght@500;600&family=Source+Sans+3:wght@400;500;600;700;800&display=swap"/></noscript>
<script type="application/ld+json">
${jsonLd(data)}
</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{font-family:"Source Sans 3",system-ui,-apple-system,sans-serif;background:#f5f8fc;color:#172033;-webkit-font-smoothing:antialiased;line-height:1.5;padding-bottom:52px;overflow-x:clip}
a{text-decoration:none;color:inherit}
img{display:block;max-width:100%}
:root{--bg:#f5f8fc;--surface:#fffefd;--line:#d7e3f1;--green:#245f93;--green-deep:#173b61;--sage:#eaf3ff;--gold:#c8920a;--text:#172033;--muted:#667085;--shadow:0 12px 30px rgba(23,59,97,.10)}
h1,h2,h3,.product-title{font-family:"Fraunces",Georgia,serif;font-optical-sizing:auto}.nav-logo span{font-family:"Source Sans 3",system-ui,-apple-system,sans-serif}
.page{width:min(100%,1180px);max-width:100%;margin:0 auto;padding:0 0 24px;overflow-x:clip}
.site-nav{display:flex;align-items:center;justify-content:space-between;margin:0 16px 16px;gap:8px;padding-top:20px}
.nav-logo{display:flex;align-items:center;gap:9px;flex:0 0 auto}
.nav-logo img{width:36px;height:36px;object-fit:contain}.nav-logo span{font-size:16px;font-weight:800;letter-spacing:-.02em}
.nav-tabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}.nav-tabs::-webkit-scrollbar{display:none}
.nav-tab{flex:0 0 auto;font-size:13px;font-weight:800;padding:7px 12px;border-radius:999px;color:var(--muted);border:1px solid transparent;white-space:nowrap}.nav-tab:hover{background:var(--surface);border-color:var(--line);color:var(--text)}.nav-tab.active{background:var(--green);border-color:var(--green);color:#fff}
.cmp-head{position:relative;background:
    radial-gradient(circle at 15% 20%, rgba(47,121,183,.55) 0%, transparent 45%),
    radial-gradient(circle at 85% 15%, rgba(246,217,149,.16) 0%, transparent 40%),
    radial-gradient(circle at 75% 85%, rgba(36,95,147,.6) 0%, transparent 50%),
    linear-gradient(160deg,#173b61 0%,#1d4671 45%,#245f93 75%,#2f79b7 100%);
  border-top:1px solid rgba(23,59,97,.10);border-bottom:1px solid rgba(23,59,97,.18);color:#fff;overflow:hidden}
.cmp-head::after{content:"";position:absolute;inset:0;pointer-events:none;mix-blend-mode:overlay;opacity:.5;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.cmp-hero-inner{position:relative;z-index:1}.cmp-hero-inner{max-width:760px;margin:0 auto;padding:54px 16px 50px;text-align:center}.cmp-kicker{display:inline-flex;margin-bottom:13px;border:1px solid rgba(255,255,255,.32);border-radius:999px;padding:5px 10px;color:#f7d88f;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.cmp-head h1{font-family:"Fraunces",Georgia,serif;font-optical-sizing:auto;font-size:clamp(36px,5.4vw,64px);font-weight:600;letter-spacing:-.015em;line-height:1.02;color:#fffdf7}.cmp-head h1 em{font-style:italic;font-weight:500;color:#f6d995}.cmp-head p{max-width:580px;margin:16px auto 0;color:rgba(255,255,255,.84);font-size:18px;line-height:1.55}.hero-search{display:flex;align-items:center;gap:9px;margin:26px auto 0;max-width:560px;background:#fff;border-radius:14px;padding:13px 16px;color:#5b6678;box-shadow:0 10px 30px rgba(10,30,55,.22)}.hero-search svg{flex:0 0 auto;opacity:.55}.hero-search input{flex:1 1 auto;border:0;outline:0;font:inherit;font-size:15px;color:#172033;background:transparent}.hero-search input::placeholder{color:#9aa3b2}.hero-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px auto 0;max-width:560px}.hero-card{display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.22);border-radius:14px;padding:14px 16px;color:#fff;text-decoration:none;text-align:left}.hero-card:hover{background:rgba(255,255,255,.14)}.hero-card svg{opacity:.85}.hero-card strong{font-size:15px;font-weight:800}.hero-card span{font-size:12px;color:rgba(255,255,255,.68)}.hero-text-link{display:inline-flex;align-items:center;gap:6px;margin-top:16px;color:#f6d995;font-size:14px;font-weight:700;text-decoration:none}.hero-text-link:hover{text-decoration:underline;text-underline-offset:3px}.disclosure-bar{position:fixed;bottom:0;left:0;right:0;z-index:100;background:rgba(245,248,252,.95);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:10px 16px;text-align:center;font-size:11px;color:#9e9088;line-height:1.5}.disclosure-bar a{color:var(--green);text-decoration:underline;text-underline-offset:2px;font-weight:600}
.catalog-controls{position:sticky;top:0;z-index:20;background:rgba(245,248,252,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-top:1px solid rgba(215,227,241,.78);border-bottom:1px solid rgba(215,227,241,.92);padding:10px 0 8px}
.catalog-control-inner{max-width:1180px;margin:0 auto;padding:0 16px}.catalog-search{display:flex;align-items:center;gap:8px;border:1.5px solid var(--line);background:var(--surface);border-radius:14px;padding:8px 11px;color:var(--muted);box-shadow:0 3px 10px rgba(23,59,97,.05)}.catalog-search input{width:100%;border:0;outline:0;background:transparent;color:var(--text);font:inherit;font-size:13px}.catalog-search:focus-within{border-color:#8fb7df;box-shadow:0 0 0 3px rgba(36,95,147,.12)}
.catalog-filter-title{margin:8px 0 5px;color:var(--muted);font-size:9px;font-weight:900;letter-spacing:1px;text-transform:uppercase}.catalog-chips{display:flex;gap:5px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.catalog-chips::-webkit-scrollbar{display:none}.catalog-chip{flex:0 0 auto;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--text);padding:6px 11px;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap}.catalog-chip.active{border-color:var(--green);background:var(--green);color:#fff}.catalog-summary{display:flex;justify-content:space-between;gap:8px;margin:10px 16px 4px;color:var(--muted);font-size:11.5px}
.catalog-main{padding:6px 16px 0;max-width:1180px;margin:0 auto}.catalog-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}.product-card{height:100%;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--line);border-radius:20px;background:var(--surface);box-shadow:var(--shadow)}.product-card[hidden]{display:none}.suppliers{flex:1;padding:0 12px 4px}
.product-card-head{padding:14px 14px 10px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#fffefd 0%,#eef6ff 100%)}.product-card-meta{color:var(--green);font-size:10px;font-weight:900;letter-spacing:.6px;text-transform:uppercase;opacity:.78}.product-title-row{display:flex;align-items:baseline;justify-content:space-between;gap:9px;margin-top:4px}.product-title{font-size:19px;font-weight:600;letter-spacing:-.005em}.vendor-count{flex:0 0 auto;border-radius:999px;background:var(--sage);padding:4px 9px;color:var(--green);font-size:10.5px;font-weight:800}.supplier-head{display:flex;justify-content:space-between;gap:6px;padding:9px 14px 6px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.3px;text-transform:uppercase}
.supplier-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 2px;border-top:1px solid #dde8f4}.supplier-row:first-child{border-top:none}.supplier-row:hover{background:#eef6ff;border-radius:12px}.supplier-left{display:flex;gap:9px;min-width:0;flex:1 1 auto;align-items:flex-start}.supplier-copy-wrap{min-width:0;flex:1 1 auto}.supplier-initials{flex:0 0 auto;display:flex;width:32px;height:32px;align-items:center;justify-content:center;border-radius:10px;background:var(--sage);color:var(--green);font-size:11px;font-weight:900;margin-top:1px}.supplier-thumb{flex:0 0 auto;width:32px;height:32px;border-radius:10px;object-fit:cover;background:var(--bg);border:1px solid var(--line);margin-top:1px}.supplier-name{font-size:13.5px;font-weight:700;line-height:1.2;white-space:normal;overflow:visible;text-overflow:clip;max-width:none;overflow-wrap:anywhere}.supplier-sub{display:flex;flex-wrap:wrap;gap:6px;margin-top:3px;color:var(--muted);font-size:11px;line-height:1.25}.supplier-discount{color:var(--gold);font-weight:900}.supplier-oos{color:#a04848;font-weight:900}
.supplier-price-wrap{text-align:right;flex:0 0 auto;display:grid;justify-items:end;gap:3px}.supplier-price{font-size:14px;font-weight:800;color:var(--green-deep)}.supplier-price-was{font-size:11px;font-weight:600;color:var(--muted);text-decoration:line-through}.supplier-price-discounted{color:#1d7a3c}.supplier-best{display:inline-block;font-size:9.5px;font-weight:800;color:var(--green);background:var(--sage);border-radius:999px;padding:1.5px 7px;white-space:nowrap}.supplier-buttons{display:flex;justify-content:flex-end;align-items:center;gap:5px;flex-wrap:wrap}.supplier-go,.supplier-copy{border:0;border-radius:999px;padding:6px 9px;font:inherit;font-size:10.5px;font-weight:800;white-space:nowrap;cursor:pointer}.supplier-go{background:var(--green);color:#fff}.supplier-go:hover{background:var(--green-deep)}.supplier-copy{background:#fff8e3;color:#795b05;border:1px solid #e7cf7a}.supplier-copy:hover{background:#fff1be}.supplier-copy.copied{background:var(--sage);color:var(--green);border-color:rgba(36,95,147,.18)}
.catalog-empty{border:1px solid var(--line);border-radius:14px;background:var(--surface);padding:26px;text-align:center;color:var(--muted);font-size:13.5px}.cmp-foot{margin:22px 16px 0;font-size:12px;color:var(--muted);text-align:center;line-height:1.5}.cmp-foot a{color:var(--green);text-decoration:underline;text-underline-offset:2px}.expand-row{display:flex;border-top:1px solid var(--line);border-radius:0 0 18px 18px;overflow:hidden}.expand-button,.collapse-button{flex:1 1 auto;border:0;background:var(--sage);padding:11px;color:var(--green);font:inherit;font-size:12.5px;font-weight:900;cursor:pointer}.expand-button:hover,.collapse-button:hover{background:#e9f2fb}.expand-button:not([hidden]) ~ .collapse-button{border-left:1px solid var(--line)}.collapse-button{background:#fff8e3;color:#795b05}.collapse-button:hover{background:#fff1be}[hidden]{display:none!important}
footer{background:linear-gradient(135deg,var(--green-deep),var(--green));padding:24px 14px 20px;margin-top:30px}.footer-inner{max-width:1180px;margin:0 auto}.footer-brand{font-size:14px;font-weight:800;color:#fff;font-family:"Source Sans 3",system-ui,-apple-system,sans-serif}.footer-desc{font-size:11px;color:rgba(255,255,255,.48);line-height:1.6;margin:4px 0 13px}.footer-links{display:flex;gap:13px;flex-wrap:wrap;margin-bottom:11px}.footer-links a{font-size:11px;color:rgba(255,255,255,.58);font-weight:700}.footer-bottom{font-size:10px;color:rgba(255,255,255,.28);padding-top:9px;border-top:1px solid rgba(255,255,255,.08)}
@media (max-width:920px){.catalog-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:620px){.site-nav{margin:0 12px 10px}.nav-logo span{display:none}.nav-tab{font-size:12px;padding:6px 9px}.cmp-hero-inner{padding:34px 14px 30px}.cmp-head h1{font-size:clamp(33px,11vw,46px)}.cmp-head p{font-size:15px}.hero-search{margin-top:20px;padding:11px 14px}.hero-search input{font-size:14px}.hero-cards{margin-top:10px}.hero-card{padding:12px 13px}.hero-card strong{font-size:13.5px}.hero-card span{font-size:11px}.catalog-grid{grid-template-columns:1fr;gap:10px}.catalog-main{padding:6px 16px 0}.supplier-row{gap:9px}.supplier-price-wrap{min-width:96px}.supplier-buttons{gap:4px}.supplier-go,.supplier-copy{font-size:10px;padding:6px 8px}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style>
</head>
<body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TS4KTRPL" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>

<nav class="site-nav" aria-label="Site navigation">
  <a class="nav-logo" href="/">
    <img src="/assets/icons/nav-icon.png" alt="Remy's Lab" width="36" height="36"/>
    <span>Remy's Lab</span>
  </a>
  <div class="nav-tabs" role="tablist">
    <a class="nav-tab active" href="/" role="tab" aria-current="page">Compare</a>
    <a class="nav-tab" href="/codes/" role="tab">Codes</a>
    <a class="nav-tab" href="/blog/" role="tab">Lab Notes</a>
  </div>
</nav>

<header class="cmp-head">
  <div class="cmp-hero-inner">
    <div>
      <span class="cmp-kicker">Remy's Lab · Pet product research</span>
      <h1>Compare real prices on pet products <em>before you buy.</em></h1>
      <p>Remy's Lab tracks live prices across pet brands, lists active discount codes, and shares Lab Notes on what we've actually tested, all in one place, so you can shop smarter without doing the digging yourself.</p>

      <form class="hero-search" role="search" aria-label="Search products or brands" onsubmit="return false">
        <svg width="17" height="17" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M10 6.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zm-.666 3.42a4.5 4.5 0 1 1 .707-.707l2.873 2.872a.5.5 0 1 1-.707.707L9.334 9.92z" fill="currentColor"/></svg>
        <input id="heroSearch" type="search" placeholder="Search products, brands, or codes..." autocomplete="off" aria-label="Search products, brands, or codes"/>
      </form>

      <div class="hero-cards" aria-label="Quick actions">
        <a class="hero-card" href="#catalogSearch">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 7h14M3 7l3-3M17 7l-3-3M17 13H3M17 13l-3 3M3 13l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <strong>Compare Prices</strong>
          <span>Save time &amp; money</span>
        </a>
        <a class="hero-card" href="/codes/">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 5 3 10l4 5M13 5l4 5-4 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <strong>View Active Codes</strong>
          <span>Verified &amp; tested</span>
        </a>
      </div>

      <a class="hero-text-link" href="/blog/">Read our Lab Notes
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7h9M7.5 3l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
    </div>
  </div>
</header>

<div class="page">
  <div class="catalog-controls">
    <div class="catalog-control-inner">
      <label class="catalog-search" for="catalogSearch">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M10 6.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zm-.666 3.42a4.5 4.5 0 1 1 .707-.707l2.873 2.872a.5.5 0 1 1-.707.707L9.334 9.92z" fill="currentColor"/></svg>
        <input id="catalogSearch" type="search" placeholder="Search products or brands..." autocomplete="off"/>
      </label>
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

<footer><div class="footer-inner"><div class="footer-brand">Remy's Lab</div><div class="footer-desc">Compare dog gear prices, grab codes, and read honest test notes from @remy.lab on TikTok.</div><div class="footer-links"><a href="/">Compare</a><a href="/codes/">Codes</a><a href="/blog/">Lab Notes</a><a href="/vendors/">Vendors</a><a href="https://www.tiktok.com/@remy.lab" target="_blank" rel="noopener">TikTok</a><a href="/disclaimer.html">Disclosure</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/llms.txt">LLMs.txt</a></div><div class="footer-bottom">&copy; ${new Date().getFullYear()} Remy's Lab &middot; Some links may be affiliate links &middot; Remy is a real dog.</div></div></footer>

<script>
(function(){
  var state={cat:"All",brand:"All",q:""};
  var search=document.getElementById("catalogSearch");

  function rowMatches(row){
    var brandMatch = state.brand==="All" || row.dataset.network===state.brand;
    var searchText = (row.dataset.search || row.textContent || "").toLowerCase();
    var searchMatch = !state.q || searchText.indexOf(state.q) > -1;
    return brandMatch && searchMatch;
  }

  function apply(){
    var cards=document.querySelectorAll(".product-card");
    var visibleCards=0;
    var visibleRows=0;
    var hasExplicitFilter = state.brand !== "All" || !!state.q;
    cards.forEach(function(card){
      var matchesCat = state.cat==="All" || card.dataset.cat===state.cat;
      var rows=card.querySelectorAll(".supplier-row");
      var anyRowMatch=false;
      var mustExpand=false;
      rows.forEach(function(row){
        if (rowMatches(row)) {
          anyRowMatch = true;
          if (row.classList.contains("extra-row") && hasExplicitFilter) mustExpand = true;
        }
      });
      if (!hasExplicitFilter) collapseCard(card, true);
      else if (mustExpand) expandCard(card, true);
      rows.forEach(function(row){
        var match = rowMatches(row);
        var collapsed = row.classList.contains("extra-row") && !row.dataset.expanded;
        var showRow = match && !collapsed;
        row.style.display = showRow ? "" : "none";
        if (match && matchesCat) visibleRows++;
      });
      var show = matchesCat && anyRowMatch;
      card.hidden = !show;
      if(show) visibleCards++;
    });
    document.getElementById("catalogStatus").textContent =
      "Showing " + visibleCards + " categor" + (visibleCards===1?"y":"ies") + " · " + visibleRows + " listing" + (visibleRows===1?"":"s");
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

  var EXPAND_BATCH = 10;

  /** Manual browsing: reveal the next batch of hidden rows, not the whole rest of the list —
   *  a deep category like "Other" (200+ hidden) shouldn't dump everything in on one click. */
  function expandNextBatch(card){
    var hidden = Array.prototype.slice.call(card.querySelectorAll(".extra-row")).filter(function(r){ return !r.dataset.expanded; });
    if (!hidden.length) return;
    hidden.slice(0, EXPAND_BATCH).forEach(function(row){ row.dataset.expanded = "1"; row.hidden = false; });
    updateExpandButtons(card);
  }

  /** Always fully resets a card back to its default 5-visible state, no matter how many
   *  batches are currently shown — this must be reachable after even a single "show more"
   *  click, not gated behind manually expanding all the way to the end first. */
  function collapseToDefault(card){
    var extras = card.querySelectorAll(".extra-row");
    extras.forEach(function(row){ row.dataset.expanded = ""; row.hidden = true; });
    delete card.dataset.autoExpanded;
    updateExpandButtons(card);
  }

  /** Filter/search correctness path: a match buried in the hidden tail must actually become
   *  visible, not require several manual clicks to reach — so this reveals everything at once. */
  function expandCard(card, auto){
    var extras = card.querySelectorAll(".extra-row");
    if (!extras.length) return;
    var anyHidden = Array.prototype.slice.call(extras).some(function(r){ return !r.dataset.expanded; });
    if (!anyHidden) return;
    extras.forEach(function(row){ row.dataset.expanded = "1"; row.hidden = false; });
    if (auto) card.dataset.autoExpanded = "1";
    updateExpandButtons(card);
  }

  function collapseCard(card, onlyIfAuto){
    if (onlyIfAuto && card.dataset.autoExpanded !== "1") return;
    var extras = card.querySelectorAll(".extra-row");
    var anyExpanded = Array.prototype.slice.call(extras).some(function(r){ return r.dataset.expanded; });
    if (!extras.length || !anyExpanded) return;
    extras.forEach(function(row){ row.dataset.expanded = ""; row.hidden = true; });
    delete card.dataset.autoExpanded;
    updateExpandButtons(card);
  }

  function updateExpandButtons(card){
    var expandBtn = card.querySelector('[data-action="expand-card"]');
    var collapseBtn = card.querySelector('[data-action="collapse-card"]');
    if (!expandBtn) return;
    var extras = Array.prototype.slice.call(card.querySelectorAll(".extra-row"));
    var hiddenCount = extras.filter(function(r){ return !r.dataset.expanded; }).length;
    var anyExpanded = extras.some(function(r){ return r.dataset.expanded; });
    if (hiddenCount === 0) {
      expandBtn.hidden = true;
    } else {
      expandBtn.hidden = false;
      var nextBatch = Math.min(EXPAND_BATCH, hiddenCount);
      expandBtn.textContent = "Show " + nextBatch + " more listing" + (nextBatch === 1 ? "" : "s") +
        (hiddenCount > nextBatch ? " (" + hiddenCount + " left)" : "");
    }
    if (collapseBtn) collapseBtn.hidden = !anyExpanded;
  }

  function wireExpand(){
    document.querySelectorAll('[data-action="expand-card"]').forEach(function(btn){
      btn.addEventListener("click", function(){
        expandNextBatch(btn.closest(".product-card"));
        apply();
      });
    });
    document.querySelectorAll('[data-action="collapse-card"]').forEach(function(btn){
      btn.addEventListener("click", function(){
        collapseToDefault(btn.closest(".product-card"));
        apply();
      });
    });
  }

  if (search) {
    search.addEventListener("input", function(){
      state.q = search.value.trim().toLowerCase();
      apply();
    });
  }

  // Hero search is a real, functional handoff into the same filter state, not a second
  // disconnected search box — typing here drives the actual catalog search below.
  var heroSearch = document.getElementById("heroSearch");
  if (heroSearch && search) {
    heroSearch.addEventListener("input", function(){
      search.value = heroSearch.value;
      state.q = heroSearch.value.trim().toLowerCase();
      apply();
    });
    heroSearch.addEventListener("focus", function(){
      search.closest(".catalog-controls").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  wire("catChips","cat");
  wire("brandChips","brand");
  wireExpand();
  apply();
})();
</script>

<script src="/assets/js/affiliate-tracking.js" defer></script>
<div class="disclosure-bar" role="contentinfo" aria-label="Affiliate disclosure">Some links are affiliate links, Remy's Lab may earn a small commission if you buy. A listing here does not mean Remy has tested it &mdash; see <a href="/blog/">Lab Notes</a> for what he's actually used. <a href="/disclaimer.html">Full disclosure</a></div>
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
