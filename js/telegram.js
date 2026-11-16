// Telegram Mini App integration. Only active when the page is opened inside Telegram.

const tgApp = window.Telegram && window.Telegram.WebApp;
const isTelegramMiniApp = tgApp && tgApp.initData && tgApp.initData.length > 0;

if (isTelegramMiniApp) {
    tgApp.ready();
    tgApp.expand();
    document.body.classList.add('tg-mini-app');

    // Apply Telegram theme colors
    if (tgApp.themeParams) {
        const tp = tgApp.themeParams;
        document.documentElement.style.setProperty('--tg-theme-bg-color', tp.bg_color || '#f9f9f9');
        document.documentElement.style.setProperty('--tg-theme-text-color', tp.text_color || '#333');
    }

    // Auto-fill user info from Telegram
    const tgUser = tgApp.initDataUnsafe && tgApp.initDataUnsafe.user;
    if (tgUser) {
        const savedInfo = JSON.parse(localStorage.getItem('userInfo')) || {};
        const tgName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
        if (!savedInfo.name) savedInfo.name = tgName;
        if (tgUser.username) savedInfo.telegramUsername = '@' + tgUser.username;
        savedInfo.telegramId = tgUser.id;
        localStorage.setItem('userInfo', JSON.stringify(savedInfo));
    }

    // Telegram Back Button for modals
    tgApp.BackButton.onClick(() => {
        // Close any open modal
        const modals = document.querySelectorAll('.modal.active');
        if (modals.length > 0) {
            modals.forEach(m => m.classList.remove('active'));
            tgApp.BackButton.hide();
        }
    });
}

// Helper to show/hide Telegram back button when modals open
const tgShowBackButton = () => {
    if (isTelegramMiniApp) tgApp.BackButton.show();
};
const tgHideBackButton = () => {
    if (isTelegramMiniApp) tgApp.BackButton.hide();
};

// Telegram MainButton - shows "View Cart" when items in cart
const updateTelegramMainButton = () => {
    if (!isTelegramMiniApp) return;
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (totalItems > 0) {
        const t = translations[currentLang];
        const totalPrice = cart.reduce((sum, item) => sum + parsePrice(item.price) * item.quantity, 0);
        tgApp.MainButton.setText(`🛒 ${t.cart} (${totalItems}) - ${formatKHR(totalPrice)}`);
        tgApp.MainButton.show();
        tgApp.MainButton.onClick(() => openCartModal());
    } else {
        tgApp.MainButton.hide();
    }
};
