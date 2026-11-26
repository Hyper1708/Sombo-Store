// Shop register endpoints (pos.html). All are POST with a JSON body.
//
//   /api/pos/login   { role: 'cashier' | 'owner', password }  → { token, expiresAt }
//   /api/pos/sale    { token, sale }                           → { sale }   (cashier)
//   /api/pos/cancel  { token, id, reason }                     → { sale }   (cashier, today's sales only)
//   /api/pos/today   { token }                                 → { day, sales }   (cashier)
//   /api/pos/report  { token, day: 'YYYY-MM-DD' }              → { day, sales, summary }   (owner)
//
// Errors come back as { ok: false, error: '<code>' }; the page turns codes into words.

import { passwordFor, issueToken, checkToken } from './auth.js';
import { readSale, summarize, shopDay, isDay, cleanText } from './sales.js';

const ok = (data) => ({ status: 200, data: { ok: true, ...data } });
const fail = (status, error) => ({ status, data: { ok: false, error } });

export async function handlePos(pathname, body, request, env) {
  if (!env.POS) return fail(503, 'not_set_up');
  const ledger = env.POS.get(env.POS.idFromName('shop'));

  if (pathname === '/api/pos/login') {
    const role = body.role === 'owner' ? 'owner' : 'cashier';
    if (!passwordFor(role, env)) return fail(503, 'not_set_up');
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const result = await ledger.tryLogin(ip, role, typeof body.password === 'string' ? body.password : '');
    if (result === 'blocked') return fail(429, 'too_many_tries');
    if (result !== 'ok') return fail(401, 'wrong_password');
    return ok({ role, ...(await issueToken(role, env)) });
  }

  const role = pathname === '/api/pos/report' ? 'owner' : 'cashier';
  if (!(await checkToken(body.token, role, env))) return fail(401, 'login');

  if (pathname === '/api/pos/sale') {
    const { sale, error } = readSale(body.sale);
    if (error) return fail(400, error);
    return ok({ sale: await ledger.saveSale(sale) });
  }

  if (pathname === '/api/pos/cancel') {
    const id = typeof body.id === 'string' ? body.id.toLowerCase() : '';
    const result = await ledger.cancelSale(id, cleanText(body.reason, 200), shopDay(Date.now()));
    return result.error ? fail(400, result.error) : ok({ sale: result.sale });
  }

  if (pathname === '/api/pos/today') {
    const day = shopDay(Date.now());
    return ok({ day, sales: await ledger.salesForDay(day) });
  }

  if (pathname === '/api/pos/report') {
    const day = isDay(body.day) ? body.day : shopDay(Date.now());
    const sales = await ledger.salesForDay(day);
    return ok({ day, sales, summary: summarize(sales) });
  }

  return fail(404, 'not_found');
}
