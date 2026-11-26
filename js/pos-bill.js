// The bill being rung up. It is saved on the tablet after every change, so a reload
// or a closed browser doesn't lose it.

let bill = saved.get('pos-bill', null) || { lines: [], discount: 0 };

const saveBill = () => saved.set('pos-bill', bill);

const billSubtotal = () => bill.lines.reduce((sum, line) => sum + line.qty * line.price, 0);
const billDiscount = () => Math.min(bill.discount, billSubtotal());
const billTotal = () => billSubtotal() - billDiscount();

const billIsFull = () => {
    if (bill.lines.length < MAX_LINES) return false;
    showToast(`A bill can have up to ${MAX_LINES} different items. Finish this one first.`, 4000);
    return true;
};

const addToBill = (product) => {
    const same = product.id && bill.lines.find(l => l.productId === product.id);
    if (!same && billIsFull()) return;
    if (same) {
        same.qty = Math.min(same.qty + 1, MAX_QTY);
    } else {
        bill.lines.push({
            key: crypto.randomUUID(),
            productId: product.id,
            name: product.name,
            qty: 1,
            price: product.price ?? 0,
            listPrice: product.price ?? null // the sheet price; null for items typed by hand
        });
    }
    saveBill();
    renderBill();
    const line = same || bill.lines[bill.lines.length - 1];
    const row = document.querySelector(`.line[data-key="${line.key}"]`);
    if (row) {
        row.scrollIntoView({ block: 'nearest' });
        row.classList.add('flash');
        // An item without a sheet price needs its price typed straight away
        if (!line.price) {
            openBill();
            row.querySelector('.price').focus();
        }
    }
    showToast(`${line.name} × ${line.qty}`, 1200);
};

const lineNote = (line) => {
    if (line.listPrice == null) return line.productId ? 'No price in sheet' : 'Typed by hand';
    if (line.price === line.listPrice) return '';
    return `Sheet price ${money(line.listPrice)}`;
};

const lineHtml = (line) => `
    <div class="line${line.price ? '' : ' no-price'}${line.listPrice != null && line.price !== line.listPrice ? ' changed' : ''}" data-key="${line.key}">
        <div class="line-top">
            <span class="line-name">${escapeHtml(line.name)}${line.productId ? ` <small>#${escapeHtml(line.productId)}</small>` : ''}</span>
            <button type="button" class="line-remove" aria-label="Remove ${escapeHtml(line.name)}">×</button>
        </div>
        <div class="line-edit">
            <label>Qty <input class="qty" inputmode="numeric" autocomplete="off" value="${line.qty}"></label>
            <span>×</span>
            <label>Price <input class="price money-input" inputmode="numeric" autocomplete="off" value="${line.price ? plainNumber(line.price) : ''}" placeholder="0"></label>
            <span class="line-total">${money(line.qty * line.price)}</span>
        </div>
        <div class="line-note">${escapeHtml(lineNote(line))}</div>
    </div>
