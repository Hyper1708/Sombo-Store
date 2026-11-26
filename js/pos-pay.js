// Taking payment: cash (with change) or ABA, then the sale goes to the outbox.

let lastSale = null; // the sale shown in the "Sale complete" dialog

// ===== Cash =====

const cashReceivedInput = document.getElementById('cash-received');

// Likely notes handed over: the exact amount, then round amounts above it
const quickAmounts = (total) => {
    const amounts = [total];
    for (const step of [10000, 50000, 100000, 500000]) {
        const rounded = Math.ceil(total / step) * step;
        if (rounded > total && !amounts.includes(rounded)) amounts.push(rounded);
    }
    return amounts.slice(0, 4);
};

const renderChange = () => {
    const total = billTotal();
    const received = digitsOf(cashReceivedInput.value);
    const el = document.getElementById('cash-change');
    const enough = cashReceivedInput.value.trim() !== '' && received >= total;
    if (!cashReceivedInput.value.trim()) {
        el.className = 'change';
        el.textContent = '';
    } else if (enough) {
        el.className = 'change good';
        el.innerHTML = `Change <strong>${money(received - total)}</strong>`;
    } else {
        el.className = 'change bad';
        el.innerHTML = `Not enough: <strong>${money(total - received)}</strong> more`;
    }
    document.getElementById('cash-complete').disabled = !enough;
};

document.getElementById('btn-pay-cash').addEventListener('click', () => {
    if (!bill.lines.length) return;
    const total = billTotal();
    document.getElementById('cash-total').textContent = money(total);
    cashReceivedInput.value = '';
    document.getElementById('cash-quick').innerHTML = quickAmounts(total)
        .map((amount, i) => `<button type="button" class="btn ghost" data-amount="${amount}">${i === 0 ? 'Exact' : money(amount)}</button>`)
        .join('');
    renderChange();
    openDialog('cash-dialog');
    cashReceivedInput.focus();
});

cashReceivedInput.addEventListener('input', renderChange);
cashReceivedInput.addEventListener('focusout', () => {
    if (cashReceivedInput.value.trim()) cashReceivedInput.value = plainNumber(digitsOf(cashReceivedInput.value));
});

document.getElementById('cash-quick').addEventListener('click', (e) => {
    const button = e.target.closest('[data-amount]');
    if (!button) return;
    cashReceivedInput.value = plainNumber(Number(button.dataset.amount));
    renderChange();
});

document.getElementById('cash-form').addEventListener('submit', (e) => {
    const received = digitsOf(cashReceivedInput.value);
    if (!cashReceivedInput.value.trim() || received < billTotal()) {
        e.preventDefault();
        return;
    }
    completeSale('cash', received);
});

// ===== ABA =====

document.getElementById('btn-pay-aba').addEventListener('click', () => {
    if (!bill.lines.length) return;
    document.getElementById('aba-total').textContent = money(billTotal());
    openDialog('aba-dialog');
});

document.getElementById('aba-form').addEventListener('submit', () => completeSale('aba', null));

// ===== Finish the sale =====

const completeSale = (payment, cashReceived) => {
    if (!bill.lines.length) return; // already completed (double tap)
    const sale = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        payment,
        items: bill.lines.map(l => ({
            productId: l.productId, name: l.name, qty: l.qty, price: l.price, listPrice: l.listPrice
        })),
        discount: billDiscount(),
        cashReceived
    };
    // Into the outbox (saved on the tablet) before the bill is cleared
    queueSale(sale);
    clearBill();
    document.body.classList.remove('bill-open');
    showDone(withTotals(sale));
};

const showDone = (sale) => {
    lastSale = sale;
    document.getElementById('done-code').textContent = `No. ${sale.code}`;
    document.getElementById('done-change').innerHTML = sale.payment === 'cash'
        ? `Change <strong>${money(sale.change)}</strong>`
        : 'Paid by ABA';
    document.getElementById('done-change').className = 'change good';
    renderDoneStatus();
    openDialog('done-dialog');
};

const renderDoneStatus = () => {
    if (!lastSale) return;
    const el = document.getElementById('done-status');
    const entry = outbox.find(e => e.sale.id === lastSale.id);
    if (!entry) {
        el.textContent = '✓ Saved';
        el.className = 'status good';
    } else if (entry.error) {
        el.textContent = `Not accepted by the server (${entry.error}). Tell the owner.`;
        el.className = 'status bad';
    } else {
        el.textContent = outboxFlush
            ? 'Saving…'
            : 'Saved on this tablet. It will upload when the internet is back.';
        el.className = 'status waiting';
    }
};

document.getElementById('done-print').addEventListener('click', () => {
    if (lastSale) printReceipt(lastSale);
});
