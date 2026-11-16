/**
 * Sambo Store — ABA PayWay Payment Worker
 *
 * POST /api/purchase → Price the cart from the product sheet, create the PayWay payment,
 *                      and return a signed order token
 * POST /api/check    → Payment status (the page polls this)
 * POST /api/order    → Check the signed order token and the PayWay payment, then send the
 *                      order to the store owner (and a receipt to Mini App customers)
 *
 * Prices and the owner's Telegram message are built here. Nothing the browser says about
 * prices, totals or payment status is trusted.
 *
 * Secrets (set via: npx wrangler secret put <NAME>):
 *   API_KEY            — ABA PayWay API key (also signs order tokens)
 *   TELEGRAM_BOT_TOKEN — Telegram bot token (also verifies Mini App users)
 *   TELEGRAM_CHAT_ID   — Store owner Telegram chat ID
 *
 * Vars in wrangler.toml (non-sensitive):
 *   MERCHANT_ID, PAYWAY_BASE_URL, PRODUCTS_URL, ALLOWED_ORIGIN (optional)
 */

const ENDPOINTS = {
  PURCHASE: '/api/payment-gateway/v1/payments/purchase',
  CHECK: '/api/payment-gateway/v1/payments/check-transaction-2'
};

const MAX_BODY_CHARS        = 64_000;
const MAX_CART_ITEMS        = 50;
const ORDER_TOKEN_TTL_MS    = 24 * 60 * 60 * 1000;
const TG_INIT_DATA_MAX_AGE  = 24 * 60 * 60; // seconds

const enc = new TextEncoder();

// ===== CORS — strict allowlist =====
const ALWAYS_ALLOWED = ['https://hyper1708.github.io'];
const DEV_PREFIXES   = ['http://localhost', 'http://127.0.0.1'];

function getCorsHeaders(origin, env) {
  const extraOrigin = env?.ALLOWED_ORIGIN || '';
  const allowed =
    ALWAYS_ALLOWED.includes(origin) ||
    DEV_PREFIXES.some(p => (origin || '').startsWith(p)) ||
    (extraOrigin && origin === extraOrigin);
  const effectiveOrigin = allowed ? origin : ALWAYS_ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': effectiveOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

// ===== INPUT VALIDATION & SANITIZATION =====

/** Strip characters that could inject HTML, trim, and cap the length. */
function sanitizeText(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim().slice(0, maxLen);
}

/** Amount must be a finite integer between 100 KHR and 50,000,000 KHR. */
function validateAmount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 100 || n > 50_000_000) return null;
  return Math.round(n);
}

/** tran_id must match the format this Worker generates. */
function validateTranId(id) {
  return typeof id === 'string' && /^SS\d{10}$/.test(id);
}

function validatePhone(raw) {
  if (!raw) return '';
  return String(raw).replace(/[^\d+\s\-()ា-៿]/g, '').slice(0, 20);
}

function validateSiteUrl(raw) {
  if (typeof raw !== 'string') return '';
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? raw : '';
  } catch { return ''; }
}

/** "15,000៛", "15000" or 15000 → 15000. The storefront uses the same rule. */
function parsePrice(raw) {
  const cleaned = String(raw ?? '').replace(/[^\d.]/g, '');
  return cleaned ? Number(cleaned) : NaN;
}

function clampInt(raw, min, max) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min;
}

function cleanCustomer(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const lat = Number(c.lat);
  const lng = Number(c.lng);
  const hasCoords = c.lat !== '' && c.lng !== '' && c.lat != null && c.lng != null &&
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return {
    name:    sanitizeText(c.name, 100),
    phone:   validatePhone(c.phone),
    address: sanitizeText(c.address, 300),
    note:    sanitizeText(c.note, 200),
    lat:     hasCoords ? lat : null,
    lng:     hasCoords ? lng : null
  };
}

// ===== ENCODING & CRYPTO =====
function bytesToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, ch => ch.charCodeAt(0));
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g), h => parseInt(h, 16));
}

async function hmac512(message, key) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key),
    { name: 'HMAC', hash: 'SHA-512' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function utcNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function safeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...headers, 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }
  });
}

