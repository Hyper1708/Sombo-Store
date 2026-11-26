// Passwords and login tokens for the shop register (pos.html).
//
// Two passwords, both Worker secrets:
//   POS_PASSWORD        opens the register on the tablet (stays logged in for 30 days)
//   POS_OWNER_PASSWORD  opens the sales records (asked again after 30 minutes)
//
// A token is "<role>.<expiry ms>.<signature>", signed with a key made from that role's
// password. Changing a password therefore logs out every device that used the old one.

const enc = new TextEncoder();

export const ROLES = {
  cashier: { secret: 'POS_PASSWORD',       ttlMs: 30 * 24 * 60 * 60 * 1000 },
  owner:   { secret: 'POS_OWNER_PASSWORD', ttlMs: 30 * 60 * 1000 }
};

export const MIN_PASSWORD_LENGTH = 8;

/** The role's password, or '' when it isn't set (or too short to be safe). */
export function passwordFor(role, env) {
  const value = String(env?.[ROLES[role]?.secret] || '');
  return value.length >= MIN_PASSWORD_LENGTH ? value : '';
}

/** Compare a typed password with the real one without leaking how much of it matched. */
export async function samePassword(given, expected) {
  const digest = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s ?? ''))));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function tokenKey(role, password) {
  return crypto.subtle.importKey(
    'raw', enc.encode(`sambo-pos-token-v1:${role}:${password}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

const toHex = (buf) => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');

function fromHex(hex) {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g), h => parseInt(h, 16));
}

export async function issueToken(role, env, now = Date.now()) {
  const password = passwordFor(role, env);
  if (!password) throw new Error(`${ROLES[role].secret} not set`);
  const expiresAt = now + ROLES[role].ttlMs;
  const body = `${role}.${expiresAt}`;
  const sig = await crypto.subtle.sign('HMAC', await tokenKey(role, password), enc.encode(body));
  return { token: `${body}.${toHex(sig)}`, expiresAt };
}

/** True only for an unexpired token of exactly this role, signed with its current password. */
export async function checkToken(token, role, env, now = Date.now()) {
  const password = passwordFor(role, env);
  if (!password || typeof token !== 'string' || token.length > 200) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== role || !/^\d{13}$/.test(parts[1])) return false;
  const expiresAt = Number(parts[1]);
  if (!(expiresAt > now) || expiresAt > now + ROLES[role].ttlMs) return false;
  const sig = fromHex(parts[2]);
  if (!sig) return false;
  return crypto.subtle.verify('HMAC', await tokenKey(role, password), sig, enc.encode(`${parts[0]}.${parts[1]}`));
}
