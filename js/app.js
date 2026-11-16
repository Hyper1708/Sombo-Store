// Page start-up.

document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    loadUserInfo();
    applyTranslations();
    updateLangButton();
    loadProductsFromSheet();

    // If inside Telegram, auto-fill name field from Telegram user data
    if (isTelegramMiniApp) {
        const tgUser = tgApp.initDataUnsafe && tgApp.initDataUnsafe.user;
        if (tgUser) {
            const tgName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
            if (!userInfo) {
                // Pre-populate so the sign-up form is partially filled
                document.getElementById('userName').value = tgName;
            }
        }
    }

    // Update Telegram MainButton based on cart
    updateTelegramMainButton();
});
