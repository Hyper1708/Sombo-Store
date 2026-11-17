// Receipts for the current cart: a picture to save or share, or a printout.
// Both use the same layout. The picture is drawn by html2canvas, which is only
// downloaded the first time someone saves a receipt. A picture (not a PDF) keeps
// Khmer text correct, because the phone's own Khmer font draws it.

const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

const RECEIPT_CSS = `
.receipt { width: 420px; box-sizing: border-box; background: #fff; color: #222; border: 1px solid #eee;
  border-radius: 12px; overflow: hidden; font-size: 13px; line-height: 1.5;
  font-family: 'Noto Sans Khmer', 'Khmer OS', 'Khmer UI', 'Leelawadee UI', Arial, sans-serif; }
.receipt * { box-sizing: border-box; }
.r-head { background: #e01a22; color: #fff; text-align: center; padding: 18px 16px 14px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.r-store { font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
.r-tagline { font-size: 12px; opacity: 0.92; margin-top: 2px; }
.r-contact { font-size: 12px; margin-top: 6px; }
.r-title { text-align: center; font-weight: 700; font-size: 15px; letter-spacing: 1px; padding: 12px 0 6px;
  color: #e01a22; text-transform: uppercase; }
.r-meta { padding: 0 18px 10px; border-bottom: 2px dashed #ddd; }
.r-meta .r-row { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
.r-meta .r-row span { color: #777; }
.r-meta .r-row b { text-align: right; }
.r-address { color: #555; font-size: 12px; padding-top: 2px; }
.r-table { width: 100%; border-collapse: collapse; margin: 6px 0 4px; }
.r-table th { font-size: 11px; color: #777; font-weight: 600; padding: 6px; border-bottom: 1px solid #eee; text-align: right; }
.r-table th.r-item, .r-table td.r-item { text-align: left; }
.r-table td { padding: 7px 6px; border-bottom: 1px solid #f2f2f2; vertical-align: top; text-align: right; }
.r-table .r-no { color: #999; width: 20px; text-align: center; }
.r-table td.r-item { font-weight: 600; }
.r-note { font-weight: 400; color: #666; font-size: 11px; margin-top: 2px; }
.r-table .r-qty { text-align: center; }
.r-table .r-num { white-space: nowrap; }
.r-totals { padding: 4px 18px 12px; }
.r-totals .r-row { display: flex; justify-content: space-between; padding: 3px 0; }
.r-totals .r-grand { border-top: 2px solid #222; margin-top: 6px; padding-top: 8px; font-size: 17px; }
.r-grand b { color: #e01a22; }
.r-foot { text-align: center; color: #666; font-size: 12px; padding: 12px 16px 16px; border-top: 2px dashed #ddd; }
`;

const storePhone = () => {
    const link = document.querySelector('#storeInfoModal a[href^="tel:"]');
    return link ? link.textContent.trim() : '';
};

const receiptHtml = () => {
    const t = translations[currentLang];
    let total = 0;
    let quantity = 0;

    const rows = cart.map((item, i) => {
        const unit = parsePrice(item.price);
        const amount = unit * item.quantity;
        total += amount;
        quantity += item.quantity;
        return `
            <tr>
                <td class="r-no">${i + 1}</td>
                <td class="r-item">${escapeHtml(item.name)}${item.note ? `<div class="r-note">📝 ${escapeHtml(item.note)}</div>` : ''}</td>
                <td class="r-qty">${item.quantity}</td>
                <td class="r-num">${formatKHR(unit)}</td>
                <td class="r-num">${formatKHR(amount)}</td>
            </tr>`;
    }).join('');

    const date = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    const phone = storePhone();
    const who = userInfo || {};
    const row = (label, value) => `<div class="r-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;

    return `
        <div class="receipt">
            <div class="r-head">
                <div class="r-store">Sambo Store</div>
                <div class="r-tagline">${escapeHtml(t.storeTagline)}</div>
                ${phone ? `<div class="r-contact">📞 ${escapeHtml(phone)}</div>` : ''}
            </div>
            <div class="r-title">${escapeHtml(t.receiptTitle)}</div>
            <div class="r-meta">
                ${row(t.receiptDate, date)}
                ${who.name ? row(t.receiptCustomer, who.name) : ''}
                ${who.phone ? row(t.receiptPhone, who.phone) : ''}
                ${who.address ? `<div class="r-address">📍 ${escapeHtml(who.address)}</div>` : ''}
            </div>
            <table class="r-table">
                <thead>
                    <tr>
                        <th class="r-no">#</th>
                        <th class="r-item">${escapeHtml(t.receiptItem)}</th>
                        <th class="r-qty">${escapeHtml(t.receiptQty)}</th>
                        <th>${escapeHtml(t.receiptUnitPrice)}</th>
                        <th>${escapeHtml(t.receiptAmount)}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="r-totals">
                ${row(t.receiptQuantity, String(quantity))}
                <div class="r-row r-grand"><span>${escapeHtml(t.receiptTotal)}</span><b>${formatKHR(total)}</b></div>
            </div>
            <div class="r-foot">${escapeHtml(t.receiptThanks)}</div>
        </div>`;
};

const receiptFileName = (ext) => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `sambo-store-receipt-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
};

