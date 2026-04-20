/**
 * Sambo Store — ABA PayWay Payment Worker
 *
 * POST /api/purchase  → Create payment (returns QR/deeplink or hosted checkout form)
 * POST /api/check     → Verify payment status
 *
 * Sandbox: https://checkout-sandbox.payway.com.kh
 * Production: https://checkout.payway.com.kh
 */

// ===== SANDBOX CREDENTIALS (use env vars / secrets in production) =====
const DEFAULTS = {
  MERCHANT_ID: 'ec475039',
  API_KEY: '31eaf10bed91e441dff6c359b102793833b72bab',
  BASE_URL: 'https://checkout-sandbox.payway.com.kh'
};

const ENDPOINTS = {
  PURCHASE: '/api/payment-gateway/v1/payments/purchase',
  CHECK: '/api/payment-gateway/v1/payments/check-transaction-2'
};

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

function utcNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

// ===== HELPERS =====
function getConfig(env) {
  return {
    MID: env?.MERCHANT_ID || DEFAULTS.MERCHANT_ID,
    KEY: env?.API_KEY || DEFAULTS.API_KEY,
    URL: env?.PAYWAY_BASE_URL || DEFAULTS.BASE_URL
  };
}

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

function safeBase64(str) {
  // Handle UTF-8 strings (e.g. Khmer text)
  return btoa(unescape(encodeURIComponent(str)));
}

// ===== CREATE PAYMENT =====
async function createPayment(body, env) {
  const {
    amount,
    currency = 'KHR',
    items = [],
    firstname = '',
    lastname = '',
    phone = '',
    email = '',
    site_url = ''
  } = body;

  if (!amount || amount <= 0) {
    return { error: 'Invalid amount' };
  }

  const cfg = getConfig(env);
  const req_time = utcNow();
  const tran_id = 'SS' + Date.now().toString().slice(-10);

  // Base64-encode items array for PayWay
  const encodedItems = items.length ? safeBase64(JSON.stringify(items)) : '';

  // Build continue_success_url for hosted checkout fallback
  const returnPage = site_url
    ? btoa(site_url + (site_url.includes('?') ? '&' : '?') + 'payway_tran=' + tran_id)
    : '';

  // ---- Hash computation ----
  // All 24 params concatenated in EXACT API order:
  // req_time, merchant_id, tran_id, amount, items, shipping,
  // firstname, lastname, email, phone, type, payment_option,
  // return_url, cancel_url, continue_success_url, return_deeplink,
  // currency, custom_fields, return_params, payout,
  // lifetime, additional_params, google_pay_token, skip_success_page
  const hashParts = [
    req_time, cfg.MID, tran_id, String(amount), encodedItems, /*shipping*/'',
    firstname, lastname, email, phone, 'purchase', 'abapay_khqr_deeplink',
    /*return_url*/'', /*cancel_url*/'', returnPage, /*return_deeplink*/'',
    currency, /*custom_fields*/'', /*return_params*/'', /*payout*/'',
    '30', /*additional_params*/'', /*google_pay_token*/'', /*skip_success_page*/''
  ];
  const hash = await hmac512(hashParts.join(''), cfg.KEY);

  // ---- Build multipart form for PayWay ----
  const fd = new FormData();
  fd.append('req_time', req_time);
  fd.append('merchant_id', cfg.MID);
  fd.append('tran_id', tran_id);
  fd.append('amount', String(amount));
  if (encodedItems) fd.append('items', encodedItems);
  if (firstname) fd.append('firstname', firstname);
  if (lastname) fd.append('lastname', lastname);
  if (phone) fd.append('phone', phone);
  if (email) fd.append('email', email);
  fd.append('type', 'purchase');
  fd.append('payment_option', 'abapay_khqr_deeplink');
  if (returnPage) fd.append('continue_success_url', returnPage);
  fd.append('currency', currency);
  fd.append('lifetime', '30');
  fd.append('hash', hash);

  // ---- Call PayWay Purchase API ----
  const res = await fetch(cfg.URL + ENDPOINTS.PURCHASE, {
    method: 'POST',
    body: fd
  });

  const contentType = res.headers.get('content-type') || '';

  // If JSON → deeplink mode worked (returns qr_string, abapay_deeplink, checkout_qr_url)
  if (contentType.includes('json')) {
    const data = await res.json();
    return { success: true, tran_id, ...data };
  }

  // If HTML → fallback to hosted checkout (browser form submission)
  // Re-hash with abapay_khqr payment option
  const hostedParts = [...hashParts];
  hostedParts[11] = 'abapay_khqr'; // Replace payment_option
  const hostedHash = await hmac512(hostedParts.join(''), cfg.KEY);

  return {
    success: true,
    tran_id,
    fallback: 'hosted',
    checkout_url: cfg.URL + ENDPOINTS.PURCHASE,
    fields: {
      req_time,
      merchant_id: cfg.MID,
      tran_id,
      amount: String(amount),
      items: encodedItems,
      firstname, lastname, phone, email,
      type: 'purchase',
      payment_option: 'abapay_khqr',
      continue_success_url: returnPage,
      currency,
      lifetime: '30',
      hash: hostedHash
    }
  };
}

// ===== CHECK PAYMENT STATUS =====
async function checkPayment(body, env) {
  const { tran_id } = body;
  if (!tran_id) return { error: 'Missing tran_id' };

  const cfg = getConfig(env);
  const req_time = utcNow();

  // Hash for check-transaction: req_time + merchant_id + tran_id
  const hash = await hmac512(req_time + cfg.MID + tran_id, cfg.KEY);

  const res = await fetch(cfg.URL + ENDPOINTS.CHECK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      req_time,
      merchant_id: cfg.MID,
      tran_id,
      hash
    })
  });

  return await res.json();
}

// ===== MAIN HANDLER =====
export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, cors);
    }

    const url = new URL(request.url);

    try {
      const body = await request.json();

      if (url.pathname === '/api/purchase') {
        return jsonResponse(await createPayment(body, env), 200, cors);
      }

      if (url.pathname === '/api/check') {
        return jsonResponse(await checkPayment(body, env), 200, cors);
      }
    } catch (err) {
      return jsonResponse({ error: err.message }, 500, cors);
    }

    return jsonResponse({ error: 'Not found' }, 404, cors);
  }
};
