// Reading the product sheet. Shared by the online shop (products.js) and the shop register (pos.html).

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

// Sheet rows → products: column names lowercased and trimmed; rows without a name are skipped.
const readProductRows = (rows) => rows
    .map(p => {
        const obj = {};
        Object.keys(p).forEach(k => { obj[k.toLowerCase().trim()] = p[k]; });
        // Stray spaces (and invisible characters some Khmer keyboards type) in a category
        // cell would otherwise create a second, duplicate category
        if (obj.category != null) {
            obj.category = String(obj.category)
                .replace(/[­​‎‏⁠﻿]/g, '')
                .replace(/\s+/g, ' ').trim();
        }
        return obj;
    })
    .filter(p => p.name && p.name.toString().trim() !== '');
