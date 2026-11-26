# Sambo Store

Online shop for Sambo Store, a home-textiles store in Phnom Penh. Customers browse products,
fill a cart, pin their delivery location on a map and pay with ABA PayWay (KHQR). The store
owner gets every paid order on Telegram. The site also runs as a Telegram Mini App.

- **Site:** static HTML/CSS/JS, hosted on GitHub Pages
- **Shop register:** [`pos.html`](pos.html), a cash register for the real store, used on a tablet
  (see [Shop register](#shop-register))
- **Products:** a Google Sheet, published as an Apps Script web app
- **Payments and notifications:** a Cloudflare Worker in [`payway-worker/`](payway-worker/)

## Project structure

```
index.html              Page markup and modals
pos.html                Shop register (tablet)
css/
  base.css              Page basics, header, Telegram Mini App tweaks, toast
  catalog.css           Search, category bar, product cards
  modals.css            Shared modal styles, sign-up, cart, receipt, loading
  product-modal.css     Product detail modal
  store-info.css        Store info modal
  payment.css           Payment modal
  pos.css               Shop register
js/                     Plain scripts, loaded in this order from index.html
  config.js             URLs and settings
  utils.js              escapeHtml, price parsing/formatting, toast
  sheet.js              Reading product sheet rows and photo links (also used by pos.html)
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
  pos-*.js              Shop register, loaded by pos.html: core (API, logins, outbox), receipt,
                        catalog, bill, pay, sales (today's sales, records), app (start-up)
images/products/        Product photos (file names come from the sheet)
payway-worker/          Cloudflare Worker: pricing, PayWay, Telegram
  src/listings/         Telegram listing bot (template check, drafts, publishing)
  src/pos/              Shop register backend (passwords, sales book, day totals)
google-apps-script/     Script for the product sheet that lets the bot add rows
scripts/
  version-assets.mjs    Adds ?v=<hash> to the CSS/JS links in index.html and pos.html
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
versions in `index.html` and `pos.html` before committing:

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
```

Name, price (riel), category and stock are required; size (ទំហំ) is optional. The item number is
never typed: the sheet gives each new product the next free number, shown on the card once it's
published. The price label can be spelled តំម្តៃ, តម្លៃ or តំលៃ. English labels (`name`, `price`,
`size`, `category`, `stock`, `description`) and Khmer digits work too. If something is missing,
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

## Shop register

[`pos.html`](pos.html) is a cash register for the real store, made for a tablet (it works on a
phone or computer too). It adds up every bill, works out the change, and keeps every sale, so
the day's money can be checked against the records.

- **Products** come from the same Google Sheet as the website (name, photo, price). Search by
  name or item number. Stock is ignored. Items that aren't in the sheet can be typed by hand
  (**Other item**).
- **Prices can be changed** on the bill when a customer bargains, and the bill can get a
  discount. Every change from the sheet price shows up in the records as a discount.
- **Cash:** type the money received; the register shows the change. **ABA:** the cashier checks
  in the ABA app that the money arrived, then confirms. (Automatic ABA QR is a later step.)
- **Receipt** (English) for a small receipt printer: ⚙ → paper width (58 or 80 mm) and
  **Print a test receipt**. The register uses the tablet's normal print dialog, so the printer
  has to be reachable from it (many Bluetooth receipt printers need the maker's print app or
  a print-service app installed on the tablet first).
- **Today's sales:** reprint a receipt or cancel a sale (with a reason). A cancelled sale is
  never erased: it stays in the records, marked cancelled. Only today's sales can be cancelled.
- **Records** (owner password): any day's total, cash, ABA, number of sales, discounts given
  and cancelled sales, every sale with its items, and a **cash check**: type the cash that was
  in the drawer at opening and the cash counted now, and it shows if money is missing or extra.

Sales are saved on the tablet first, then sent to the Worker. If the internet drops, the top
bar shows "waiting to upload" and the sales go up by themselves when it's back. **Don't clear
the browser's data on the tablet while sales are waiting**, or they are lost.

The Worker works out every total and change itself; it doesn't take the tablet's word for them.
The sheet price that the records compare against is the one the tablet loaded.

**One-time setup**

1. Choose two passwords of at least 8 characters (longer is safer): one for the tablet, and a
   different one for the records (only for the owner). From `payway-worker/`:
   ```bash
   npx wrangler secret put POS_PASSWORD
   npx wrangler secret put POS_OWNER_PASSWORD
   ```
2. `npx wrangler deploy` (this adds the sales book; the online shop keeps working as before).
3. Once this is on `main`, open `https://hyper1708.github.io/Sombo-Store/pos.html` on the
   tablet, log in with the tablet password, and add the page to the home screen.

The tablet stays logged in for 30 days. The records ask for the owner password again after
30 minutes. Changing a password (step 1 again, then deploy) logs out every device that used it.
After 10 wrong passwords from one address, logins from there are blocked for 15 minutes.

## Going live

- [ ] In `wrangler.toml`, switch `PAYWAY_BASE_URL` to `https://checkout.payway.com.kh` and set
      the production `MERCHANT_ID`, then set the production `API_KEY` secret and redeploy
- [ ] Replace the placeholder store phone number in `index.html`
- [ ] Optionally set `GOOGLE_SHEETS_URL` in `js/config.js` to keep a copy of each order
