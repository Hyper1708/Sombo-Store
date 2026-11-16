// Shopping cart, saved in localStorage.

let cart = JSON.parse(localStorage.getItem('cart')) || [];

// Cart functions
const addToCart = (product, quantity = 1) => {
    const id = String(product.id ?? '').trim();
    const name = String(product.name || '');
    // Carts saved before ids were stored only have a name to match on
    const existingItem = cart.find(item => (id && item.id) ? item.id === id : item.name === name);

    if (existingItem) {
        existingItem.quantity = Math.min(existingItem.quantity + quantity, 999);
        existingItem.id = id;
        existingItem.price = parsePrice(product.pricess);
    } else {
        // The Worker re-prices every line from the sheet; price here is for display only
        cart.push({ id, name, price: parsePrice(product.pricess), quantity });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();

    // Show feedback
    showToast('🛍️ Added to cart!');
    // Bump the cart badge
    const badge = document.getElementById('cartCount');
    badge.classList.remove('bump');
    void badge.offsetWidth; // reflow
    badge.classList.add('bump');
    setTimeout(() => badge.classList.remove('bump'), 300);
};

const updateCartCount = () => {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').textContent = totalItems;
    updateTelegramMainButton();
};

const openCartModal = () => {
    renderCart();
    document.getElementById('cartModal').classList.add('active');
    tgShowBackButton();
};

const closeCartModal = () => {
    document.getElementById('cartModal').classList.remove('active');
    tgHideBackButton();
};

const renderCart = () => {
    const cartItemsContainer = document.getElementById('cartItems');
    const receiptSummary = document.getElementById('receiptSummary');
    const cartButtons = document.getElementById('cartButtons');
    const emptyCartClear = document.getElementById('emptyCartClear');
    const t = translations[currentLang];

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `<div class="empty-cart">${t.emptyCart}</div>`;
        receiptSummary.style.display = 'none';
        cartButtons.style.display = 'none';
        emptyCartClear.style.display = 'block';
        return;
    }

    let html = '';
    let totalPrice = 0;
    let totalItems = 0;

    cart.forEach((item, index) => {
        const priceNum = parsePrice(item.price);
        const itemTotal = priceNum * item.quantity;
        totalPrice += itemTotal;
        totalItems += item.quantity;

        html += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                    <div class="cart-item-price">${formatKHR(priceNum)} x ${item.quantity}</div>
                    <div class="cart-item-subtotal">= ${formatKHR(itemTotal)}</div>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="updateQuantity(${index}, -1)">-</button>
                    <input type="number" class="qty-input" min="1" max="999" value="${item.quantity}"
                           onchange="setQuantity(${index}, this.value)"
                           onclick="this.select()">
                    <button class="qty-btn" onclick="updateQuantity(${index}, 1)">+</button>
                    <button class="remove-item" onclick="removeItem(${index})">🗑</button>
                </div>
            </div>
        `;
    });

    cartItemsContainer.innerHTML = html;
    receiptSummary.style.display = 'block';
    cartButtons.style.display = 'block';
    emptyCartClear.style.display = 'none';

    // Update totals
    document.getElementById('subtotalAmount').textContent = formatKHR(totalPrice);
    document.getElementById('totalAmount').textContent = formatKHR(totalPrice);
    document.getElementById('totalItemCount').textContent = totalItems;
};

const updateQuantity = (index, change) => {
    cart[index].quantity += change;

    if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
    } else if (cart[index].quantity > 999) {
        cart[index].quantity = 999;
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    renderCart();
};

const setQuantity = (index, newValue) => {
    const quantity = parseInt(newValue) || 1;
    if (quantity <= 0) {
        cart.splice(index, 1);
    } else {
        cart[index].quantity = Math.min(quantity, 999);
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    renderCart();
};

const removeItem = (index) => {
    cart.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    renderCart();
};

const clearCart = () => {
    const t = translations[currentLang];
    if (confirm(t.alertClearCart)) {
        cart = [];
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartCount();
        renderCart();
    }
};