`;

const renderBill = () => {
    document.getElementById('bill-lines').innerHTML = bill.lines.length
        ? bill.lines.map(lineHtml).join('')
        : '<p class="muted pad">Tap a product to add it.</p>';
    const discountInput = document.getElementById('bill-discount');
    if (document.activeElement !== discountInput) discountInput.value = bill.discount ? plainNumber(bill.discount) : '';
    renderBillTotals();
};

const renderBillTotals = () => {
    const count = bill.lines.reduce((sum, l) => sum + l.qty, 0);
    document.getElementById('bill-subtotal').textContent = money(billSubtotal());
    document.getElementById('bill-total').textContent = money(billTotal());
    document.getElementById('bill-discount').classList.toggle('invalid', bill.discount > billSubtotal());
    const empty = bill.lines.length === 0;
    const cantPay = empty || bill.lines.some(l => l.qty < 1);
    document.getElementById('btn-pay-cash').disabled = cantPay;
    document.getElementById('btn-pay-aba').disabled = cantPay;
    document.getElementById('bill-bar').textContent = empty
        ? 'Bill is empty'
        : `Bill · ${plainNumber(count)} item${count > 1 ? 's' : ''} · ${money(billTotal())}  ▲`;
};

/** Update one line after typing, without redrawing the inputs the cashier is typing in. */
const refreshLine = (line) => {
    const row = document.querySelector(`.line[data-key="${line.key}"]`);
    row.querySelector('.line-total').textContent = money(line.qty * line.price);
    row.querySelector('.line-note').textContent = lineNote(line);
    row.classList.toggle('no-price', !line.price);
    row.classList.toggle('changed', line.listPrice != null && line.price !== line.listPrice);
    renderBillTotals();
};

const billLines = document.getElementById('bill-lines');

billLines.addEventListener('input', (e) => {
    const row = e.target.closest('.line');
    const line = row && bill.lines.find(l => l.key === row.dataset.key);
    if (!line) return;
    if (e.target.classList.contains('qty')) line.qty = Math.min(digitsOf(e.target.value), MAX_QTY);
    if (e.target.classList.contains('price')) line.price = Math.min(digitsOf(e.target.value), MAX_PRICE);
    saveBill();
    refreshLine(line);
});

// Tidy a number once the cashier leaves the box: at least 1 item, prices with commas
billLines.addEventListener('focusout', (e) => {
    const row = e.target.closest('.line');
    const line = row && bill.lines.find(l => l.key === row.dataset.key);
    if (!line) return;
    if (e.target.classList.contains('qty')) {
        if (line.qty < 1) line.qty = 1;
        e.target.value = line.qty;
    }
    if (e.target.classList.contains('price')) e.target.value = line.price ? plainNumber(line.price) : '';
    saveBill();
    refreshLine(line);
});

// Select the whole number on tap, so typing replaces it
document.addEventListener('focusin', (e) => {
    if (e.target.matches('.qty, .money-input')) setTimeout(() => e.target.select(), 0);
});

billLines.addEventListener('click', (e) => {
    const button = e.target.closest('.line-remove');
    if (!button) return;
    const key = button.closest('.line').dataset.key;
    bill.lines = bill.lines.filter(l => l.key !== key);
    saveBill();
    renderBill();
});

const discountInput = document.getElementById('bill-discount');
discountInput.addEventListener('input', () => {
    bill.discount = Math.min(digitsOf(discountInput.value), MAX_PRICE * 10);
    saveBill();
    renderBillTotals();
});
discountInput.addEventListener('focusout', () => {
    // A discount can't be more than the bill
    bill.discount = billDiscount();
    discountInput.value = bill.discount ? plainNumber(bill.discount) : '';
    saveBill();
    renderBillTotals();
});

const clearBill = () => {
    bill = { lines: [], discount: 0 };
    saveBill();
    renderBill();
};

document.getElementById('btn-clear-bill').addEventListener('click', () => {
    if (bill.lines.length && !confirm('Clear this bill?')) return;
    clearBill();
});

// Narrow screens (tablet held upright): the bill slides up over the products
const openBill = () => document.body.classList.add('bill-open');
document.getElementById('bill-bar').addEventListener('click', openBill);
document.getElementById('btn-close-bill').addEventListener('click', () => document.body.classList.remove('bill-open'));

// ===== Item typed by hand =====

const openCustomItem = () => {
    if (billIsFull()) return;
    document.getElementById('custom-form').reset();
    openDialog('custom-dialog');
    document.getElementById('custom-name').focus();
};

document.getElementById('custom-form').addEventListener('submit', (e) => {
    const name = document.getElementById('custom-name').value.trim();
    const price = Math.min(digitsOf(document.getElementById('custom-price').value), MAX_PRICE);
    const qty = Math.min(Math.max(digitsOf(document.getElementById('custom-qty').value), 1), MAX_QTY);
    if (!name || !price) {
        e.preventDefault();
        showToast('Type a name and a price');
        return;
    }
    bill.lines.push({ key: crypto.randomUUID(), productId: '', name: name.slice(0, 100), qty, price, listPrice: null });
    saveBill();
    renderBill();
});
