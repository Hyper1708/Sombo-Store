// Per-device order and cancellation counts, sent with each order as a hint for the store owner.

const getCustomerHistory = (phone) => {
    const history = JSON.parse(localStorage.getItem('customerHistory')) || {};
    return history[phone] || { orders: 0, cancellations: 0, lastOrder: null };
};

const recordOrder = (phone) => {
    const history = JSON.parse(localStorage.getItem('customerHistory')) || {};
    if (!history[phone]) {
        history[phone] = { orders: 0, cancellations: 0, lastOrder: null };
    }
    history[phone].orders += 1;
    history[phone].lastOrder = new Date().toISOString();
    localStorage.setItem('customerHistory', JSON.stringify(history));
    return history[phone];
};

const recordCancellation = (phone) => {
    const history = JSON.parse(localStorage.getItem('customerHistory')) || {};
    if (!history[phone]) {
        history[phone] = { orders: 0, cancellations: 0, lastOrder: null };
    }
    history[phone].cancellations += 1;
    localStorage.setItem('customerHistory', JSON.stringify(history));
    return history[phone];
};

const getCustomerRisk = (phone) => {
    const hist = getCustomerHistory(phone);
    if (hist.orders === 0) return { level: 'new', warning: '' };
    const cancelRate = hist.cancellations / hist.orders;
    if (cancelRate >= 0.50) return { level: 'high', warning: `⚠️ RISKY: ${hist.cancellations}/${hist.orders} cancellations` };
    if (cancelRate >= 0.25) return { level: 'medium', warning: `⚠️ MODERATE: ${hist.cancellations}/${hist.orders} cancellations` };
    return { level: 'low', warning: '' };
};

// Customer management (console functions)
// Use in browser console: customerReport() or resetCustomerHistory()
window.customerReport = () => {
    const history = JSON.parse(localStorage.getItem('customerHistory')) || {};
    const report = Object.entries(history).map(([phone, data]) => {
        const cancelRate = data.orders > 0 ? ((data.cancellations / data.orders) * 100).toFixed(0) : 0;
        const risk = getCustomerRisk(phone);
        return {
            phone,
            orders: data.orders,
            cancellations: data.cancellations,
            'cancelRate%': cancelRate,
            risk: risk.level,
            lastOrder: data.lastOrder
        };
    }).sort((a, b) => b.cancellations - a.cancellations);

    console.table(report);
    return report;
};

window.resetCustomerHistory = () => {
    if (confirm('⚠️ This will clear ALL customer history. Continue?')) {
        localStorage.removeItem('customerHistory');
        console.log('✅ Customer history cleared');
    }
};
