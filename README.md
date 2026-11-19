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
  src/listings/         Telegram listing bot (template check, drafts, publishing)
google-apps-script/     Script for the product sheet that lets the bot add rows
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
| `images`      | `photo_1.jpg\|photo_2.jpg`       | File names in `images/products/`, Google Drive links, or other `https://` links, `\|`-separated |
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

## Listing bot

Employees post new products in a private staff group on Telegram. The bot checks each post,
asks in Khmer for anything missing, and gives admins a Publish button. Publishing saves the
photos in a Google Drive folder ("Sambo product photos"), adds the row to the product sheet and
posts the album in the sales channel with a link to the item.

**Template** (one album of 3–10 photos, with this caption):

```
ឈ្មោះ : កន្សែងពោះគោ
តំម្តៃ : 18000
ទំហំ : 2m x 1.8m
ប្រភេទ: កន្សែង
ស្តុក: 500
លេខ: 33
```

Name, price (riel), category and stock are required. Size (ទំហំ) and the item number (លេខ) are
optional: without a number the sheet gives the next free one, and a number another product already
uses is refused. The price label can be spelled តំម្តៃ, តម្លៃ or តំលៃ. English labels (`name`, `price`,
`size`, `category`, `stock`, `id`, `description`) and Khmer digits work too. If something is missing,
reply to the bot's message with just those lines (or edit the caption).

Sizes go in a `size` column if the sheet has one (the website then shows "Size: …" in the product
popup); otherwise they're added to the start of the description.

The draft card has three buttons for group admins: **✅ ផ្សាយ** (publish), **✏️ កែប្រែ** (edit) and
**🗑 បោះបង់** (discard). To edit, tap ✏️ (or reply to the card) with just the lines to change,
e.g. `តំម្តៃ: 20000`. Photos can't be edited; discard and post the album again.

**One-time setup**

1. Telegram: create the private staff group, add the employees, and make the bot an admin of
   the staff group and of the sales channel (with "Post messages").
2. Google Sheet: paste [`google-apps-script/add-product.gs`](google-apps-script/add-product.gs)
   into the sheet's Apps Script and follow the steps at the top of the file (it asks once for
   access to Sheets and Drive).
3. Secrets (from `payway-worker/`):
   ```bash
   npx wrangler secret put SHEET_WRITE_SECRET
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   ```
   `SHEET_WRITE_SECRET` must be the same password as in the Apps Script. The webhook secret can
   be any long random string (letters, digits, `_` and `-`).
4. `npx wrangler deploy`, then point the bot at the Worker (once):
   ```bash
   curl -X POST https://sambo-store-pay.sambo-store.workers.dev/api/telegram/setup \
        -H "Content-Type: application/json" -d '{"secret":"<TELEGRAM_WEBHOOK_SECRET>"}'
   ```
5. Send `/chatid` in the staff group and in the channel, put the ids in `STAFF_CHAT_ID` and
   `CHANNEL_CHAT_ID` in `wrangler.toml`, and deploy again.

To keep photos in Cloudflare R2 instead of Google Drive, see the comment above the R2 lines in
`payway-worker/wrangler.toml`. Existing rows keep working either way: the `images` column can
mix file names, Drive links and R2 links.

## Going live

- [ ] In `wrangler.toml`, switch `PAYWAY_BASE_URL` to `https://checkout.payway.com.kh` and set
      the production `MERCHANT_ID`, then set the production `API_KEY` secret and redeploy
- [ ] Replace the placeholder store phone number in `index.html`
- [ ] Optionally set `GOOGLE_SHEETS_URL` in `js/config.js` to keep a copy of each order
