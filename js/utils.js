// Small helpers shared by the other scripts.

// Escape text before putting it into HTML (product data comes from the sheet)
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

// "15,000៛", "15000" or 15000 → 15000. The Worker uses the same rule when it charges.
const parsePrice = (value) => Number(String(value ?? '').replace(/[^\d.]/g, '')) || 0;

const formatKHR = (amount) => `${Math.round(amount).toLocaleString()}៛`;

// Shown when a product image is missing
const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23eeeeee'/%3E%3Ctext x='100' y='106' font-family='sans-serif' font-size='16' fill='%23999999' text-anchor='middle'%3ENo Image%3C/text%3E%3C/svg%3E";

// Toast notifications
let toastTimer = null;
const showToast = (msg, duration = 2200) => {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
};
