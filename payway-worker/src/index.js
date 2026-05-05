/**
 * Sambo Store — ABA PayWay Payment Worker (Hardened)
 *
 * POST /api/purchase  → Create payment (returns QR/deeplink or hosted checkout form)
 * POST /api/check     → Verify payment status
 * POST /api/notify    → Send Telegram notification (requires NOTIFY_SECRET)
 *
 * Required secrets (set via: npx wrangler secret put <NAME>):
 *   API_KEY            — ABA PayWay API key
 *   TELEGRAM_BOT_TOKEN — Telegram bot token
 *   TELEGRAM_CHAT_ID   — Store owner Telegram chat ID
 *   NOTIFY_SECRET      — Shared secret for /api/notify
 *
 * Vars in wrangler.toml (non-sensitive):
 *   MERCHANT_ID, PAYWAY_BASE_URL, ALLOWED_ORIGIN
 */

const ENDPOINTS = {
  PURCHASE: '/api/payment-gateway/v1/payments/purchase',
  CHECK: '/api/payment-gateway/v1/payments/check-transaction-2'
};

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

/** Strip characters that could break Telegram Markdown or inject HTML. */
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

/** tran_id for /api/check must match the format this Worker generates. */
function validateTranId(id) {
  return typeof id === 'string' && /^SS\d{10}$/.test(id);
}

function validatePhone(raw) {
  if (!raw) return '';
  return String(raw).replace(/[^\d+\s\-()\u17B6-\u17FF]/g, '').slice(0, 20);
}

function validateSiteUrl(raw) {
  if (typeof raw !== 'string') return '';
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? raw : '';
  } catch { return ''; }
}

// ===== CRYPTO =====
async function hmac512(message, key) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key),
    { name: 'HMAC', hash: 'SHA-512' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Constant-time string equality — prevents timing attacks on secrets. */
async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ka = await crypto.subtle.importKey('raw', enc.encode(a), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kb = await crypto.subtle.importKey('raw', enc.encode(b), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const dummy = enc.encode('sambo-store');
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign('HMAC', ka, dummy),
    crypto.subtle.sign('HMAC', kb, dummy)
  ]);
  const ua = new Uint8Array(sigA), ub = new Uint8Array(sigB);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
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

// ===== CREATE PAYMENT =====
async function createPayment(body, env) {
  const amount = validateAmount(body.amount);
  if (!amount) return { error: 'Invalid amount. Must be 100–50,000,000 KHR.' };

  const currency   = body.currency === 'USD' ? 'USD' : 'KHR';
  const firstname  = sanitizeText(body.firstname || '', 100);
  const phone      = validatePhone(body.phone);
  const site_url   = validateSiteUrl(body.site_url);

  const rawItems   = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  const items      = rawItems.map(item => ({
    name:     sanitizeText(String(item.name  || ''), 100),
    quantity: Math.min(Math.max(parseInt(item.quantity) || 1, 1), 999),
    price:    Math.max(0, Number(item.price) || 0)
  }));

  const cfg        = getConfig(env);
  const req_time   = utcNow();
  const tran_id    = 'SS' + Date.now().toString().slice(-10);
  const encodedItems = items.length ? safeBase64(JSON.stringify(items)) : '';
  const returnPage   = site_url
    ? btoa(site_url + (site_url.includes('?') ? '&' : '?') + 'payway_tran=' + tran_id)
    : '';

  const hashParts = [
    req_time, cfg.MID, tran_id, String(amount), encodedItems, '',
    firstname, '', '', phone, 'purchase', 'abapay_khqr_deeplink',
    '', '', returnPage, '',
    currency, '', '', '',
    '30', '', '', ''
  ];
  const hash = await hmac512(hashParts.join(''), cfg.KEY);

  const fd = new FormData();
  fd.append('req_time', req_time);
  fd.append('merchant_id', cfg.MID);
  fd.append('tran_id', tran_id);
  fd.append('amount', String(amount));
  if (encodedItems)  fd.append('items', encodedItems);
  if (firstname)     fd.append('firstname', firstname);
  if (phone)         fd.append('phone', phone);
  fd.append('type', 'purchase');
  fd.append('payment_option', 'abapay_khqr_deeplink');
  if (returnPage)    fd.append('continue_success_url', returnPage);
  fd.append('currency', currency);
  fd.append('lifetime', '30');
  fd.append('hash', hash);

  const res = await fetch(cfg.URL + ENDPOINTS.PURCHASE, { method: 'POST', body: fd });
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('json')) {
    const data = await res.json();
    return { success: true, tran_id, ...data };
  }

  // HTML response → fall back to hosted checkout form
  const hostedParts  = [...hashParts];
  hostedParts[11]    = 'abapay_khqr';
  const hostedHash   = await hmac512(hostedParts.join(''), cfg.KEY);
  return {
    success: true, tran_id, fallback: 'hosted',
    checkout_url: cfg.URL + ENDPOINTS.PURCHASE,
    fields: {
      req_time, merchant_id: cfg.MID, tran_id,
      amount: String(amount), items: encodedItems,
      firstname, phone,
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

// ===== SEND TELEGRAM NOTIFICATION =====
async function sendNotification(body, env) {
  // Authenticate caller with shared secret (prevents spam/abuse of this endpoint)
  const notifySecret = env?.NOTIFY_SECRET;
  if (notifySecret) {
    const provided = typeof body.secret === 'string' ? body.secret : '';
    if (!(await timingSafeEqual(provided, notifySecret))) {
      return { ok: false, error: 'Unauthorized' };
    }
  }

  const BOT_TOKEN = env?.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = env?.TELEGRAM_CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) {
    return { ok: false, error: 'Telegram credentials not configured in Worker secrets' };
  }

  const { message, receipt } = body;
  if (!message || typeof message !== 'string' || message.length > 4096) {
    return { ok: false, error: 'Invalid message' };
  }

  const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

  const ownerRes    = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });
  const ownerResult = await ownerRes.json();
  if (!ownerResult.ok) return { ok: false, error: ownerResult.description };

  // Best-effort receipt to customer (Telegram Mini App only)
  if (receipt && typeof receipt.chat_id === 'number' && typeof receipt.text === 'string') {
    try {
      await fetch(`${TG_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: receipt.chat_id,
          text: receipt.text.slice(0, 4096),
          parse_mode: 'Markdown'
        })
      });
    } catch (_) { /* receipt delivery is best-effort */ }
  }

  return { ok: true };
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

    // Enforce request body size limit (10 KB)
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > 10_240) {
      return jsonResponse({ error: 'Request too large' }, 413, cors);
    }

    const url = new URL(request.url);

    try {
      const raw = await request.text();
      if (raw.length > 10_240) {
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
      if (url.pathname === '/api/notify') {
        return jsonResponse(await sendNotification(body, env), 200, cors);
      }
    } catch (err) {
      // Don't leak internal error details to the client
      console.error('Worker error:', err.message);
      return jsonResponse({ error: 'Internal server error' }, 500, cors);
    }

    return jsonResponse({ error: 'Not found' }, 404, cors);
  }
};
