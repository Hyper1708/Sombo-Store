# Sambo Store

Online shop for Sambo Store, a home-textiles store in Phnom Penh. Customers browse products,
fill a cart, pin their delivery location on a map and pay with ABA PayWay (KHQR). The store
owner gets every paid order on Telegram. The site also runs as a Telegram Mini App.

- **Site:** static HTML/CSS/JS, hosted on GitHub Pages
- **Products:** a Google Sheet, published as an Apps Script web app
- **Payments and notifications:** a Cloudflare Worker in [`payway-worker/`](payway-worker/)

## Project structure

```
index.html              Page markup and modals
css/
  base.css              Page basics, header, Telegram Mini App tweaks, toast
  catalog.css           Search, category bar, product cards
  modals.css            Shared modal styles, sign-up, cart, receipt, loading
  product-modal.css     Product detail modal
  store-info.css        Store info modal
  payment.css           Payment modal
js/                     Plain scripts, loaded in this order from index.html
  config.js             URLs and settings
  utils.js              escapeHtml, price parsing/formatting, toast
  i18n.js               English / Khmer text and language switch
  telegram.js           Telegram Mini App integration
  customer-history.js   Per-device order and cancellation counts
  products.js           Load products, render cards, product modal, filter, search
  gallery.js            Auto-rotating photo slideshow in the product modal
  profile.js            Sign-up form and delivery map
  cart.js               Cart state and cart modal
  receipt.js            Print and download receipts
  checkout.js           PayWay payment, status polling, order submission
  store-info.js         Store info modal and map
  app.js                Start-up
images/products/        Product photos (file names come from the sheet)
payway-worker/          Cloudflare Worker: pricing, PayWay, Telegram
scripts/
  version-assets.mjs    Adds ?v=<hash> to the CSS/JS links in index.html
```

There is no build step. The scripts share the page's global scope, so the order of the
`<script>` tags in `index.html` matters: a file may only use, at load time, what earlier files
define.

## How an order works

1. The page loads products from the sheet and shows them.
2. On **Place Order**, the page sends product ids and quantities to the Worker
   (`/api/purchase`). The Worker looks up the prices in the same sheet, creates the PayWay
   payment and returns a QR code plus a signed order token.
3. The page polls `/api/check` until PayWay reports the payment as paid.
4. The page sends the order token to `/api/order`. The Worker checks the token and asks
   PayWay again, then sends the order to the store owner on Telegram (and a receipt to the
   customer in the Mini App).

The browser never decides prices or tells the owner an order is paid; the Worker does.

## Product sheet columns

| Column        | Example                          | Notes                                        |
|---------------|----------------------------------|----------------------------------------------|
| `id`          | `12`                             | Unique per product                           |
| `name`        | `Blanket`                        | Rows without a name are ignored              |
| `category`    | `Blanket`                        | Used for the category bar                    |
| `pricess`     | `45000៛`                         | Price in riel. Spelled `pricess` on purpose  |
| `images`      | `photo_1.jpg\|photo_2.jpg`       | File names in `images/products/`, `\|`-separated |
| `description` | `Soft cotton`                    | Shown in the product modal                   |
| `stock`       | `10`                             | 0 or empty shows "Out of stock"              |

Column names are not case-sensitive.

## Run the site locally

Serve the folder with any static server, for example:

```bash
npx serve .
```

or

```bash
python -m http.server 8000
```

The deployed Worker accepts requests from `localhost`, so checkout works against the
PayWay sandbox while testing locally.

## Releasing changes

GitHub Pages publishes whatever is on `main`. Browsers may reuse cached CSS/JS files for
about 10 minutes, so each link in `index.html` carries a version based on the file's
content (`js/cart.js?v=3f9c2a1b`). After editing anything in `css/` or `js/`, update the
versions before committing:

```bash
node scripts/version-assets.mjs
```

It only changes the links of files whose content changed, and does nothing if all are
current.

## Worker setup

From `payway-worker/`:

1. Install dependencies: `npm install`
2. Log in to Cloudflare: `npx wrangler login`
3. Set the secrets (once):
   ```bash
   npx wrangler secret put API_KEY
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```
4. Check the vars in `wrangler.toml` (`PAYWAY_BASE_URL`, `MERCHANT_ID`, `PRODUCTS_URL`).
5. Deploy: `npx wrangler deploy`

## Going live

- [ ] In `wrangler.toml`, switch `PAYWAY_BASE_URL` to `https://checkout.payway.com.kh` and set
      the production `MERCHANT_ID`, then set the production `API_KEY` secret and redeploy
- [ ] Replace the placeholder store phone number in `index.html`
- [ ] Optionally set `GOOGLE_SHEETS_URL` in `js/config.js` to keep a copy of each order
