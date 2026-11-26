// Register products: loaded from the same Google Sheet as the online shop, shown as a grid
// with search and categories. Stock is not used here: the shop sells what is on the shelf.

let posProducts = saved.get('pos-products', []);
let activeCategory = '';

const toPosProduct = (row) => {
    const price = Math.round(parsePrice(row.pricess));
    return {
        id: String(row.id ?? '').trim(),
        name: String(row.name).trim(),
        category: row.category ? String(row.category) : '',
        price: price > 0 ? Math.min(price, MAX_PRICE) : null,
        image: row.images ? fixImagePath(String(row.images).split('|')[0]) : ''
    };
};

const loadPosProducts = async () => {
    const grid = document.getElementById('products');
    if (!posProducts.length) grid.innerHTML = '<p class="muted pad">Loading products…</p>';
    try {
        const response = await fetch(PRODUCTS_SHEETS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        posProducts = readProductRows(await response.json()).map(toPosProduct);
        saved.set('pos-products', posProducts);
    } catch (err) {
        console.error('Products:', err);
        showToast(posProducts.length
            ? 'Could not refresh products: showing the saved list'
            : 'Could not load products. Check the internet and tap ↻', 4000);
    }
    renderCategories();
    renderProducts();
};

const renderCategories = () => {
    const names = new Map();
    posProducts.forEach(p => { if (p.category) names.set(p.category.toLowerCase(), p.category); });
    if (activeCategory && !names.has(activeCategory)) activeCategory = '';
    const chip = (key, label) =>
        `<button type="button" class="chip${key === activeCategory ? ' active' : ''}" data-category="${escapeHtml(key)}">${escapeHtml(label)}</button>`;
    document.getElementById('categories').innerHTML =
        chip('', 'All') + [...names].map(([key, label]) => chip(key, label)).join('');
};

const matchingProducts = () => {
    const query = document.getElementById('search').value.trim().toLowerCase();
    const idQuery = query.replace(/^#/, '');
    return posProducts.filter(p => {
        if (activeCategory && p.category.toLowerCase() !== activeCategory) return false;
        if (!query) return true;
        return p.name.toLowerCase().includes(query) || (idQuery && p.id.toLowerCase() === idQuery);
    });
};

const renderProducts = () => {
    const list = matchingProducts();
    const cards = list.map(p => `
        <button type="button" class="card" data-index="${posProducts.indexOf(p)}">
            <img src="${escapeHtml(p.image || PLACEHOLDER_IMG)}" alt="" loading="lazy" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG">
            <span class="card-name">${escapeHtml(p.name)}</span>
            <span class="card-meta">${p.id ? `#${escapeHtml(p.id)} · ` : ''}${p.price ? money(p.price) : 'No price'}</span>
        </button>
    `).join('');
    document.getElementById('products').innerHTML = `
        <button type="button" class="card other" data-other>
            <span class="other-plus">+</span>
            <span class="card-name">Other item</span>
            <span class="card-meta">Type name and price</span>
        </button>
        ${cards}
        ${posProducts.length && !list.length ? '<p class="muted pad">No product matches.</p>' : ''}
    `;
};

document.getElementById('search').addEventListener('input', renderProducts);

document.getElementById('categories').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-category]');
    if (!chip) return;
    activeCategory = chip.dataset.category;
    renderCategories();
    renderProducts();
});

document.getElementById('products').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    if (card.hasAttribute('data-other')) return openCustomItem();
    const product = posProducts[Number(card.dataset.index)];
    if (product) addToBill(product);
});

document.getElementById('btn-reload-products').addEventListener('click', loadPosProducts);