const printReceipt = () => {
    if (cart.length === 0) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html>
        <html><head><meta charset="utf-8"><title>Sambo Store – ${escapeHtml(translations[currentLang].receiptTitle)}</title>
        <style>
            body { margin: 0; padding: 24px; display: flex; justify-content: center; background: #fff; }
            ${RECEIPT_CSS}
            @media print { body { padding: 0; } .receipt { border: none; } }
        </style></head>
        <body>${receiptHtml()}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
};

let html2canvasLoading = null;
const loadHtml2canvas = () => {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (!html2canvasLoading) {
        html2canvasLoading = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = HTML2CANVAS_URL;
            script.onload = () => resolve(window.html2canvas);
            script.onerror = () => {
                html2canvasLoading = null;
                reject(new Error('could not load html2canvas'));
            };
            document.head.appendChild(script);
        });
    }
    return html2canvasLoading;
};

let receiptImageFile = null;

/** Draw the receipt as a picture and show it, ready to save or share. */
const downloadReceipt = async () => {
    if (cart.length === 0) return;
    const t = translations[currentLang];
    showToast(t.receiptPreparing);

    // Lay the receipt out off-screen at its real size, then photograph it
    const holder = document.createElement('div');
    holder.style.cssText = 'position: fixed; left: -10000px; top: 0;';
    holder.innerHTML = `<style>${RECEIPT_CSS}</style>${receiptHtml()}`;
    document.body.appendChild(holder);

    try {
        const html2canvas = await loadHtml2canvas();
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const canvas = await html2canvas(holder.querySelector('.receipt'), {
            scale: 2, backgroundColor: '#ffffff', logging: false
        });
        showReceiptPreview(canvas);
    } catch (err) {
        console.error('Receipt picture failed, saving text instead:', err);
        downloadReceiptText();
    } finally {
        holder.remove();
    }
};

const showReceiptPreview = (canvas) => {
    const name = receiptFileName('png');
    const dataUrl = canvas.toDataURL('image/png');
    document.getElementById('receiptPreviewImage').src = dataUrl;
    const save = document.getElementById('receiptSaveLink');
    save.href = dataUrl;
    save.download = name;

    // Phones can hand the picture straight to Telegram or other apps
    const shareBtn = document.getElementById('receiptShareBtn');
    shareBtn.style.display = 'none';
    receiptImageFile = null;
    canvas.toBlob((blob) => {
        if (!blob || typeof File === 'undefined') return;
        const file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            receiptImageFile = file;
            shareBtn.style.display = '';
        }
    }, 'image/png');

    document.getElementById('receiptPreviewModal').classList.add('active');
};

const shareReceipt = async () => {
    if (!receiptImageFile) return;
    try {
        await navigator.share({ files: [receiptImageFile], title: 'Sambo Store' });
    } catch (_) { /* closed the share sheet */ }
};

const closeReceiptPreview = () => {
    document.getElementById('receiptPreviewModal').classList.remove('active');
};

/** Plain-text receipt, used only if the picture can't be made (e.g. offline). */
const downloadReceiptText = () => {
    const t = translations[currentLang];
    const rule = '================================';
    const dash = '--------------------------------';
    const lines = [rule, '         SAMBO STORE', `   ${t.receiptTitle}`, rule,
        `${t.receiptDate}: ${new Date().toLocaleString('en-GB')}`, dash];

    let total = 0;
    let quantity = 0;
    cart.forEach(item => {
        const unit = parsePrice(item.price);
        const amount = unit * item.quantity;
        total += amount;
        quantity += item.quantity;
        lines.push(item.name);
        if (item.note) lines.push(`  📝 ${item.note}`);
        lines.push(`  ${item.quantity} x ${formatKHR(unit)} = ${formatKHR(amount)}`);
    });

    lines.push(dash, `${t.receiptQuantity}: ${quantity}`, `${t.receiptTotal}: ${formatKHR(total)}`, rule,
        t.receiptThanks, rule);

    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = receiptFileName('txt');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