// ===== CONFIG — no hardcoded fallbacks for sensitive values =====
function getConfig(env) {
  const MID = env?.MERCHANT_ID;
  const KEY = env?.API_KEY;
  const URL = env?.PAYWAY_BASE_URL || 'https://checkout-sandbox.payway.com.kh';
  if (!MID) throw new Error('MERCHANT_ID not configured');
  if (!KEY) throw new Error('API_KEY secret not set — run: npx wrangler secret put API_KEY');
  return { MID, KEY, URL };
}

// ===== SIGNED ORDER TOKEN =====
// Carries the priced order from /api/purchase to /api/order without storage.
// Any change to the token breaks the signature.

async function orderTokenKey(env) {
  const { KEY } = getConfig(env);
  return crypto.subtle.importKey(
    'raw', enc.encode('sambo-order-token-v1:' + KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']
  );
}

async function signOrderToken(payload, env) {
  const body = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const sig  = await crypto.subtle.sign('HMAC', await orderTokenKey(env), enc.encode(body));
  return body + '.' + bytesToB64url(new Uint8Array(sig));
}

/** Returns the order payload, or null if the token is forged, altered or expired. */
async function readOrderToken(token, env) {
  if (typeof token !== 'string' || token.length > MAX_BODY_CHARS) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC', await orderTokenKey(env), b64urlToBytes(parts[1]), enc.encode(parts[0])
    );
    if (!valid) return null;
    const order = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    if (!order || order.v !== 1 || !validateTranId(order.tran_id)) return null;
    if (!(order.exp > Date.now())) return null;
    return order;
  } catch {
    return null;
  }
}

// ===== TELEGRAM MINI APP USER =====
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Returns { id, username } for a genuine Mini App session, otherwise null.
async function verifyTelegramInitData(initData, botToken) {
  if (!botToken || typeof initData !== 'string' || !initData || initData.length > 4096) return null;
  try {
    const params = new URLSearchParams(initData);
    const hashBytes = hexToBytes(params.get('hash'));
    if (!hashBytes) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const webAppKey = await crypto.subtle.importKey(
      'raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const secret = await crypto.subtle.sign('HMAC', webAppKey, enc.encode(botToken));
    const checkKey = await crypto.subtle.importKey(
      'raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valid = await crypto.subtle.verify('HMAC', checkKey, hashBytes, enc.encode(dataCheckString));
    if (!valid) return null;

    const authDate = parseInt(params.get('auth_date'), 10);
    if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > TG_INIT_DATA_MAX_AGE) return null;

    const user = JSON.parse(params.get('user') || 'null');
    if (!user || typeof user.id !== 'number') return null;
    return {
      id: user.id,
      username: typeof user.username === 'string' ? user.username.slice(0, 64) : ''
    };
  } catch {
    return null;
  }
}

// ===== PRODUCTS & PRICING =====
async function loadProducts(env) {
  const url = env?.PRODUCTS_URL;
  if (!url) throw new Error('PRODUCTS_URL not configured');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Product sheet returned HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Product sheet did not return a list');
  // Same normalization as the storefront: lowercase, trimmed column names
  return rows.map(row => {
    const p = {};
    for (const k of Object.keys(row || {})) p[k.toLowerCase().trim()] = row[k];
    return p;
  }).filter(p => p.name && String(p.name).trim() !== '');
}

/** Look up every cart line in the product sheet and price it there. */
async function priceCart(rawItems, env) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return { error: 'Your cart is empty.' };
  if (rawItems.length > MAX_CART_ITEMS) return { error: 'Too many items in cart.' };

  const products = await loadProducts(env);
  const items = [];

  for (const raw of rawItems) {
    const id   = raw?.id != null ? String(raw.id).trim() : '';
    const name = String(raw?.name ?? '').trim().toLowerCase();
    // Match by id; fall back to name for carts saved before ids were stored
    const product =
      (id && products.find(p => String(p.id ?? '').trim() === id)) ||
      (name && products.find(p => String(p.name).trim().toLowerCase() === name));

    if (!product) {
      return { error: `Product no longer available: ${sanitizeText(String(raw?.name || id), 100)}` };
    }
    const label = sanitizeText(String(product.name), 100);
    if (!((parseInt(product.stock, 10) || 0) > 0)) return { error: `Out of stock: ${label}` };

    const price = parsePrice(product.pricess);
    if (!Number.isFinite(price) || price <= 0) return { error: `No price set for: ${label}` };

    const quantity = clampInt(raw?.quantity, 1, 999);
    // Customer's note for this line (colors, sizes, packing...), shown to the store owner
    const note = sanitizeText(String(raw?.note ?? '').replace(/\s+/g, ' '), 200);
    items.push(note ? { name: label, quantity, price, note } : { name: label, quantity, price });
  }

  const amount = validateAmount(items.reduce((sum, i) => sum + i.price * i.quantity, 0));
  if (!amount) return { error: 'Order total must be between 100៛ and 50,000,000៛.' };
  return { items, amount };
}

