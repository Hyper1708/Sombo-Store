// Checkout with ABA PayWay: create the payment, wait for it, then submit the order through the Worker.

let pendingOrderData = null;
let currentTranId = null;
let currentDeeplink = null;
let paymentPollInterval = null;
let paymentPollTimeout = null;

const placeOrder = async () => {
    const t = translations[currentLang];
    // In the Telegram Mini App a profile can exist with only the Telegram name in it
    if (!userInfo || !userInfo.phone) { openSignupModal(); return; }
    if (cart.length === 0) { showToast(t.alertEmptyCart || 'Your cart is empty'); return; }

    // Estimate from the cart; the Worker prices the order from the sheet and has the final say
    const estimate = cart.reduce((sum, item) => sum + parsePrice(item.price) * item.quantity, 0);

    // Store pending order
    pendingOrderData = {
        cart: [...cart],
        userInfo: { ...userInfo },
        totalPrice: estimate,
        timestamp: new Date().toISOString()
    };

    // Show payment modal in loading state
    document.getElementById('paymentAmount').textContent = formatKHR(estimate);
    document.getElementById('paymentLoading').style.display = 'block';
    document.getElementById('paymentQRSection').style.display = 'none';
    document.getElementById('paymentError').style.display = 'none';
    document.getElementById('payNowBtn').style.display = 'none';
    document.getElementById('cartModal').classList.remove('active');
    document.getElementById('paymentModal').classList.add('active');
    tgShowBackButton();

    try {
        // Call Worker to create payment. It looks up prices itself, so only ids and
        // quantities are sent — nothing here can change what the customer is charged.
        const response = await fetch(PAYWAY_WORKER_URL + '/api/purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: cart.map(item => ({ id: item.id || '', name: item.name, quantity: item.quantity })),
                customer: {
                    name: userInfo.name,
                    phone: userInfo.phone,
                    address: userInfo.address,
                    note: userInfo.note,
                    lat: userInfo.lat,
                    lng: userInfo.lng
                },
                // Lets the Worker verify the Telegram user before sending them a receipt
                tg_init_data: isTelegramMiniApp ? tgApp.initData : '',
                lang: currentLang,
                site_url: window.location.origin + window.location.pathname
            })
        });

        const result = await response.json();

        if (result.error) throw new Error(result.error);
        if (!pendingOrderData) return; // payment was cancelled while this was loading

        currentTranId = result.tran_id;
        pendingOrderData.totalPrice = result.amount;
        pendingOrderData.orderToken = result.order_token;
        document.getElementById('paymentAmount').textContent = formatKHR(result.amount);

        // Save to localStorage for hosted checkout return
        localStorage.setItem('pendingPaywayOrder', JSON.stringify({
            ...pendingOrderData,
            tran_id: currentTranId
        }));

        if (result.fallback === 'hosted') {
            // Hosted checkout: auto-submit form to PayWay
            const form = document.getElementById('paywayHostedForm');
            form.action = result.checkout_url;
            form.innerHTML = '';
            Object.entries(result.fields).forEach(([key, val]) => {
                if (val) {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = val;
                    form.appendChild(input);
                }
            });
            form.submit();
            return;
        }

        // Deeplink mode: show QR + Pay Now
        currentDeeplink = result.abapay_deeplink || null;

        // Display QR image — API returns qrImage (base64) or qrString
        let qrUrl = '';
        if (result.qrImage) {
            qrUrl = result.qrImage;
        } else if (result.checkout_qr_url) {
            qrUrl = result.checkout_qr_url;
        } else if (result.qrString || result.qr_string) {
            const qrData = result.qrString || result.qr_string;
            qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(qrData);
        }

        document.getElementById('paymentLoading').style.display = 'none';
        document.getElementById('paymentQRSection').style.display = 'block';
        if (qrUrl) document.getElementById('paymentQRImage').src = qrUrl;
        if (currentDeeplink) document.getElementById('payNowBtn').style.display = 'block';

        // Reset status indicator
        document.getElementById('statusDot').className = 'status-dot';
        document.getElementById('statusText').textContent = t.waitingPayment || 'Waiting for payment...';

        // Start polling for payment confirmation
        startPaymentPolling();

    } catch (err) {
        document.getElementById('paymentLoading').style.display = 'none';
        document.getElementById('paymentError').style.display = 'block';
        document.getElementById('paymentErrorMsg').textContent = err.message;
    }
};

// Open banking app via deep link
const payNow = () => {
    if (currentDeeplink) {
        window.open(currentDeeplink, '_blank');
    }
};

