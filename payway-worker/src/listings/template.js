// The listing template employees write under their photos, e.g.
//
//   ឈ្មោះ: ភួយរោមចៀម
//   តម្លៃ: 45000
//   ប្រភេទ: ភួយ
//   ស្តុក: 20
//   ពិពណ៌នា: ទំហំ 2x2.2m
//
// English labels (name, price, category, stock, description) work too.

export const MIN_PHOTOS = 3;
// Telegram albums hold at most 10 photos
export const MAX_PHOTOS = 10;

const LABELS = {
  name: ['ឈ្មោះ', 'name'],
  price: ['តម្លៃ', 'price'],
  category: ['ប្រភេទ', 'category'],
  // Both spellings of "stock" are common in Khmer
  stock: ['ស្តុក', 'ស្ដុក', 'stock', 'qty'],
  description: ['ពិពណ៌នា', 'description', 'desc']
};

const FIELDS = Object.keys(LABELS);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LINE_RE = new RegExp(
  '^[\\s#*•\\-]*(' + Object.values(LABELS).flat().map(escapeRe).join('|') + ')(?![a-z])\\s*[:：=\\-–]?\\s*(.*)$',
  'i'
);
const fieldOf = (label) => FIELDS.find(f => LABELS[f].some(l => l.toLowerCase() === label.toLowerCase()));

/** Khmer digits (០–៩) → 0–9, so "៤៥០០០" reads as 45000. */
export const toAsciiDigits = (s) => String(s).replace(/[០-៩]/g, d => String(d.charCodeAt(0) - 0x17E0));

/** Pull the labelled lines out of a caption. Unlabelled lines after "description" belong to it. */
export function parseCaption(text) {
  const fields = {};
  let current = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(LINE_RE);
    if (match) {
      current = fieldOf(match[1]);
      fields[current] = match[2].trim();
    } else if (current === 'description') {
      fields.description = fields.description ? `${fields.description}\n${line}` : line;
    }
  }
  return fields;
}

/** "45000", "45,000៛", "៤៥០០០", "45k", "45000 រៀល" → 45000 (riel). */
export function parsePriceText(raw) {
  const s = toAsciiDigits(raw).toLowerCase().replace(/[\s,]/g, '');
  if (!s) return { error: 'missing' };
  if (s.includes('$') || s.includes('usd') || s.includes('ដុល្លារ')) return { error: 'currency' };
  const m = s.match(/^(\d+(?:\.\d+)?)(k)?(?:៛|រៀល|riel|khr|r)?$/);
  if (!m) return { error: 'invalid' };
  const value = Math.round(Number(m[1]) * (m[2] ? 1000 : 1));
  if (!(value >= 100 && value <= 50_000_000)) return { error: 'invalid' };
  return { value };
}

export function parseStockText(raw) {
  const s = toAsciiDigits(raw).replace(/[\s,]/g, '');
  if (!s) return { error: 'missing' };
  if (!/^\d+$/.test(s) || Number(s) > 1_000_000) return { error: 'invalid' };
  return { value: Number(s) };
}

const oneLine = (v) => String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Check a listing. Returns what is missing or wrong, plus the clean values when it is complete.
 * invalid entries look like { field: 'price', reason: 'currency' }.
 */
export function checkListing(fields, photoCount) {
  const missing = [];
  const invalid = [];
  const values = {};

  const name = oneLine(fields.name);
  if (!name) missing.push('name');
  else if (name.length > 100) invalid.push({ field: 'name', reason: 'long' });
  else values.name = name;

  if (!oneLine(fields.price)) missing.push('price');
  else {
    const price = parsePriceText(fields.price);
    if (price.error) invalid.push({ field: 'price', reason: price.error });
    else values.price = price.value;
  }

  const category = oneLine(fields.category);
  if (!category) missing.push('category');
  else if (category.length > 40) invalid.push({ field: 'category', reason: 'long' });
  else values.category = category;

  if (!oneLine(fields.stock)) missing.push('stock');
  else {
    const stock = parseStockText(fields.stock);
    if (stock.error) invalid.push({ field: 'stock', reason: stock.error });
    else values.stock = stock.value;
  }

  values.description = String(fields.description ?? '')
    .replace(/[<>]/g, '')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
    .slice(0, 1000);

  const photosOk = photoCount >= MIN_PHOTOS && photoCount <= MAX_PHOTOS;
  return {
    complete: photosOk && missing.length === 0 && invalid.length === 0,
    missing, invalid, photosOk, photoCount, values
  };
}

/** Fields that still need an answer, in template order. */
export const fieldsToFix = (check) => FIELDS.filter(f =>
  check.missing.includes(f) || check.invalid.some(i => i.field === f));