// ===== CREATE PAYMENT =====
async function createPayment(body, env) {
  const customer = cleanCustomer(body.customer);
  if (customer.name.length < 2 || !customer.phone) {
    return { error: 'Name and phone number are required.' };
  }

  const priced = await priceCart(body.items, env);
  if (priced.error) return { error: priced.error };
  const { items, amount } = priced;

  const cfg      = getConfig(env);
  const currency = 'KHR';
  const site_url = validateSiteUrl(body.site_url);
  const tg       = await verifyTelegramInitData(body.tg_init_data, env?.TELEGRAM_BOT_TOKEN);
  const lang     = body.lang === 'kh' ? 'kh' : 'en';

  const req_time     = utcNow();
  const tran_id      = 'SS' + Date.now().toString().slice(-10);
  // PayWay only gets name, quantity and price; notes stay in the signed order
  const paywayItems  = items.map(({ name, quantity, price }) => ({ name, quantity, price }));
  const encodedItems = safeBase64(JSON.stringify(paywayItems));
  const returnPage   = site_url
    ? btoa(site_url + (site_url.includes('?') ? '&' : '?') + 'payway_tran=' + tran_id)
    : '';

  const hashParts = [
    req_time, cfg.MID, tran_id, String(amount), encodedItems, '',
    customer.name, '', '', customer.phone, 'purchase', 'abapay_khqr_deeplink',
    '', '', returnPage, '',
    currency, '', '', '',
    '30', '', '', ''
  ];
  const hash = await hmac512(hashParts.join(''), cfg.KEY);

  const order_token = await signOrderToken({
    v: 1, tran_id, amount, currency, items, customer, tg, lang,
    exp: Date.now() + ORDER_TOKEN_TTL_MS
  }, env);
  const order = { tran_id, amount, currency, items, order_token };

  const fd = new FormData();
  fd.append('req_time', req_time);
  fd.append('merchant_id', cfg.MID);
  fd.append('tran_id', tran_id);
  fd.append('amount', String(amount));
  fd.append('items', encodedItems);
  fd.append('firstname', customer.name);
  fd.append('phone', customer.phone);
  fd.append('type', 'purchase');
  fd.append('payment_option', 'abapay_khqr_deeplink');
  if (returnPage) fd.append('continue_success_url', returnPage);
  fd.append('currency', currency);
  fd.append('lifetime', '30');
  fd.append('hash', hash);

  const res = await fetch(cfg.URL + ENDPOINTS.PURCHASE, { method: 'POST', body: fd });
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('json')) {
    const data = await res.json();
    return { success: true, ...data, ...order };
  }

  // HTML response → fall back to hosted checkout form
  const hostedParts  = [...hashParts];
  hostedParts[11]    = 'abapay_khqr';
  const hostedHash   = await hmac512(hostedParts.join(''), cfg.KEY);
  return {
    success: true, ...order, fallback: 'hosted',
    checkout_url: cfg.URL + ENDPOINTS.PURCHASE,
    fields: {
      req_time, merchant_id: cfg.MID, tran_id,
      amount: String(amount), items: encodedItems,
      firstname: customer.name, phone: customer.phone,
      type: 'purchase', payment_option: 'abapay_khqr',
      continue_success_url: returnPage,
      currency, lifetime: '30', hash: hostedHash
    }
  };
}

