// Print or download a receipt for the current cart.

// Print Receipt Function
const printReceipt = () => {
    const t = translations[currentLang];
    let receiptHTML = `
        <html>
        <head>
            <title>Sambo Store - Receipt</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; }
                h1 { text-align: center; color: #e01a22; }
                .store-info { text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #ccc; padding-bottom: 10px; }
                .item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                .item-name { flex: 1; }
                .item-qty { width: 60px; text-align: center; }
                .item-price { width: 80px; text-align: right; }
                .total-section { margin-top: 20px; border-top: 2px solid #333; padding-top: 10px; }
                .total-line { display: flex; justify-content: space-between; font-size: 1.2em; font-weight: bold; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 0.9em; }
                .date { text-align: center; color: #999; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h1>🛒 Sambo Store</h1>
            <div class="store-info">
                <p>Thank you for your order!</p>
            </div>
            <div class="date">${new Date().toLocaleString()}</div>
            <div class="items">
                <div class="item" style="font-weight: bold; border-bottom: 2px solid #333;">
                    <span class="item-name">Item</span>
                    <span class="item-qty">Qty</span>
                    <span class="item-price">Price</span>
                </div>
    `;

    let totalPrice = 0;
    cart.forEach(item => {
        const priceNum = parsePrice(item.price);
        const itemTotal = priceNum * item.quantity;
        totalPrice += itemTotal;
        receiptHTML += `
            <div class="item">
                <span class="item-name">${escapeHtml(item.name)}</span>
                <span class="item-qty">x${item.quantity}</span>
                <span class="item-price">${formatKHR(itemTotal)}</span>
            </div>
        `;
    });

    receiptHTML += `
            </div>
            <div class="total-section">
                <div class="total-line">
                    <span>Total:</span>
                    <span>${formatKHR(totalPrice)}</span>
                </div>
            </div>
            <div class="footer">
                <p>Thank you for shopping with us!</p>
                <p>Sambo Store</p>
            </div>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    printWindow.print();
};

// Download Receipt Function
const downloadReceipt = () => {
    const rule = '================================';
    const dash = '--------------------------------';
    const lines = [rule, '       SAMBO STORE RECEIPT', rule,
        `Date: ${new Date().toLocaleString()}`, dash, 'ITEMS:', dash];

    let totalPrice = 0;
    let totalItems = 0;

    cart.forEach(item => {
        const priceNum = parsePrice(item.price);
        const itemTotal = priceNum * item.quantity;
        totalPrice += itemTotal;
        totalItems += item.quantity;
        lines.push(item.name, `  ${item.quantity} x ${formatKHR(priceNum)} = ${formatKHR(itemTotal)}`);
    });

    lines.push(dash, `TOTAL ITEMS: ${totalItems}`, `TOTAL: ${formatKHR(totalPrice)}`, rule,
        'Thank you for shopping with us!', '       Sambo Store', rule);

    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sambo-store-receipt-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
