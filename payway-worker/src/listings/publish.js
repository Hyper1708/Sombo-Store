// Publishing an approved listing: store the photos, add the row to the Google Sheet,
// and post the album in the sales channel.
//
// Photos go to Google Drive by default: the sheet's Apps Script saves them in a Drive
// folder and fills in the images column. If an R2 bucket is bound as PHOTOS (see
// wrangler.toml), photos are stored there instead and served from /photos/.

import { telegram, downloadFile } from './telegram.js';
import { channelCaption } from './messages.js';

const publicUrl = (env) => String(env.PUBLIC_URL || '').replace(/\/+$/, '');

export function productLink(env, id) {
  const url = new URL(env.SITE_URL);
  url.searchParams.set('item', String(id));
  return url.toString();
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function storePhotosInR2(env, draftId, files) {
  const urls = [];
  for (const [i, bytes] of files.entries()) {
    const key = `products/${draftId}-${i + 1}.jpg`;
    await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    urls.push(`${publicUrl(env)}/photos/${key}`);
  }
  return urls;
}

/** Send a request to the product sheet's Apps Script (see google-apps-script/add-product.gs). */
async function callSheet(env, payload) {
  if (!env.PRODUCTS_URL || !env.SHEET_WRITE_SECRET) throw new Error('the Google Sheet is not connected');
  const res = await fetch(env.PRODUCTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.SHEET_WRITE_SECRET, ...payload })
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`the Google Sheet did not answer (HTTP ${res.status})`);
  if (!data.ok || data.id == null) throw new Error(`Google Sheet: ${data.error || 'row not added'}`);
  return data;
}

export async function publishListing(env, draftId, draft) {
  const { values } = draft;
  const files = [];
  for (const photo of draft.photos) files.push(await downloadFile(env, photo.file_id));

  const product = {
    name: values.name,
    category: values.category,
    pricess: `${values.price}៛`,
    size: values.size || '',
    stock: values.stock,
    description: values.description
    // No id: the sheet script gives the next free number
  };

  let saved;
  if (env.PHOTOS) {
    product.images = (await storePhotosInR2(env, draftId, files)).join('|');
    saved = await callSheet(env, { action: 'addProduct', product });
  } else {
    saved = await callSheet(env, {
      action: 'addProduct',
      product,
      photos: files.map((bytes, i) => ({ name: `${draftId}-${i + 1}.jpg`, mimeType: 'image/jpeg', data: toBase64(bytes) }))
    });
  }

  const id = saved.id;
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

  return { id, link, channelPosted, channelError };
}
