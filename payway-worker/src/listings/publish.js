// Publishing an approved listing: photos into R2, a row in the Google Sheet,
// and an album in the sales channel.

import { telegram, downloadFile } from './telegram.js';
import { channelCaption } from './messages.js';

const publicUrl = (env) => String(env.PUBLIC_URL || '').replace(/\/+$/, '');

export function productLink(env, id) {
  const url = new URL(env.SITE_URL);
  url.searchParams.set('item', String(id));
  return url.toString();
}

/** Copy the photos from Telegram into the R2 bucket; returns their public URLs. */
async function storePhotos(env, draftId, photos) {
  if (!env.PHOTOS) throw new Error('photo storage (R2) is not set up');
  const urls = [];
  for (const [i, photo] of photos.entries()) {
    const key = `products/${draftId}-${i + 1}.jpg`;
    const bytes = await downloadFile(env, photo.file_id);
    await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    urls.push(`${publicUrl(env)}/photos/${key}`);
  }
  return urls;
}

/** Ask the Google Apps Script to add the product row; it answers with the new item id. */
async function addSheetRow(env, product) {
  if (!env.PRODUCTS_URL || !env.SHEET_WRITE_SECRET) throw new Error('the Google Sheet is not connected');
  const res = await fetch(env.PRODUCTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.SHEET_WRITE_SECRET, action: 'addProduct', product })
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`the Google Sheet did not answer (HTTP ${res.status})`);
  if (!data.ok || data.id == null) throw new Error(`Google Sheet: ${data.error || 'row not added'}`);
  return data.id;
}

export async function publishListing(env, draftId, draft) {
  const { values } = draft;
  const urls = await storePhotos(env, draftId, draft.photos);

  const id = await addSheetRow(env, {
    name: values.name,
    category: values.category,
    pricess: `${values.price}៛`,
    stock: values.stock,
    description: values.description,
    images: urls.join('|')
  });
  const link = productLink(env, id);

  // The item is live on the website now; a failed channel post is reported, not fatal
  let channelPosted = false;
  let channelError = null;
  if (env.CHANNEL_CHAT_ID) {
    try {
      await telegram(env, 'sendMediaGroup', {
        chat_id: env.CHANNEL_CHAT_ID,
        media: draft.photos.map((photo, i) => ({
          type: 'photo',
          media: photo.file_id,
          ...(i === 0 ? { caption: channelCaption(values, id, link), parse_mode: 'HTML' } : {})
        }))
      });
      channelPosted = true;
    } catch (err) {
      channelError = err.message;
    }
  }

  return { id, link, urls, channelPosted, channelError };
}
