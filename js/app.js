// Page start-up.

document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    loadUserInfo();
    applyTranslations();
    updateLangButton();
    loadProductsFromSheet();
    updateTelegramMainButton();

    // Coming back from PayWay's hosted checkout page?
    resumeHostedCheckout();
});
