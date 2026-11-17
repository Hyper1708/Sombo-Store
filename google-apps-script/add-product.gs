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
    // Spaces around the password (easy to paste by accident) don't count
    var secret = String(PropertiesService.getScriptProperties().getProperty('SHEET_WRITE_SECRET') || '').trim();
    if (!secret) return json_({ ok: false, error: 'unauthorized: SHEET_WRITE_SECRET is not set in Script properties' });
    if (String(body.secret || '').trim() !== secret) return json_({ ok: false, error: 'unauthorized: password does not match' });
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
  var nameColumn = headers.indexOf('name');
  if (idColumn === -1) throw new Error('no "id" column in the header row');
  if (nameColumn === -1) throw new Error('no "name" column in the header row');

  var lastRow = sheet.getLastRow();
  var rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];

  // The id column may be filled by a formula (e.g. =SEQUENCE(200) in A2). Typing over any
  // of its cells breaks that formula for every row, so ids written by a formula are never touched.
  var idFormulas = lastRow > 1 ? sheet.getRange(2, idColumn + 1, lastRow - 1, 1).getFormulas() : [];
  var idsFromFormula = idFormulas.some(function (r) { return String(r[0]) !== ''; });

  // Rows numbered in advance (an id but no name) are filled first, keeping their number.
  // Only the product's own columns are written; the id cell is left as it is.
  for (var i = 0; i < rows.length; i++) {
    var id = rows[i][idColumn];
    if (String(id).trim() !== '' && String(rows[i][nameColumn]).trim() === '') {
      writeFields_(sheet, i + 2, headers, product);
      return id;
    }
  }

  if (idsFromFormula) {
    throw new Error('all numbered rows are used: extend the id formula in the sheet to add more numbers');
  }

  // Plain numbers and none free: add a row at the bottom with the next number
  var maxId = rows.reduce(function (max, row) { return Math.max(max, Number(row[idColumn]) || 0); }, 0);
  var newId = maxId + 1;
  sheet.appendRow(headers.map(function (h) {
    if (h === 'id') return newId;
    return Object.prototype.hasOwnProperty.call(product, h) ? product[h] : '';
  }));
  return newId;
}

/** Write the product's fields into one row, leaving the id cell and other columns alone. */
function writeFields_(sheet, rowNumber, headers, product) {
  headers.forEach(function (h, c) {
    if (h === 'id' || !Object.prototype.hasOwnProperty.call(product, h)) return;
    sheet.getRange(rowNumber, c + 1).setValue(product[h]);
  });
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
