// Product catalogue: loading from Google Sheets, rendering, product modal, filter and search.

let allProducts = [];
let categories = new Set();

// Photos added by the listing bot are full https links (Google Drive or R2).
// A Drive share link pasted by hand (…/file/d/<id>/view or …?id=<id>) becomes a direct image link.
// Older rows hold a file name, sometimes with a folder; only the name matters.
const fixImagePath = (path) => {
    const value = String(path ?? '').trim();
    if (!value) return '';
    const drive = value.match(/drive\.google\.com\/(?:file\/d\/|(?:open|uc|thumbnail)\?(?:[^#]*&)?id=)([\w-]{20,})/);
    if (drive) return `https://lh3.googleusercontent.com/d/${drive[1]}`;
    if (/^https:\/\//i.test(value)) return value;
    const filename = value.split(/[\\\/]/).pop();
    return `${PRODUCT_IMAGES_DIR}/${filename}`;
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
            // Stray spaces in a category cell would otherwise create a second, duplicate category
            if (obj.category != null) obj.category = String(obj.category).replace(/\s+/g, ' ').trim();
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
        openLinkedProduct();
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

const openProductModal = (index) => {
    const product = allProducts[index];
    if (!product) return;

    currentProductIndex = index;
    const t = translations[currentLang];

    // Photos (several separated by |) go into the slideshow, see gallery.js
    const images = product.images
        ? String(product.images).split('|').map(img => fixImagePath(img)).filter(Boolean)
        : [];
    showGallery(images, product.name);

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

    // Start each product with quantity 1 and an empty note
    document.getElementById('modalQuantity').value = 1;
    document.getElementById('modalNote').value = '';

    document.getElementById('productModal').classList.add('active');
    setItemInUrl(product.id);
};

const closeProductModal = () => {
    document.getElementById('productModal').classList.remove('active');
    stopGalleryAutoplay();
    currentProductIndex = -1;
    setItemInUrl(null);
};

// Product links: ?item=128 opens product 128, and the address bar always points at the
// open product so it can be copied and shared. Telegram Mini App links pass the same
// thing as startapp=item_128.
const itemIdFromStartParam = (startParam) => {
    const match = typeof startParam === 'string' && startParam.match(/^item_([\w-]+)$/);
    return match ? match[1] : '';
};

const getLinkedItemId = () => {
    const fromUrl = new URLSearchParams(window.location.search).get('item');
    if (fromUrl) return fromUrl.trim();
    return isTelegramMiniApp ? itemIdFromStartParam(tgApp.initDataUnsafe && tgApp.initDataUnsafe.start_param) : '';
};

const setItemInUrl = (id) => {
    const url = new URL(window.location.href);
    const value = id == null ? '' : String(id).trim();
    if (value) url.searchParams.set('item', value);
    else url.searchParams.delete('item');
    if (url.href !== window.location.href) window.history.replaceState(null, '', url);
};

const openLinkedProduct = () => {
    const id = getLinkedItemId();
    if (!id) return;
    const index = allProducts.findIndex(p => String(p.id ?? '').trim() === id);
    if (index === -1) {
        setItemInUrl(null);
        showToast(translations[currentLang].itemNotFound, 3500);
        return;
    }
    openProductModal(index);
};

const addToCartFromModal = () => {
    if (currentProductIndex < 0) return;
    const product = allProducts[currentProductIndex];
    if (!product) return;

    const quantity = Math.min(Math.max(parseInt(document.getElementById('modalQuantity').value) || 1, 1), 999);
    const note = document.getElementById('modalNote').value.replace(/\s+/g, ' ').trim().slice(0, 200);
    addToCart(product, quantity, note);

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
