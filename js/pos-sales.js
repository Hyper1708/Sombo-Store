// Today's sales (reprint, cancel) for the cashier, and the day records for the owner.

let todaySales = [];   // from the Worker
let openSale = null;   // the sale shown in the sale dialog

const PAYMENT_LABEL = { cash: 'Cash', aba: 'ABA' };

/** A sale still on this tablet, shaped like one from the Worker. */
const pendingSale = (entry) => ({ ...withTotals(entry.sale), pending: true, refused: entry.error });

const saleState = (sale) => {
    if (sale.refused) return ['bad', 'Not accepted'];
    if (sale.pending) return ['waiting', 'Waiting to upload'];
    if (sale.status === 'cancelled') return ['bad', 'Cancelled'];
    return ['', ''];
};

const saleRowHtml = (sale) => {
    const [cls, label] = saleState(sale);
    return `
        <button type="button" class="sale-row ${sale.status === 'cancelled' ? 'cancelled' : ''}" data-id="${escapeHtml(sale.id)}">
            <span>${shopTime(sale.createdAt, false)}</span>
            <span class="muted">No. ${escapeHtml(sale.code)}</span>
            <span>${PAYMENT_LABEL[sale.payment] || ''}</span>
            <span class="sale-total">${money(sale.total)}</span>
            <span class="tag ${cls}">${label}</span>
        </button>
    `;
};

// ===== Today's sales (cashier) =====

const renderTodaySales = (message = '') => {
    const today = shopDay();
    const pending = outbox.map(pendingSale).filter(s => s.refused || shopDay(s.createdAt) === today);
    const pendingIds = new Set(pending.map(s => s.id));
    const sales = [...pending, ...todaySales.filter(s => !pendingIds.has(s.id))]
        .sort((a, b) => b.createdAt - a.createdAt);
    document.getElementById('sales-list').innerHTML =
        (message ? `<p class="warning">${escapeHtml(message)}</p>` : '') +
        (sales.length ? sales.map(saleRowHtml).join('') : '<p class="muted pad">No sales yet today.</p>');
    return sales;
};

let shownSales = [];

const loadTodaySales = async () => {
    shownSales = renderTodaySales('Loading…');
    try {
        todaySales = (await cashierCall('today')).sales;
        shownSales = renderTodaySales();
    } catch (err) {
        shownSales = renderTodaySales(`Could not load from the server: ${errorText(err)} Showing sales on this tablet only.`);
    }
};

document.getElementById('btn-today').addEventListener('click', () => {
    openDialog('sales-dialog');
    loadTodaySales();
});

document.getElementById('sales-list').addEventListener('click', (e) => {
    const row = e.target.closest('.sale-row');
    const sale = row && shownSales.find(s => s.id === row.dataset.id);
    if (sale) showSale(sale);
});

const showSale = (sale) => {
    openSale = sale;
    document.getElementById('sale-receipt').innerHTML = receiptHtml(sale);
    const notes = [];
    if (sale.refused) notes.push(`The server did not accept this sale (${sale.refused}).`);
    else if (sale.pending) notes.push('Saved on this tablet, waiting to upload.');
    if (sale.status === 'cancelled') notes.push(`Cancelled at ${shopTime(sale.cancelledAt, false)}: ${sale.cancelReason || 'no reason given'}`);
    document.getElementById('sale-note').textContent = notes.join(' ');
    document.getElementById('sale-cancel').hidden =
        sale.pending || sale.status === 'cancelled' || sale.day !== shopDay();
    document.getElementById('sale-remove').hidden = !sale.refused;
    openDialog('sale-dialog');
};

document.getElementById('sale-print').addEventListener('click', () => {
    if (openSale) printReceipt(openSale);
});

// A sale the server refused stays on the tablet until someone removes it on purpose
document.getElementById('sale-remove').addEventListener('click', () => {
    if (!openSale || !confirm('Remove this sale from the tablet? It is not in the records.')) return;
    removeFromOutbox(openSale.id);
    closeDialog('sale-dialog');
    renderTodaySales();
});

// ===== Cancel a sale =====

document.getElementById('sale-cancel').addEventListener('click', () => {
    if (!openSale) return;
    document.getElementById('cancel-form').reset();
    document.getElementById('cancel-code').textContent = `No. ${openSale.code} · ${money(openSale.total)}`;
    document.getElementById('cancel-error').textContent = '';
    openDialog('cancel-dialog');
    document.getElementById('cancel-reason').focus();
});

document.getElementById('cancel-form').addEventListener('submit', async (e) => {
    e.preventDefault(); // stay open until the server answers
    const button = document.getElementById('cancel-submit');
    if (!openSale || button.disabled) return;
    button.disabled = true;
    try {
        const { sale } = await cashierCall('cancel', {
            id: openSale.id,
            reason: document.getElementById('cancel-reason').value.trim()
        });
        todaySales = todaySales.map(s => (s.id === sale.id ? sale : s));
        closeDialog('cancel-dialog');
        closeDialog('sale-dialog');
        shownSales = renderTodaySales();
        showToast(`Sale No. ${sale.code} cancelled`);
    } catch (err) {
        document.getElementById('cancel-error').textContent = errorText(err);
    } finally {
        button.disabled = false;
    }
});

// ===== Records (owner) =====

let recordSales = [];
let recordSummary = null;

