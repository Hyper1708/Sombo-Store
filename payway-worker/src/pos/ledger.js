// The register's sales book: one Durable Object (SQLite) that keeps every sale from the
// shop tablet. Being a single object means sales, cancels and login tries are handled one
// at a time, in order.

import { DurableObject } from 'cloudflare:workers';
import { ROLES, passwordFor, samePassword } from './auth.js';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_TRIES_PER_WINDOW = 10;

const fromRow = (row) => ({
  id: row.id,
  code: row.code,
  day: row.day,
  createdAt: row.created_at,
  savedAt: row.saved_at,
  payment: row.payment,
  items: JSON.parse(row.items),
  subtotal: row.subtotal,
  discount: row.discount,
  total: row.total,
  cashReceived: row.cash_received,
  change: row.change_given,
  status: row.status,
  cancelledAt: row.cancelled_at,
  cancelReason: row.cancel_reason
});

export class PosLedger extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS sales (
        id            TEXT PRIMARY KEY,
        code          TEXT NOT NULL,
        day           TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        saved_at      INTEGER NOT NULL,
        payment       TEXT NOT NULL,
        items         TEXT NOT NULL,
        subtotal      INTEGER NOT NULL,
        discount      INTEGER NOT NULL,
        total         INTEGER NOT NULL,
        cash_received INTEGER,
        change_given  INTEGER,
        status        TEXT NOT NULL,
        cancelled_at  INTEGER,
        cancel_reason TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS sales_by_day ON sales (day, created_at);
      CREATE TABLE IF NOT EXISTS login_tries (
        ip           TEXT PRIMARY KEY,
        tries        INTEGER NOT NULL,
        window_start INTEGER NOT NULL
      );
    `);
  }

  find(id) {
    const rows = this.sql.exec('SELECT * FROM sales WHERE id = ?', id).toArray();
    return rows.length ? fromRow(rows[0]) : null;
  }

  /**
   * Check a password, at most LOGIN_TRIES_PER_WINDOW tries per address every 15 minutes.
   * The try is counted before the password is compared, so tries sent at the same time
   * can't slip past the limit. A correct password clears the count.
   */
  async tryLogin(ip, role, given) {
    const now = Date.now();
    this.sql.exec('DELETE FROM login_tries WHERE window_start < ?', now - LOGIN_WINDOW_MS);
    const row = this.sql.exec('SELECT tries FROM login_tries WHERE ip = ?', ip).toArray()[0];
    if (row && row.tries >= LOGIN_TRIES_PER_WINDOW) return 'blocked';
    if (row) this.sql.exec('UPDATE login_tries SET tries = tries + 1 WHERE ip = ?', ip);
    else this.sql.exec('INSERT INTO login_tries (ip, tries, window_start) VALUES (?, 1, ?)', ip, now);

    const password = ROLES[role] && passwordFor(role, this.env);
    if (!password || !(await samePassword(given, password))) return 'wrong';
    this.sql.exec('DELETE FROM login_tries WHERE ip = ?', ip);
    return 'ok';
  }

  /** Store a sale. Sending the same sale again (a retry) returns the one already stored. */
  saveSale(sale) {
    const existing = this.find(sale.id);
    if (existing) return existing;
    this.sql.exec(
      `INSERT INTO sales (id, code, day, created_at, saved_at, payment, items, subtotal, discount,
                          total, cash_received, change_given, status, cancelled_at, cancel_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sale.id, sale.code, sale.day, sale.createdAt, sale.savedAt, sale.payment,
      JSON.stringify(sale.items), sale.subtotal, sale.discount, sale.total,
      sale.cashReceived, sale.change, sale.status, sale.cancelledAt, sale.cancelReason
    );
    return this.find(sale.id);
  }

  /** Mark one of today's sales as cancelled. It stays in the book, with the time and reason. */
  cancelSale(id, reason, today) {
    const sale = this.find(id);
    if (!sale) return { error: 'not_found' };
    if (sale.status === 'cancelled') return { error: 'already_cancelled' };
    if (sale.day !== today) return { error: 'not_today' };
    this.sql.exec(
      "UPDATE sales SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?",
      Date.now(), reason, id
    );
    return { sale: this.find(id) };
  }

  salesForDay(day) {
    return this.sql.exec('SELECT * FROM sales WHERE day = ? ORDER BY created_at, id', day).toArray().map(fromRow);
  }
}
