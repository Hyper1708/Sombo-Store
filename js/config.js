// Store-wide settings. PRODUCTS_SHEETS_URL must match PRODUCTS_URL in payway-worker/wrangler.toml.

// Telegram credentials are handled by the Cloudflare Worker — never expose here
// const TELEGRAM_BOT_TOKEN removed for security

// ABA PayWay Configuration
// UPDATE this URL after deploying the Cloudflare Worker
const PAYWAY_WORKER_URL = 'https://sambo-store-pay.sambo-store.workers.dev';

// Google Sheets Web App URL for loading products
// (the Worker reads prices from the same sheet — keep PRODUCTS_URL in wrangler.toml in sync)
const PRODUCTS_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwcRg8ovt2kGtubWqaaYtgUjPK7s4SzYdB2DI2kQIGKZ2hOZYkJvudq7CBC9U7QH6BD/exec';

// Google Sheets Web App URL for saving orders
const GOOGLE_SHEETS_URL = '';