document.getElementById('btn-records').addEventListener('click', () => {
    if (ownerLoggedIn()) return openRecords();
    document.getElementById('owner-form').reset();
    document.getElementById('owner-error').textContent = '';
    openDialog('owner-dialog');
    document.getElementById('owner-password').focus();
});

document.getElementById('owner-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await ownerLogin(document.getElementById('owner-password').value);
        closeDialog('owner-dialog');
        openRecords();
    } catch (err) {
        document.getElementById('owner-error').textContent = errorText(err);
    }
});

const openRecords = () => {
    const dayInput = document.getElementById('records-day');
    if (!dayInput.value) dayInput.value = shopDay();
    const opening = saved.get('pos-opening-cash', 0);
    document.getElementById('records-start').value = opening ? plainNumber(opening) : '';
    openDialog('records-dialog');
    loadRecords();
};

const loadRecords = async () => {
    const day = document.getElementById('records-day').value || shopDay();
    document.getElementById('records-summary').innerHTML = '<p class="muted">Loading…</p>';
    document.getElementById('records-list').innerHTML = '';
    try {
        const data = await ownerCall('report', { day });
        recordSales = data.sales;
        recordSummary = data.summary;
        renderRecords(day);
    } catch (err) {
        document.getElementById('records-summary').innerHTML = `<p class="error">${escapeHtml(errorText(err))}</p>`;
        if (err.code === 'login') {
            closeDialog('records-dialog');
            showToast('Type the owner password again');
        }
    }
};

const tile = (label, value, cls = '') => `<div class="tile ${cls}"><span>${label}</span><strong>${value}</strong></div>`;

const renderRecords = (day) => {
    const s = recordSummary;
    document.getElementById('records-summary').innerHTML =
        tile('Total sales', money(s.total), 'main') +
        tile('Cash', money(s.cash)) +
        tile('ABA', money(s.aba)) +
        tile('Number of sales', plainNumber(s.count)) +
        tile('Discounts given', money(s.discounts)) +
        tile('Cancelled', `${plainNumber(s.cancelledCount)} · ${money(s.cancelledTotal)}`, s.cancelledCount ? 'warn' : '');

    const waiting = outbox.filter(e => shopDay(e.sale.createdAt) === day).length;
    const warning = document.getElementById('records-warning');
    warning.hidden = !waiting;
    warning.textContent = `${waiting} sale${waiting > 1 ? 's are' : ' is'} still on this tablet, waiting to upload, and not counted here yet.`;

    document.getElementById('records-list').innerHTML = recordSales.length
        ? [...recordSales].reverse().map(recordHtml).join('')
        : '<p class="muted pad">No sales on this day.</p>';
    renderCashCheck();
};

const recordHtml = (sale) => {
    const items = sale.items.map(item => {
        const changed = item.listPrice != null && item.price !== item.listPrice;
        return `<li>${escapeHtml(item.name)}${item.productId ? ` <span class="muted">#${escapeHtml(item.productId)}</span>` : ''}
            · ${plainNumber(item.qty)} × ${money(item.price)}
            ${changed ? `<span class="tag warn">sheet ${money(item.listPrice)}</span>` : ''}
            ${item.listPrice == null ? '<span class="tag">typed</span>' : ''}</li>`;
    }).join('');
    return `
        <div class="record ${sale.status === 'cancelled' ? 'cancelled' : ''}">
            <div class="record-head">
                <span>${shopTime(sale.createdAt, false)}</span>
                <span class="muted">No. ${escapeHtml(sale.code)}</span>
                <span>${PAYMENT_LABEL[sale.payment] || ''}</span>
                <strong>${money(sale.total)}</strong>
                ${sale.status === 'cancelled' ? '<span class="tag bad">Cancelled</span>' : ''}
            </div>
            <ul>${items}</ul>
            ${sale.discount ? `<p class="muted">Bill discount ${money(sale.discount)}</p>` : ''}
            ${sale.status === 'cancelled' ? `<p class="muted">Cancelled at ${shopTime(sale.cancelledAt, false)}: ${escapeHtml(sale.cancelReason || 'no reason given')}</p>` : ''}
        </div>
    `;
};

// Cash in the drawer should be: cash at opening + cash sales (cancelled sales left out)
const renderCashCheck = () => {
    const el = document.getElementById('records-check');
    if (!recordSummary) return;
    const startInput = document.getElementById('records-start');
    const countedInput = document.getElementById('records-counted');
    const expected = digitsOf(startInput.value) + recordSummary.cash;
    let result = `<p>Should be in the drawer: <strong>${money(expected)}</strong></p>`;
    if (countedInput.value.trim()) {
        const diff = digitsOf(countedInput.value) - expected;
        result += diff === 0
            ? '<p class="change good">✓ Cash matches</p>'
            : diff < 0
                ? `<p class="change bad">Missing <strong>${money(-diff)}</strong></p>`
                : `<p class="change warn">Extra <strong>${money(diff)}</strong></p>`;
    }
    el.innerHTML = result;
};

document.getElementById('records-day').addEventListener('change', loadRecords);
document.getElementById('records-start').addEventListener('input', () => {
    saved.set('pos-opening-cash', digitsOf(document.getElementById('records-start').value));
    renderCashCheck();
});
document.getElementById('records-counted').addEventListener('input', renderCashCheck);
document.querySelectorAll('#records-start, #records-counted').forEach(input => {
    input.addEventListener('focusout', () => {
        if (input.value.trim()) input.value = plainNumber(digitsOf(input.value));
    });
});