// Poll PayWay for payment status
const startPaymentPolling = () => {
    stopPaymentPolling();

    paymentPollInterval = setInterval(async () => {
        if (!currentTranId) return;
        try {
            const res = await fetch(PAYWAY_WORKER_URL + '/api/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tran_id: currentTranId })
            });
            const result = await res.json();
            const t = translations[currentLang];

            if (result.data) {
                if (result.data.payment_status_code === 0) {
                    // APPROVED
                    stopPaymentPolling();
                    document.getElementById('statusDot').className = 'status-dot confirmed';
                    document.getElementById('statusText').textContent = t.paymentVerified || '✅ Payment verified!';
                    document.getElementById('payNowBtn').style.display = 'none';
                    if (isTelegramMiniApp) tgApp.HapticFeedback.notificationOccurred('success');
                    setTimeout(() => submitOrder(), 1200);
                } else if (result.data.payment_status_code === 3 || result.data.payment_status_code === 7) {
                    // DECLINED or CANCELLED
                    stopPaymentPolling();
                    document.getElementById('statusDot').className = 'status-dot failed';
                    document.getElementById('statusText').textContent = t.paymentFailed || '❌ Payment failed';
                }
                // status 2 = PENDING → keep polling
            }
        } catch (e) {
            console.log('Payment poll error:', e);
        }
    }, 3000);

    // Auto-timeout after 10 minutes
    paymentPollTimeout = setTimeout(() => {
        if (paymentPollInterval) {
            stopPaymentPolling();
            const t = translations[currentLang];
            document.getElementById('statusDot').className = 'status-dot failed';
            document.getElementById('statusText').textContent = t.paymentTimeout || '⏰ Payment timed out';
        }
    }, 600000);
};

const stopPaymentPolling = () => {
    if (paymentPollInterval) { clearInterval(paymentPollInterval); paymentPollInterval = null; }
    if (paymentPollTimeout) { clearTimeout(paymentPollTimeout); paymentPollTimeout = null; }
};

const cancelPayment = () => {
    // Backing out after a payment was created counts as a cancellation
    if (currentTranId && pendingOrderData) {
        recordCancellation(pendingOrderData.userInfo.phone);
    }
    stopPaymentPolling();
    currentTranId = null;
    currentDeeplink = null;
    localStorage.removeItem('pendingPaywayOrder');
    document.getElementById('paymentModal').classList.remove('active');
    pendingOrderData = null;
    tgHideBackButton();
};

// Submit order after verified payment
const submitOrder = async () => {
    if (!pendingOrderData) return;
    const data = pendingOrderData;
    const tranId = currentTranId;

    document.getElementById('paymentModal').classList.remove('active');
    document.getElementById('loadingOverlay').classList.add('active');

    try {
        const phone = data.userInfo.phone;
        const history = getCustomerHistory(phone);
        const paymentDisplay = formatKHR(data.totalPrice);

        // The Worker checks the payment with PayWay itself, then writes and sends the
        // Telegram messages from the signed order — the page can't fake or alter them.
        const orderResponse = await fetch(`${PAYWAY_WORKER_URL}/api/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_token: data.orderToken,
                // Counts from this device, including this order
                history: { orders: history.orders + 1, cancellations: history.cancellations }
            })
        });

        const orderResult = await orderResponse.json();
        if (!orderResult.ok) throw new Error(orderResult.error || 'Order submission failed');

        recordOrder(phone);

        // Save to Google Sheets (if configured)
        if (GOOGLE_SHEETS_URL) {
            try {
                await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: data.userInfo.name,
                        phone: data.userInfo.phone,
                        address: data.userInfo.address,
                        lat: data.userInfo.lat,
                        lng: data.userInfo.lng,
                        items: JSON.stringify(data.cart),
                        payment: paymentDisplay,
                        tran_id: tranId,
                        timestamp: data.timestamp
                    })
                });
            } catch (e) {
                console.log('Google Sheets save skipped');
            }
        }

        // Clear cart and show success
        cart = [];
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartCount();
        pendingOrderData = null;
        currentTranId = null;
        currentDeeplink = null;
        localStorage.removeItem('pendingPaywayOrder');

        document.getElementById('loadingOverlay').classList.remove('active');
        document.getElementById('successModal').classList.add('active');

        if (isTelegramMiniApp) {
            tgApp.HapticFeedback.notificationOccurred('success');
        }

    } catch (error) {
        document.getElementById('loadingOverlay').classList.remove('active');
        console.error('Order error:', error);
        // The customer may already have paid, so give them the reference to quote
        alert(translations[currentLang].alertOrderFailed + (tranId ? `\n\nTran ID: ${tranId}` : ''));
    }
};

const closeSuccessModal = () => {
    document.getElementById('successModal').classList.remove('active');
    tgHideBackButton();
    updateTelegramMainButton();
};

// PayWay's hosted checkout sends the customer back with ?payway_tran=<id>.
// Pick up the saved order, confirm the payment and submit it.
const resumeHostedCheckout = () => {
    const params = new URLSearchParams(window.location.search);
    const payway_tran = params.get('payway_tran');
    if (!payway_tran) return;

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);

    // Restore pending order from localStorage
    const saved = JSON.parse(localStorage.getItem('pendingPaywayOrder') || 'null');
    if (!saved || saved.tran_id !== payway_tran) return;

    pendingOrderData = saved;
    currentTranId = payway_tran;

    // Verify payment then submit
    document.getElementById('loadingOverlay').classList.add('active');
    fetch(PAYWAY_WORKER_URL + '/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tran_id: payway_tran })
    })
    .then(r => r.json())
    .then(result => {
        if (result.data && result.data.payment_status_code === 0) {
            submitOrder();
        } else {
            document.getElementById('loadingOverlay').classList.remove('active');
            alert('Payment not confirmed. Please try again.');
            localStorage.removeItem('pendingPaywayOrder');
        }
    })
    .catch(() => {
        document.getElementById('loadingOverlay').classList.remove('active');
        alert('Could not verify payment. Please contact support.');
    });
};