// ===== CHECK PAYMENT STATUS =====
async function checkPayment(body, env) {
  const { tran_id } = body;
  if (!validateTranId(tran_id)) return { error: 'Invalid transaction ID format' };

  const cfg      = getConfig(env);
  const req_time = utcNow();
  const hash     = await hmac512(req_time + cfg.MID + tran_id, cfg.KEY);

  const res = await fetch(cfg.URL + ENDPOINTS.CHECK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ req_time, merchant_id: cfg.MID, tran_id, hash })
  });
  return await res.json();
}

/** The order amount PayWay reports for a transaction, or null if it isn't in the response. */
function reportedAmount(data) {
  for (const key of ['original_amount', 'total_amount']) {
    if (data[key] != null && data[key] !== '' && Number.isFinite(Number(data[key]))) {
      return Number(data[key]);
    }
  }
  return null;
}

// ===== ORDER → TELEGRAM =====

/** Escape characters that Telegram's legacy Markdown treats as formatting. */
function escapeMd(value) {
  return String(value ?? '').replace(/[_*`[]/g, '\\$&');
}

function formatKHR(n) {
  return Math.round(n).toLocaleString('en-US') + '៛';
}

function phnomPenhTime() {
  return new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' });
}

const RECEIPT_TEXT = {
  en: {
    items: 'Order Items',
    total: 'Total',
    note: 'We will deliver your order soon. Thank you for shopping with Sambo Store!'
  },
  kh: {
    items: 'មុខទំនិញដែលបានបញ្ជាទិញ',
    total: 'សរុប',
    note: 'យើងនឹងដឹកជញ្ជូនការបញ្ជាទិញរបស់អ្នកឆាប់ៗ។ សូមអរគុណដែលបានទិញជាមួយ Sambo Store!'
  }
};

async function sendTelegram(botToken, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });
  return res.json();
}

async function submitOrder(body, env) {
  const order = await readOrderToken(body.order_token, env);
  if (!order) return { ok: false, error: 'Invalid or expired order. Please contact the store.' };

  const BOT_TOKEN = env?.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = env?.TELEGRAM_CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) {
    return { ok: false, error: 'Telegram credentials not configured in Worker secrets' };
  }

  // Ask PayWay directly — never take the browser's word that the order is paid
  const status = await checkPayment({ tran_id: order.tran_id }, env);
  if (!status?.data || status.data.payment_status_code !== 0) {
    return { ok: false, error: 'Payment not confirmed' };
  }

  // The amount was fixed by this Worker when the payment was created; flag any difference
  const paid = reportedAmount(status.data);
  const amountMismatch = paid !== null && Math.round(paid) !== order.amount;
  if (amountMismatch) {
    console.error(`Amount mismatch for ${order.tran_id}: PayWay ${paid}, order ${order.amount}`);
  }

  // Order counts come from the customer's own device, so they are only a hint
  const history = body.history && typeof body.history === 'object' ? body.history : {};
  const orders        = clampInt(history.orders, 0, 100_000);
  const cancellations = clampInt(history.cancellations, 0, 100_000);
  const cancelRate    = orders > 0 ? cancellations / orders : 0;
  let riskIndicator = '';
  let riskWarning   = '';
  if (orders > 0 && cancelRate >= 0.5) {
    riskIndicator = '🚨 ';
    riskWarning = `⚠️ RISKY: ${cancellations}/${orders} cancellations`;
  } else if (orders > 0 && cancelRate >= 0.25) {
    riskIndicator = '⚠️ ';
    riskWarning = `⚠️ MODERATE: ${cancellations}/${orders} cancellations`;
  }

  const c = order.customer;
  const total = formatKHR(order.amount);
  const itemLines = order.items
    .map(i => `• ${escapeMd(i.name)} x ${i.quantity} (${formatKHR(i.price)})` +
      (i.note ? `\n   📝 ${escapeMd(i.note)}` : ''))
    .join('\n');
  const mapLine = c.lat !== null && c.lng !== null
    ? `🗺️ *Map:* [Open in Google Maps](https://www.google.com/maps?q=${c.lat},${c.lng})\n`
    : '';

  const message =
    `${riskIndicator}🛍️ *NEW ORDER*${order.tg ? ' (Mini App)' : ''} ✅ *PAID via ABA PayWay*\n\n` +
    `👤 *Customer:* ${escapeMd(c.name)}\n` +
    `📞 *Phone:* ${escapeMd(c.phone)}\n` +
    (order.tg?.username ? `💬 *Telegram:* @${escapeMd(order.tg.username)}\n` : '') +
    (c.note ? `📝 *Note:* ${escapeMd(c.note)}\n` : '') +
    `📍 *Location:* ${escapeMd(c.address)}\n` +
    mapLine + '\n' +
    `💰 *Payment:* ${total}\n` +
    `🔐 *Tran ID:* ${order.tran_id}\n` +
    `💳 *Method:* ABA PayWay (Verified)\n` +
    (amountMismatch
      ? `🚨 *AMOUNT MISMATCH:* PayWay reports ${formatKHR(paid)} — check before delivering\n`
      : '') +
    `\n📊 *Customer History (this device):*\n` +
    `   • Orders: ${orders}\n` +
    `   • Cancellations: ${cancellations}\n` +
    (riskWarning ? `   • ${riskWarning}\n` : '') +
    `\n📦 *Order Items:*\n${itemLines}\n\n` +
    `⏰ *Time:* ${phnomPenhTime()}`;

  const ownerResult = await sendTelegram(BOT_TOKEN, CHAT_ID, message);
  if (!ownerResult.ok) return { ok: false, error: ownerResult.description || 'Telegram send failed' };

  // Best-effort receipt to a verified Mini App customer
  if (order.tg?.id) {
    const r = RECEIPT_TEXT[order.lang] || RECEIPT_TEXT.en;
    const receiptItems = order.items
      .map(i => `  • ${escapeMd(i.name)} x${i.quantity} — ${formatKHR(i.price)}` +
        (i.note ? `\n     📝 ${escapeMd(i.note)}` : ''))
      .join('\n');
    const receipt =
      `🧳 *Sambo Store — Invoice*\n────────────────────\n\n` +
      `👤 *Customer:* ${escapeMd(c.name)}\n` +
      `📞 *Phone:* ${escapeMd(c.phone)}\n` +
      `📍 *Address:* ${escapeMd(c.address)}\n\n` +
      `📦 *${r.items}:*\n${receiptItems}\n\n` +
      `💰 *${r.total}:* ${total}\n` +
      `✅ *Status:* Paid via ABA PayWay\n` +
      `🔐 *Tran ID:* ${order.tran_id}\n` +
      `📅 *Date:* ${phnomPenhTime()}\n\n` +
      `────────────────────\n` +
      r.note;
    try {
      await sendTelegram(BOT_TOKEN, order.tg.id, receipt);
    } catch (_) { /* receipt delivery is best-effort */ }
  }

  return { ok: true, tran_id: order.tran_id };
}

// ===== MAIN HANDLER =====
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors   = getCorsHeaders(origin, env);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, cors);
    }

    // Enforce request body size limit
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_CHARS) {
      return jsonResponse({ error: 'Request too large' }, 413, cors);
    }

    const url = new URL(request.url);

    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_CHARS) {
        return jsonResponse({ error: 'Request too large' }, 413, cors);
      }

      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400, cors);
      }

      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return jsonResponse({ error: 'Invalid request body' }, 400, cors);
      }

      if (url.pathname === '/api/purchase') {
        return jsonResponse(await createPayment(body, env), 200, cors);
      }
      if (url.pathname === '/api/check') {
        return jsonResponse(await checkPayment(body, env), 200, cors);
      }
      if (url.pathname === '/api/order') {
        return jsonResponse(await submitOrder(body, env), 200, cors);
      }
    } catch (err) {
      // Don't leak internal error details to the client
      console.error('Worker error:', err.message);
      return jsonResponse({ error: 'Internal server error' }, 500, cors);
    }

    return jsonResponse({ error: 'Not found' }, 404, cors);
  }
};
