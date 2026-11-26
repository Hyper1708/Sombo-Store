// Register start-up: login screen, settings, and keeping the outbox moving.

const OUTBOX_RETRY_MS = 20000;
let registerStarted = false;

const showLoginScreen = (message = '') => {
    document.getElementById('register').hidden = true;
    document.getElementById('login-screen').hidden = false;
    document.getElementById('login-error').textContent = message;
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    document.getElementById('login-password').focus();
};

const showRegister = () => {
    document.getElementById('login-screen').hidden = true;
    document.getElementById('register').hidden = false;
    if (!registerStarted) {
        registerStarted = true;
        renderCategories();
        renderProducts();
        loadPosProducts();
        renderBill();
        setInterval(retryOutbox, OUTBOX_RETRY_MS);
        window.addEventListener('online', retryOutbox);
    }
    outboxChanged();
    flushOutbox();
};

// Only while the register is open: a lapsed login shows the login screen once, not every retry
const retryOutbox = () => {
    if (outbox.some(e => !e.error) && !document.getElementById('register').hidden) flushOutbox();
};

/** Called by the outbox whenever a sale is added, uploaded or refused. */
const outboxChanged = () => {
    renderSyncStatus();
    renderDoneStatus();
};

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('login-password');
    const button = e.target.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        await cashierLogin(input.value);
        input.value = '';
        showRegister();
    } catch (err) {
        document.getElementById('login-error').textContent = errorText(err);
    } finally {
        button.disabled = false;
    }
});

document.getElementById('sync-status').addEventListener('click', () => {
    if (outbox.some(e => !e.error)) {
        showToast('Uploading…');
        flushOutbox();
    }
});

// Any [data-close] button closes its dialog
document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-close]');
    if (button) button.closest('dialog').close();
});

// ===== Settings =====

document.getElementById('btn-settings').addEventListener('click', () => {
    document.querySelectorAll('input[name="paper"]').forEach(r => { r.checked = Number(r.value) === paperWidth; });
    openDialog('settings-dialog');
});

document.querySelectorAll('input[name="paper"]').forEach(radio => {
    radio.addEventListener('change', () => setPaperWidth(Number(radio.value)));
});

document.getElementById('settings-test-print').addEventListener('click', () => {
    printReceipt(withTotals({
        id: '00000000-0000-4000-8000-000000000000',
        createdAt: Date.now(),
        payment: 'cash',
        items: [
            { name: 'Test item', qty: 2, price: 15000 },
            { name: 'Another test item with a long name', qty: 1, price: 120000 }
        ],
        discount: 0,
        cashReceived: 200000
    }));
});

document.getElementById('settings-logout').addEventListener('click', () => {
    const waiting = outbox.length;
    const message = waiting
        ? `${waiting} sale(s) are not uploaded yet. They stay on this tablet and upload after the next login.\n\nLog out?`
        : 'Log out this tablet?';
    if (!confirm(message)) return;
    cashierLogout();
    ownerSession = null;
    showLoginScreen();
});

// ===== Start =====

if (cashierLoggedIn()) showRegister();
else showLoginScreen();
