// Checking and adding up register sales. The tablet sends what was sold; the totals,
// change and discounts are always worked out here, never taken from the tablet.

const DAY_MS = 24 * 60 * 60 * 1000;
const PHNOM_PENH_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 all year (no daylight saving)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_LINES = 200;
const MAX_QTY = 100_000;
const MAX_PRICE = 100_000_000; // riel, per item
const MAX_CASH = 1_000_000_000_000; // the tablet accepts at most 12 digits

/** "2026-11-26": the shop's calendar day (Phnom Penh time) for a moment in ms. */
export const shopDay = (ms) => new Date(ms + PHNOM_PENH_OFFSET_MS).toISOString().slice(0, 10);

export const isDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Short code printed on the receipt; the tablet derives the same one from the sale id. */
export const saleCode = (id) => id.slice(0, 6).toUpperCase();

const whole = (value, min, max) => (Number.isInteger(value) && value >= min && value <= max ? value : null);

/** One line of plain text: control characters become spaces, then trimmed and capped. */
export const cleanText = (value, max) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '';

/**
 * Check a sale sent by the tablet and work out its totals.
 * Returns { sale } ready to store, or { error } with a short code.
 */
export function readSale(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return { error: 'bad_sale' };

  const id = typeof raw.id === 'string' ? raw.id.toLowerCase() : '';
  if (!UUID.test(id)) return { error: 'bad_id' };

  const payment = raw.payment;
  if (payment !== 'cash' && payment !== 'aba') return { error: 'bad_payment' };

  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > MAX_LINES) {
    return { error: 'bad_items' };
  }
  const items = [];
  for (const line of raw.items) {
    const name = cleanText(line?.name, 100);
    const qty = whole(line?.qty, 1, MAX_QTY);
    const price = whole(line?.price, 0, MAX_PRICE);
    // The sheet price at the time of sale (null for an item typed by hand)
    const hasListPrice = line?.listPrice != null;
    const listPrice = hasListPrice ? whole(line.listPrice, 0, MAX_PRICE) : null;
    if (!name || qty === null || price === null || (hasListPrice && listPrice === null)) {
      return { error: 'bad_item' };
    }
    const productId = cleanText(line?.productId == null ? '' : String(line.productId), 20);
    items.push({ productId, name, qty, price, listPrice });
  }

  const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0);
  const discount = raw.discount == null ? 0 : whole(raw.discount, 0, subtotal);
  if (discount === null) return { error: 'bad_discount' };
  const total = subtotal - discount;

  let cashReceived = null;
  let change = null;
  if (payment === 'cash') {
    cashReceived = whole(raw.cashReceived, total, Math.max(total, MAX_CASH));
    if (cashReceived === null) return { error: 'bad_cash' };
    change = cashReceived - total;
  }

  // When the sale happened on the tablet (it may upload later). A clock that is far off
  // is not trusted; the upload time is used instead.
  const t = raw.createdAt;
  const createdAt = Number.isInteger(t) && t > now - 30 * DAY_MS && t < now + 10 * 60 * 1000 ? t : now;

  return {
    sale: {
      id,
      code: saleCode(id),
      day: shopDay(createdAt),
      createdAt,
      savedAt: now,
      payment,
      items,
      subtotal,
      discount,
      total,
      cashReceived,
      change,
      status: 'done',
      cancelledAt: null,
      cancelReason: ''
    }
  };
}

/** Money taken off sheet prices on one sale: lowered item prices plus the bill discount. */
export function discountGiven(sale) {
  const cuts = sale.items.reduce(
    (sum, i) => sum + (i.listPrice != null && i.price < i.listPrice ? (i.listPrice - i.price) * i.qty : 0), 0
  );
  return cuts + sale.discount;
}

/** Day totals. Cancelled sales are counted on their own and left out of every other total. */
export function summarize(sales) {
  const s = { count: 0, total: 0, cash: 0, aba: 0, discounts: 0, cancelledCount: 0, cancelledTotal: 0 };
  for (const sale of sales) {
    if (sale.status === 'cancelled') {
      s.cancelledCount += 1;
      s.cancelledTotal += sale.total;
      continue;
    }
    s.count += 1;
    s.total += sale.total;
    s[sale.payment] += sale.total;
    s.discounts += discountGiven(sale);
  }
  return s;
}
