#!/usr/bin/env node
/**
 * build-compare.mjs — Remy's Lab price comparison data builder
 * --------------------------------------------------------------
 * Unlike a hand-picked Lab Notes shelf, this pulls every product
 * from each brand's public Shopify /products.json and sorts it into category
 * groups by keyword match. No testing requirement, this is a browse/compare
 * tool, not an endorsement.
 *
 * Honesty rule baked into the design: products are grouped by CATEGORY
 * ("all the leashes"), never matched as "the same product" across brands.
 * That distinction is what keeps this from making false equivalence claims.
 *
 * Reliability: a brand that fails to fetch keeps its last-good products
 * (never blanked). Per-brand fetch isolation, one brand failing does not
 * affect the others.
 *
 * Zero dependencies. Node 20+. Local test: MOCK_DIR=./_mock node scripts/build-compare.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const MOCK_DIR = process.env.MOCK_DIR ? path.resolve(ROOT, process.env.MOCK_DIR) : null;
const FETCH_TIMEOUT_MS = 14000;
const ENGINE_VERSION = "1.1.0";

const log  = (...a) => console.log("[compare]", ...a);
const warn = (...a) => console.warn("[compare] WARN:", ...a);

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (err) { if (fallback !== null) return fallback; throw new Error(`read ${path.basename(file)}: ${err.message}`); }
}
const trimSlash = u => String(u || "").replace(/\/+$/, "");
const money = v => { const n = Number.parseFloat(v); return Number.isFinite(n) ? `$${n.toFixed(2)}` : null; };
/** Price a shopper actually pays after applying the brand's standing discount code, if any.
 *  Used for sorting and the "Lowest price" badge — "cheapest" should mean cheapest in reality,
 *  not cheapest on the sticker, or a discounted competitor could lose to a pricier listed one. */
const effectivePrice = p => {
  const base = p.price_value;
  if (base == null || !Number.isFinite(p.discount_percent)) return base;
  return Math.round(base * (1 - p.discount_percent / 100) * 100) / 100;
};

