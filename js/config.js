// Store-wide settings.

// Cloudflare Worker that talks to ABA PayWay and Telegram (see payway-worker/).
// Bot tokens and API keys live in the Worker as secrets, never in this file.
const PAYWAY_WORKER_URL = 'https://sambo-store-pay.sambo-store.workers.dev';

// Google Sheets web app that lists the products. The Worker reads prices from the
// same sheet, so this must match PRODUCTS_URL in payway-worker/wrangler.toml.
const PRODUCTS_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwcRg8ovt2kGtubWqaaYtgUjPK7s4SzYdB2DI2kQIGKZ2hOZYkJvudq7CBC9U7QH6BD/exec';

// Optional Google Sheets web app that stores a copy of each order. Leave empty to skip.
const GOOGLE_SHEETS_URL = '';

// Folder that holds the product photos named in the sheet's "images" column.
const PRODUCT_IMAGES_DIR = 'images/products';
