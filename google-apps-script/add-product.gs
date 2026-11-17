/**
 * Lets the listing bot add products to this sheet, with their photos saved in Google Drive.
 *
 * Paste this into the same Apps Script project that already serves the products
 * (it adds doPost next to your existing doGet), then:
 *   1. Project Settings (gear icon) → Script properties → Add property
 *        SHEET_WRITE_SECRET = the same password you gave the Worker
 *   2. Deploy → Manage deployments → edit (pencil) → Version: "New version" → Deploy
 *      Editing the existing deployment keeps the same web app URL.
 *      Google asks once to allow access to Sheets and Drive: allow it.
 *
 * The bot sends { secret, action: "addProduct", product: { name, category, pricess, stock,
 * description }, photos: [{ name, mimeType, data (base64) }] } and gets back
 * { ok: true, id, images } with the new item id and the photo links.
 */

// Leave empty if this script is attached to the product spreadsheet (Extensions → Apps Script).
// Otherwise put the spreadsheet id from its URL: docs.google.com/spreadsheets/d/<THIS PART>/edit
var SPREADSHEET_ID = '';
// Leave empty to use the first tab, or put the tab name that holds the products.
var PRODUCTS_TAB = '';
// Drive folder for product photos (created on first use, in your My Drive).
var PHOTO_FOLDER_NAME = 'Sambo product photos';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SHEET_WRITE_SECRET');
    if (!secret || body.secret !== secret) return json_({ ok: false, error: 'unauthorized' });
    if (body.action !== 'addProduct' || !body.product) return json_({ ok: false, error: 'unknown action' });

    var product = body.product;
    if (body.photos && body.photos.length) {
      if (body.photos.length > 10) return json_({ ok: false, error: 'too many photos' });
      product.images = savePhotos_(body.photos).join('|');
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var id = addProduct_(product);
      return json_({ ok: true, id: id, images: product.images || '' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** Save photos in the Drive folder, readable by anyone with the link, and return image links. */
function savePhotos_(photos) {
  var folder = photoFolder_();
  return photos.map(function (photo) {
    var blob = Utilities.newBlob(Utilities.base64Decode(photo.data), photo.mimeType || 'image/jpeg', photo.name || 'photo.jpg');
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://lh3.googleusercontent.com/d/' + file.getId();
  });
}

function photoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty('PHOTO_FOLDER_ID');
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (err) { /* deleted: make a new one */ }
  }
  var found = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
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