async function fetchShopifyPage(domain, page) {
  const url = `${trimSlash(domain)}/products.json?limit=250&page=${page}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: c.signal, headers: { "User-Agent": "RemysLab-Compare/1.0 (+https://remyslab.com)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.products) ? data.products : [];
  } finally { clearTimeout(t); }
}

async function loadBrandProducts(brandId, brand) {
  if (MOCK_DIR) {
    const data = await readJson(path.join(MOCK_DIR, `${brandId}.json`));
    return Array.isArray(data.products) ? data.products : [];
  }
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await fetchShopifyPage(brand.domain, page);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 250) break;
  }
  return all;
}

function readShopifyProduct(raw) {
  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  const prices = variants.map(v => Number.parseFloat(v.price)).filter(Number.isFinite);
  const minPrice = prices.length ? Math.min(...prices) : null;
  return {
    name: raw.title || null,
    handle: raw.handle || null,
    price: money(minPrice),
    price_value: minPrice,
    in_stock: variants.some(v => v.available === true),
    image: (Array.isArray(raw.images) && raw.images[0]) ? raw.images[0].src : null,
    product_type: raw.product_type || "",
    tags: Array.isArray(raw.tags) ? raw.tags : (typeof raw.tags === "string" ? raw.tags.split(",") : [])
  };
}

/**
 * Some Shopify stores create hidden $0 "shadow" products purely to power an
 * upsell widget (e.g. "would you like to add a matching leash?"). These are
 * real Shopify products with real handles, so they come back from
 * /products.json indistinguishable from genuine catalog items by price alone, except their price actually IS $0, every variant, every time. A real
 * product never prices at exactly $0. Title/handle patterns like
 * "Free Product" or "copy-of-" are the same upsell-widget artifact showing
 * up in the merchant-chosen name instead of price. Filtering both signals
 * here keeps upsell noise out of every brand without per-brand special-casing.
 */
const JUNK_PRODUCT_PATTERNS = [
  "free product",
  "copy-of-",
  "copy of",
  "gift card",
  "store credit",
  "shipping protection",
  "package protection",
  "delivery guarantee",
  "return shipping",
  "priority processing",
  "carbon offset",
  "plant 1 tree",
  "ambassador coupon",
  "personalization",
  "engraving test",
  "dad hat",
  "pack hat",
  "lanyard",
  "satin scrunchie",
  "scrunchie",
  "cat harness",
  "breakaway cat",
  "cat collar",
  "cat tunnel",
  "cat meal kit",
  "cat litter",
  "litter box",
  "cat tower",
  "cat wild wand",
  "flora wand",
  "catenary flora wand"
];

function isJunkProduct(live) {
  if (live.price_value === 0) return true;
  const haystack = `${live.name || ""} ${live.handle || ""} ${live.product_type || ""} ${(live.tags || []).join(" ")}`.toLowerCase();
  return JUNK_PRODUCT_PATTERNS.some(pattern => haystack.includes(pattern));
}

/** Category match by keyword. Product title gets first pass so noisy store tags do not override obvious names like "collar". */
function matchCategory(product, categories) {
  const name = String(product.name || "").toLowerCase();
  for (const cat of categories) {
    if (cat.keywords.length === 0) continue;
    if (cat.keywords.some(kw => name.includes(kw.toLowerCase()))) return cat.id;
  }
  const haystack = [product.name, product.product_type, ...(product.tags || [])]
    .filter(Boolean).join(" ").toLowerCase();
  for (const cat of categories) {
    if (cat.keywords.length === 0) continue;
    if (cat.keywords.some(kw => haystack.includes(kw.toLowerCase()))) return cat.id;
  }
  return "other";
}

function buildUrl(brand, handle) {
  const domain = trimSlash(brand.domain);
  const productPath = handle ? `/products/${handle}` : "/";
  if (brand.link_style === "discount_redirect" && brand.discount_code) {
    return `${domain}/discount/${encodeURIComponent(brand.discount_code)}?redirect=${encodeURIComponent(productPath)}`;
  }
  return `${domain}${productPath}`;
}

async function build() {
  const brandsCfg = await readJson(path.join(DATA, "brands.json"));
  const categoriesCfg = await readJson(path.join(DATA, "categories.json"));
  const prior = await readJson(path.join(DATA, "compare.json"), { products: [] });

  const brands = brandsCfg.brands || {};
  const categories = categoriesCfg.categories || [];
  const priorByBrand = new Map();
  for (const p of (prior.products || [])) {
    if (!priorByBrand.has(p.brand_id)) priorByBrand.set(p.brand_id, []);
    priorByBrand.get(p.brand_id).push(p);
  }

  const out = [];
  for (const [brandId, brand] of Object.entries(brands)) {
    let raws = null;
    try {
      raws = await loadBrandProducts(brandId, brand);
      log(`${brand.name}: pulled ${raws.length} products`);
    } catch (err) {
      warn(`${brand.name}: fetch failed (${err.message}) — keeping last good data`);
    }

    if (raws) {
      for (const raw of raws) {
        const live = readShopifyProduct(raw);
        if (!live.name || live.price_value == null) continue; // skip unparsable/no-price entries
        if (isJunkProduct(live)) continue; // skip $0 upsell shadow products and bundle-copy noise
        const categoryId = matchCategory(live, categories);
        out.push({
          brand_id: brandId,
          brand_name: brand.name,
          name: live.name,
          category: categoryId,
          price: live.price,
          price_value: live.price_value,
          in_stock: live.in_stock,
          image: live.image,
          url: buildUrl(brand, live.handle),
          discount_code: brand.discount_code,
          discount_percent: brand.discount_percent ?? null,
          effective_price: effectivePrice({ price_value: live.price_value, discount_percent: brand.discount_percent ?? null }),
          affiliate_disclosure: brand.affiliate_disclosure || "none",
          source: "live"
        });
      }
    } else if (priorByBrand.has(brandId)) {
      out.push(...priorByBrand.get(brandId).map(p => ({ ...p, source: "fallback" })));
    } else {
      warn(`${brand.name}: no live data and no prior snapshot — brand will be empty this run`);
    }
  }

  // Sort: category order, then price ascending within category (cheapest first = useful default)
  const catOrder = categories.reduce((m, c, i) => (m[c.id] = i, m), {});
  out.sort((a, b) => {
    const ca = catOrder[a.category] ?? 99, cb = catOrder[b.category] ?? 99;
    if (ca !== cb) return ca - cb;
    return (a.effective_price ?? a.price_value ?? Infinity) - (b.effective_price ?? b.price_value ?? Infinity);
  });

  // Category summary: which categories have 2+ brands (real comparison) vs 1 (browse-only)
  const byCategory = {};
  for (const p of out) {
    byCategory[p.category] = byCategory[p.category] || new Set();
    byCategory[p.category].add(p.brand_id);
  }
  const categorySummary = categories.map(c => ({
    id: c.id, label: c.label,
    brand_count: byCategory[c.id] ? byCategory[c.id].size : 0,
    product_count: out.filter(p => p.category === c.id).length
  })).filter(c => c.product_count > 0);

  const snapshot = {
    generated_at: new Date().toISOString(),
    engine_version: ENGINE_VERSION,
    category_order: categories.map(c => c.id),
    category_labels: categories.reduce((m, c) => (m[c.id] = c.label, m), {}),
    category_summary: categorySummary,
    product_count: out.length,
    products: out
  };
  await writeFile(path.join(DATA, "compare.json"), JSON.stringify(snapshot, null, 2) + "\n");
  log(`wrote compare.json (${out.length} products across ${categorySummary.length} categories)`);
}

build().catch(err => { console.error("[compare] FATAL:", err.message); process.exit(1); });
