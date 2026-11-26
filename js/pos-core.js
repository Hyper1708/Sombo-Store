// Shop register: helpers, saved state, the Worker API, logins and the sales outbox.

// ===== Helpers =====

// Always "1,234,567៛" (the tablet's language could otherwise change the separators)
const money = (amount) => `${Math.round(amount).toLocaleString('en-US')}៛`;
const plainNumber = (amount) => Math.round(amount).toLocaleString('en-US');

// What the cashier typed → a whole number of riel ("45,000" → 45000, "" → 0)
const digitsOf = (value) => Number(String(value ?? '').replace(/[^\d]/g, '').slice(0, 12)) || 0;

// The Worker's limits (payway-worker/src/pos/sales.js); staying inside them means a sale is never refused
const MAX_QTY = 100000;
const MAX_PRICE = 100000000;
const MAX_LINES = 200;

// The shop's calendar day in Phnom Penh, "2026-11-26" (same rule as the Worker)
const shopDay = (ms = Date.now()) => new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

// "26/11/2026 14:32" (or "14:32") in Phnom Penh time
const shopTime = (ms, withDate = true) => new Date(ms).toLocaleString('en-GB', {
    timeZone: 'Asia/Phnom_Penh',
    ...(withDate ? { day: '2-digit', month: '2-digit', year: 'numeric' } : {}),
    hour: '2-digit', minute: '2-digit'
}).replace(',', '');

// Short sale number on the receipt (the Worker derives the same one)
const saleCode = (id) => id.slice(0, 6).toUpperCase();

const openDialog = (id) => {
    const dialog = document.getElementById(id);
    if (!dialog.open) dialog.showModal();
    return dialog;
};
const closeDialog = (id) => {
    const dialog = document.getElementById(id);
    if (dialog.open) dialog.close();
};

// ===== Saved on the tablet =====
// localStorage can be missing or full (private browsing); the register still runs without it.
const saved = {
    get(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value == null ? fallback : JSON.parse(value);
        } catch { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch { /* nothing to remove */ }
    }
};

// ===== Worker API =====

const POS_API = `${PAYWAY_WORKER_URL}/api/pos`;

class PosError extends Error {
    constructor(code, status) {
        super(code);
        this.code = code;
        this.status = status;
    }
}

const ERROR_TEXT = {
    offline: 'No internet connection. Try again.',
    wrong_password: 'Wrong password.',
    too_many_tries: 'Too many wrong tries. Wait 15 minutes, then try again.',
    not_set_up: 'The register is not set up on the server yet (passwords need at least 8 characters).',
    login: 'Please log in again.',
    not_today: "Only today's sales can be cancelled.",
    already_cancelled: 'This sale is already cancelled.',
    not_found: 'Sale not found.'
};
const errorText = (err) => ERROR_TEXT[err?.code] || `Something went wrong (${err?.code || 'error'}).`;

const callPos = async (path, body) => {
    let response;
    try {
        response = await fetch(`${POS_API}/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch {
        throw new PosError('offline', 0);
    }
    let data = null;
    try { data = await response.json(); } catch { /* not JSON */ }
    if (!data || !data.ok) throw new PosError(data?.error || `http_${response.status}`, response.status);
    return data;
};

// ===== Logins =====

// Cashier: kept on the tablet for 30 days
let cashierSession = saved.get('pos-session', null);
const cashierLoggedIn = () => !!cashierSession && cashierSession.expiresAt > Date.now();

const cashierLogin = async (password) => {
    const data = await callPos('login', { role: 'cashier', password });
    cashierSession = { token: data.token, expiresAt: data.expiresAt };
    saved.set('pos-session', cashierSession);
};

const cashierLogout = () => {
    cashierSession = null;
    saved.remove('pos-session');
};

/** A call that needs the cashier login. A refused login shows the login screen. */
const cashierCall = async (path, body = {}) => {
    if (!cashierLoggedIn()) {
        cashierLogout();
        showLoginScreen(ERROR_TEXT.login);
        throw new PosError('login', 401);
    }
    try {
        return await callPos(path, { ...body, token: cashierSession.token });
    } catch (err) {
        if (err.code === 'login') {
            cashierLogout();
            showLoginScreen(ERROR_TEXT.login);
        }
        throw err;
    }
};

// Owner: kept in memory only and for 30 minutes, so the records close with the page
let ownerSession = null;
const ownerLoggedIn = () => !!ownerSession && ownerSession.expiresAt > Date.now();

const ownerLogin = async (password) => {
    const data = await callPos('login', { role: 'owner', password });
    ownerSession = { token: data.token, expiresAt: data.expiresAt };
};

const ownerCall = async (path, body = {}) => {
    if (!ownerLoggedIn()) throw new PosError('login', 401);
    try {
        return await callPos(path, { ...body, token: ownerSession.token });
    } catch (err) {
        if (err.code === 'login') ownerSession = null;
        throw err;
    }
};

// ===== Sales =====

/** The totals of a sale made on this tablet, worked out the same way as the Worker does. */
const withTotals = (sale) => {
    const subtotal = sale.items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const discount = Math.min(sale.discount || 0, subtotal);
    const total = subtotal - discount;
    return {
        ...sale,
        code: saleCode(sale.id),
        subtotal,
        discount,
        total,
        change: sale.payment === 'cash' ? sale.cashReceived - total : null,
        status: sale.status || 'done'
    };
};

// ===== Outbox =====
// Every sale is put here first and leaves only once the Worker has stored it, so a dropped
// connection never loses a sale. Sending the same sale twice is safe: the Worker keeps one.

let outbox = saved.get('pos-outbox', []);
let outboxFlush = null;

const saveOutbox = () => {
    if (!saved.set('pos-outbox', outbox)) showToast('Tablet storage is full: sales may be lost if the page closes', 5000);
};

const queueSale = (sale) => {
    outbox.push({ sale, error: '' });
    saveOutbox();
    outboxChanged();
    flushOutbox();
};

const uploadOutbox = async () => {
    for (const entry of [...outbox]) {
        if (entry.error) continue; // refused by the Worker: kept for the owner to look at
        try {
            await cashierCall('sale', { sale: entry.sale });
            outbox = outbox.filter(e => e.sale.id !== entry.sale.id);
            saveOutbox();
            outboxChanged();
        } catch (err) {
            // The Worker looked at it and said no (or it is too big): retrying won't help
            if (err.status === 400 || err.status === 413) {
                entry.error = err.code;
                saveOutbox();
                continue;
            }
            break; // offline or logged out: try again later
        }
    }
};

/** Upload waiting sales, one run at a time. */
const flushOutbox = () => {
    if (!outboxFlush) {
        // .finally runs after this assignment even when there is nothing to upload,
        // so the run is never left marked as still going
        outboxFlush = uploadOutbox().finally(() => {
            outboxFlush = null;
            outboxChanged();
        });
    }
    return outboxFlush;
};

const removeFromOutbox = (id) => {
    outbox = outbox.filter(e => e.sale.id !== id);
    saveOutbox();
    outboxChanged();
};

const renderSyncStatus = () => {
    const el = document.getElementById('sync-status');
    const refused = outbox.filter(e => e.error).length;
    const waiting = outbox.length - refused;
    el.className = 'sync ' + (refused ? 'bad' : waiting ? 'waiting' : 'good');
    el.textContent = refused
        ? `${refused} sale${refused > 1 ? 's' : ''} not accepted`
        : waiting
            ? `${waiting} sale${waiting > 1 ? 's' : ''} waiting to upload`
            : 'All sales saved';
};
