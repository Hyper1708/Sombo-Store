// Register receipts (English) for a small receipt printer.

const SHOP_NAME = 'Sambo Store';
const SHOP_PHONE = '099 420 808';

// Paper roll width → width that can actually be printed on
const PAPER = { 58: '48mm', 80: '72mm' };
let paperWidth = PAPER[saved.get('pos-paper', 58)] ? saved.get('pos-paper', 58) : 58;

const setPaperWidth = (mm) => {
    paperWidth = PAPER[mm] ? mm : 58;
    saved.set('pos-paper', paperWidth);
};

const receiptHtml = (sale) => {
    const rows = (left, right, cls = '') =>
        `<div class="r-row ${cls}"><span>${left}</span><span>${right}</span></div>`;
    const items = sale.items.map(item => `
        <div class="r-item">${escapeHtml(item.name)}</div>
        ${rows(`${plainNumber(item.qty)} x ${plainNumber(item.price)}`, plainNumber(item.qty * item.price))}
    `).join('');
    const payment = sale.payment === 'cash'
        ? rows('Cash', plainNumber(sale.cashReceived)) + rows('Change', plainNumber(sale.change))
        : rows('Paid by', 'ABA');

    return `
        <div class="receipt" style="width:${PAPER[paperWidth]}">
            <div class="r-center r-shop">${escapeHtml(SHOP_NAME.toUpperCase())}</div>
            <div class="r-center">Tel: ${escapeHtml(SHOP_PHONE)}</div>
            <div class="r-rule"></div>
            ${rows(shopTime(sale.createdAt), `No. ${escapeHtml(sale.code)}`)}
            ${sale.status === 'cancelled' ? '<div class="r-center r-big">*** CANCELLED ***</div>' : ''}
            <div class="r-rule"></div>
            ${items}
            <div class="r-rule"></div>
            ${sale.discount ? rows('Subtotal', plainNumber(sale.subtotal)) + rows('Discount', `-${plainNumber(sale.discount)}`) : ''}
            ${rows('TOTAL', money(sale.total), 'r-total')}
            ${payment}
            <div class="r-rule"></div>
            <div class="r-center">Thank you!</div>
        </div>
    `;
};

const printReceipt = (sale) => {
    document.getElementById('print-area').innerHTML = receiptHtml(sale);
    window.print();
};

window.addEventListener('afterprint', () => {
    document.getElementById('print-area').innerHTML = '';
});
