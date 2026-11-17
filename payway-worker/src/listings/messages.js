// Everything the listing bot says, in Khmer. Messages use Telegram's HTML formatting.

import { MIN_PHOTOS, MAX_PHOTOS, fieldsToFix } from './template.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
export const formatKHR = (n) => Math.round(n).toLocaleString('en-US') + '៛';

const FIELD_KH = { name: 'ឈ្មោះ', price: 'តម្លៃ', category: 'ប្រភេទ', stock: 'ស្តុក', description: 'ពិពណ៌នា' };

const EXAMPLE = {
  name: 'ឈ្មោះ: ភួយរោមចៀម',
  price: 'តម្លៃ: 45000',
  category: 'ប្រភេទ: ភួយ',
  stock: 'ស្តុក: 20'
};

const PROBLEM = {
  'name:long': 'ឈ្មោះវែងពេក (យ៉ាងច្រើន 100 តួអក្សរ)',
  'price:invalid': 'តម្លៃមិនត្រឹមត្រូវ — សរសេរជាលេខរៀល ឧ. 45000',
  'price:currency': 'តម្លៃត្រូវជាប្រាក់រៀល (៛) មិនមែនដុល្លារ',
  'category:long': 'ប្រភេទវែងពេក (យ៉ាងច្រើន 40 តួអក្សរ)',
  'stock:invalid': 'ស្តុកមិនត្រឹមត្រូវ — សរសេរជាលេខ ឧ. 20'
};

/** Reply to a post that is missing information or has mistakes. */
export function problemsText(check) {
  const lines = ['⚠️ <b>ព័ត៌មានមិនទាន់គ្រប់គ្រាន់</b>'];
  if (check.missing.length) {
    lines.push(`• ខ្វះ៖ ${check.missing.map(f => FIELD_KH[f]).join(', ')}`);
  }
  for (const { field, reason } of check.invalid) {
    lines.push(`• ${PROBLEM[`${field}:${reason}`] || `${FIELD_KH[field]}មិនត្រឹមត្រូវ`}`);
  }
  if (!check.photosOk) {
    lines.push(`• រូបភាពត្រូវមានពី ${MIN_PHOTOS} ដល់ ${MAX_PHOTOS} សន្លឹក (ឥឡូវមាន ${check.photoCount})`);
    lines.push('', '📷 សូមផ្ញើរូបភាព និងព័ត៌មានម្តងទៀត ជា album តែមួយ');
  } else {
    const first = fieldsToFix(check)[0];
    lines.push('', '✍️ សូមឆ្លើយតប (Reply) សារនេះ ដោយសរសេរតែបន្ទាត់ដែលខ្វះ ឧ.', `<code>${esc(EXAMPLE[first] || 'តម្លៃ: 45000')}</code>`);
  }
  return lines.join('\n');
}

export const COMPLETE_TEXT = '✅ ព័ត៌មានគ្រប់គ្រាន់ហើយ — បានផ្ញើទៅអ្នកគ្រប់គ្រងដើម្បីអនុម័ត';

/** The card admins approve or discard. */
export function draftCardText(draft) {
  const v = draft.values;
  return [
    '📦 <b>ទំនិញថ្មី — រង់ចាំការអនុម័ត</b>',
    `ឈ្មោះ: <b>${esc(v.name)}</b>`,
    `តម្លៃ: ${formatKHR(v.price)}`,
    `ប្រភេទ: ${esc(v.category)}${draft.isNewCategory ? ' <i>(ប្រភេទថ្មី)</i>' : ''}`,
    `ស្តុក: ${v.stock}`,
    v.description ? `ពិពណ៌នា: ${esc(v.description)}` : null,
    `📷 រូបភាព: ${draft.photos.length} សន្លឹក`,
    `👤 ផ្ញើដោយ: ${esc(draft.from)}`
  ].filter(Boolean).join('\n');
}

export const draftButtons = (draftId) => ({
  inline_keyboard: [[
    { text: '✅ ផ្សាយ', callback_data: `pub:${draftId}` },
    { text: '🗑 បោះបង់', callback_data: `del:${draftId}` }
  ]]
});

export function publishedText(draft, adminName, outcome) {
  const lines = [
    draftCardText(draft).replace('រង់ចាំការអនុម័ត', 'បានផ្សាយ'),
    '',
    `✅ <b>បានផ្សាយ</b>ដោយ ${esc(adminName)} · លេខកូដ #${esc(outcome.id)}`,
    `🌐 <a href="${esc(outcome.link)}">មើលនៅលើគេហទំព័រ</a>`
  ];
  if (outcome.channelPosted) lines.push('📣 បានបង្ហោះក្នុង Channel ហើយ');
  if (outcome.channelError) lines.push(`⚠️ បង្ហោះក្នុង Channel មិនបាន៖ ${esc(outcome.channelError)}`);
  return lines.join('\n');
}

export const discardedText = (draft, adminName) =>
  `${draftCardText(draft).replace('រង់ចាំការអនុម័ត', 'បានបោះបង់')}\n\n🗑 <b>បានបោះបង់</b>ដោយ ${esc(adminName)}`;

export const publishFailedText = (draft, error) =>
  `${draftCardText(draft)}\n\n❌ ផ្សាយមិនបានសម្រេច៖ ${esc(error)}\nសូមចុច ✅ ផ្សាយ ម្តងទៀត`;

export const ANSWER = {
  done: 'ទំនិញនេះត្រូវបានដោះស្រាយរួចហើយ',
  adminsOnly: '⛔ សម្រាប់តែអ្នកគ្រប់គ្រងប៉ុណ្ណោះ',
  busy: '⏳ កំពុងដំណើរការ...',
  publishing: '⏳ កំពុងផ្សាយ...',
  discarded: '🗑 បានបោះបង់'
};

/** Caption of the album the bot posts in the sales channel (Telegram allows 1024 characters). */
export function channelCaption(values, id, link) {
  const head = [
    `🛍 <b>${esc(values.name)}</b>`,
    `💰 តម្លៃ: ${formatKHR(values.price)}`,
    `📦 លេខកូដ: #${esc(id)}`
  ].join('\n');
  const foot = `🛒 <a href="${esc(link)}">បញ្ជាទិញនៅលើគេហទំព័រ</a>`;
  let description = esc(values.description || '');
  const room = 1000 - head.length - foot.length;
  if (description.length > room) description = description.slice(0, Math.max(0, room - 1)) + '…';
  return [head, description, foot].filter(Boolean).join('\n\n');
}
