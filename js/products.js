// Product catalogue: loading from Google Sheets, rendering, product modal, filter and search.

let allProducts = [];
let categories = new Set();

// Helper function to fix image paths
const fixImagePath = (path) => {
    if (!path) return '';
    // Extract just the filename and put it in media Picture/ folder
    const filename = path.trim().split(/[\\\/]/).pop();
    return `media Picture/${filename}`;
};

const loadProductsFromSheet = async () => {
    try {
        const response = await fetch(PRODUCTS_SHEETS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const products = await response.json();

        // Normalize all keys to lowercase to handle any sheet column casing
        const normalized = products.map(p => {
            const obj = {};
            Object.keys(p).forEach(k => { obj[k.toLowerCase().trim()] = p[k]; });
            return obj;
        });

        allProducts = normalized.filter(p => p.name && p.name.toString().trim() !== '');
        categories.clear();
        allProducts.forEach(p => {
            if (p.category) categories.add(p.category.toLowerCase());
        });
        renderProducts(allProducts);
        updateCategoryButtons();
        applyTranslations();
    } catch (error) {
        console.error('Error loading products:', error);
        document.getElementById('products-container').innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #e01a22;">
                <p>Failed to load products. Please refresh the page.</p>
            </div>
        `;
    }
};

const renderProducts = (products) => {
    const container = document.getElementById('products-container');
    const t = translations[currentLang];

    // Group products by category
    const grouped = {};
    products.forEach(product => {
        const cat = (product.category || 'other').toLowerCase();
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(product);
    });

    let html = '';

    for (const [category, items] of Object.entries(grouped)) {
        const categoryKey = category.replace(/\s+/g, '');
        const categoryDisplay = t[categoryKey] || category.charAt(0).toUpperCase() + category.slice(1);

        html += `
            <div class="product-section" data-section="${escapeHtml(categoryKey)}">
                <div class="section-header" data-translate="${escapeHtml(categoryKey)}">${escapeHtml(categoryDisplay)}</div>
                <div class="menu-grid">
        `;

        items.forEach((product) => {
            const stockNum = parseInt(product.stock) || 0;
            const stockClass = stockNum > 0 ? 'instock' : 'outofstock';
            const stockText = stockClass === 'instock' ? t.inStock : t.outOfStock;
            const name = escapeHtml(product.name || '');
            const price = formatKHR(parsePrice(product.pricess));

            // Handle images (can be multiple separated by |)
            const images = product.images ? String(product.images).split('|').map(img => fixImagePath(img)) : [];
            const firstImage = images[0] || PLACEHOLDER_IMG;

            // Position in allProducts (works even when ids are missing or repeated)
            const globalIndex = allProducts.indexOf(product);

            html += `
                <div class="menu-card" data-category="${escapeHtml(categoryKey)}" data-name="${name}" data-price="${price}" onclick="openProductModal(${globalIndex})" style="cursor: pointer;">
                    <span class="stock-badge ${stockClass}">${stockText}</span>
                    <img src="${escapeHtml(firstImage)}" alt="${name}" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG">
                    <div class="card-body">
                        <p class="item-id">ID: #${escapeHtml(product.id)}</p>
                        <p class="item-name">${name}</p>
                        <p class="item-category" data-translate="${escapeHtml(categoryKey)}">${escapeHtml(categoryDisplay)}</p>
                        <div class="price-row">
                            <span class="item-price">${price}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
};

// Product modal
let currentProductIndex = -1;
let currentProductImages = [];

const openProductModal = (index) => {
    const product = allProducts[index];
    if (!product) return;

    currentProductIndex = index;
    const t = translations[currentLang];

    // Handle images
    const images = product.images ? String(product.images).split('|').map(img => fixImagePath(img)) : [];
    currentProductImages = images;
    const firstImage = images[0] || PLACEHOLDER_IMG;

    // Set main image
    document.getElementById('productModalImage').onerror = function() {
        this.onerror = null;
        this.src = PLACEHOLDER_IMG;
    };
    document.getElementById('productModalImage').src = firstImage;

    // Set thumbnails if multiple images
    const thumbsContainer = document.getElementById('productModalThumbs');
    if (images.length > 1) {
        thumbsContainer.innerHTML = images.map((img, i) =>
            `<img src="${escapeHtml(img)}" class="product-modal-thumb ${i === 0 ? 'active' : ''}" onclick="changeProductImage(${i}, this)" onerror="this.style.display='none'">`
        ).join('');
        thumbsContainer.style.display = 'flex';
    } else {
        thumbsContainer.style.display = 'none';
    }

    // Set product details
    document.getElementById('productModalName').textContent = product.name;

    const categoryKey = (product.category || 'other').toLowerCase().replace(/\s+/g, '');
    const categoryDisplay = t[categoryKey] || product.category;
    document.getElementById('productModalCategory').textContent = categoryDisplay;

    document.getElementById('productModalPrice').textContent = formatKHR(parsePrice(product.pricess));
    document.getElementById('productModalDescription').textContent = product.description || '';

    // Stock status
    const stockNum = parseInt(product.stock) || 0;
    const stockEl = document.getElementById('productModalStock');
    if (stockNum > 0) {
        stockEl.textContent = t.inStock + ' (' + stockNum + ')';
        stockEl.className = 'product-modal-stock instock';
        document.getElementById('productModalAddBtn').disabled = false;
    } else {
        stockEl.textContent = t.outOfStock;
        stockEl.className = 'product-modal-stock outofstock';
        document.getElementById('productModalAddBtn').disabled = true;
    }

    // Reset quantity to 1 when opening modal
    document.getElementById('modalQuantity').value = 1;

    document.getElementById('productModal').classList.add('active');
};

const closeProductModal = () => {
    document.getElementById('productModal').classList.remove('active');
    currentProductIndex = -1;
};

const changeProductImage = (imageIndex, thumbEl) => {
    const src = currentProductImages[imageIndex];
    if (!src) return;
    document.getElementById('productModalImage').src = src;
    document.querySelectorAll('.product-modal-thumb').forEach(t => t.classList.remove('active'));
    thumbEl.classList.add('active');
};

const addToCartFromModal = () => {
    if (currentProductIndex < 0) return;
    const product = allProducts[currentProductIndex];
    if (!product) return;

    const quantity = Math.min(Math.max(parseInt(document.getElementById('modalQuantity').value) || 1, 1), 999);
    addToCart(product, quantity);

    closeProductModal();
};

// Modal quantity functions
const updateModalQuantity = (change) => {
    const input = document.getElementById('modalQuantity');
    let newValue = parseInt(input.value) + change;
    if (newValue < 1) newValue = 1;
    if (newValue > 999) newValue = 999;
    input.value = newValue;
};

const setModalQuantity = (value) => {
    const quantity = parseInt(value) || 1;
    const input = document.getElementById('modalQuantity');
    input.value = Math.min(Math.max(quantity, 1), 999);
};

const updateCategoryButtons = () => {
    const categoryBar = document.querySelector('.category-bar');
    const t = translations[currentLang];

    let buttonsHtml = `<button class="category-item active" onclick="filterMenu('all', this)" data-translate="all">${t.all}</button>`;

    categories.forEach(cat => {
        const catKey = cat.replace(/\s+/g, '');
        const catDisplay = t[catKey] || cat.charAt(0).toUpperCase() + cat.slice(1);
        buttonsHtml += `<button class="category-item" onclick="filterMenu(this.dataset.cat, this)" data-cat="${escapeHtml(catKey)}" data-translate="${escapeHtml(catKey)}">${escapeHtml(catDisplay)}</button>`;
    });

    categoryBar.innerHTML = buttonsHtml;
};

// Menu filter
const filterMenu = (category, element) => {
    const sections = document.querySelectorAll('.product-section');
    const categoryItems = document.getElementsByClassName('category-item');

    // Update active button
    for (let item of categoryItems) {
        item.classList.remove('active');
    }
    element.classList.add('active');

    // Clear search when switching category
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    // Show/hide sections
    sections.forEach(section => {
        if (category === 'all' || section.dataset.section === category) {
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
        // Show all cards within visible sections
        section.querySelectorAll('.menu-card').forEach(card => card.style.display = '');
    });

    // Remove any previous no-results message
    document.querySelectorAll('.no-results').forEach(el => el.remove());
};

const searchProducts = (query) => {
    const q = query.trim().toLowerCase();
    const sections = document.querySelectorAll('.product-section');
    let totalVisible = 0;

    // Reset category filter to all when searching
    if (q) {
        document.querySelectorAll('.category-item').forEach(btn => btn.classList.remove('active'));
        const allBtn = document.querySelector('.category-item[data-translate="all"]');
        if (allBtn) allBtn.classList.add('active');
    }

    sections.forEach(section => {
        const cards = section.querySelectorAll('.menu-card');
        let sectionVisible = 0;
        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            const matches = !q || text.includes(q);
            card.style.display = matches ? '' : 'none';
            if (matches) sectionVisible++;
        });
        section.style.display = (q === '' || sectionVisible > 0) ? 'block' : 'none';
        totalVisible += sectionVisible;
    });

    // Show/hide no-results message
    const container = document.getElementById('products-container');
    let noResults = container.querySelector('.no-results');
    if (q && totalVisible === 0) {
        if (!noResults) {
            noResults = document.createElement('div');
            noResults.className = 'no-results';
            container.appendChild(noResults);
        }
        noResults.innerHTML = `<div class="no-results-icon">🔍</div><div>No products found for "<strong>${escapeHtml(query.trim())}</strong>"</div><div style="margin-top:0.5rem;font-size:0.85rem;">Try a different keyword</div>`;
    } else if (noResults) {
        noResults.remove();
    }
};
