/**
 * Lets the listing bot add product rows to this sheet.
 *
 * Paste this into the same Apps Script project that already serves the products
 * (it adds doPost next to your existing doGet), then:
 *   1. Project Settings (gear icon) → Script properties → Add property
 *        SHEET_WRITE_SECRET = the same password you gave the Worker
 *   2. Deploy → Manage deployments → edit (pencil) → Version: "New version" → Deploy
 *      Editing the existing deployment keeps the same web app URL.
 *
 * The bot sends { secret, action: "addProduct", product: { name, category, pricess,
 * stock, description, images } } and gets back { ok: true, id } with the new item id.
 */

// Leave empty if this script is attached to the product spreadsheet (Extensions → Apps Script).
// Otherwise put the spreadsheet id from its URL: docs.google.com/spreadsheets/d/<THIS PART>/edit
var SPREADSHEET_ID = '';
// Leave empty to use the first tab, or put the tab name that holds the products.
var PRODUCTS_TAB = '';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SHEET_WRITE_SECRET');
    if (!secret || body.secret !== secret) return json_({ ok: false, error: 'unauthorized' });
    if (body.action !== 'addProduct' || !body.product) return json_({ ok: false, error: 'unknown action' });

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      return json_({ ok: true, id: addProduct_(body.product) });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function addProduct_(product) {
  var book = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('set SPREADSHEET_ID at the top of add-product.gs');
  var sheet = PRODUCTS_TAB ? book.getSheetByName(PRODUCTS_TAB) : book.getSheets()[0];
  if (!sheet) throw new Error('tab "' + PRODUCTS_TAB + '" not found');

  // Match columns by their header, whatever their order or capitalisation
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var idColumn = headers.indexOf('id');
  if (idColumn === -1) throw new Error('no "id" column in the header row');

  // New id = highest existing id + 1
  var lastRow = sheet.getLastRow();
  var ids = lastRow > 1 ? sheet.getRange(2, idColumn + 1, lastRow - 1, 1).getValues() : [];
  var maxId = ids.reduce(function (max, row) { return Math.max(max, Number(row[0]) || 0); }, 0);
  var id = maxId + 1;

  product.id = id;
  var row = headers.map(function (h) {
    return Object.prototype.hasOwnProperty.call(product, h) ? product[h] : '';
  });
  sheet.appendRow(row);
  return id;
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
