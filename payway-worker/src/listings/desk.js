// The listing desk: one Durable Object that handles everything posted in the staff group.
//
//  1. Employees post an album (3–6 photos) with the template caption.
//  2. Album photos arrive one by one, so they are collected and checked a moment later.
//  3. Missing or wrong info → the bot replies in Khmer; a reply to that message fixes it.
//  4. A complete listing becomes a draft card with Publish / Edit / Discard buttons for admins.
//     Edit (or replying to the card) changes fields before publishing.
//  5. Publish → photos to Google Drive (or R2), row in the Google Sheet, album in the channel.
//
// Being a single object means every update is handled one at a time, in order.

import { parseCaption, checkListing, fieldsToFix } from './template.js';
import {
  problemsText, COMPLETE_TEXT, draftCardText, draftButtons,
  publishedText, discardedText, publishFailedText, ANSWER,
  editPromptText, editDoneText, editProblemsText, EDIT_HINT_TEXT
} from './messages.js';
import { telegram, displayName, senderName } from './telegram.js';
import { publishListing } from './publish.js';

const ALBUM_SETTLE_MS = 2500;

export class ListingDesk {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
  }

  async fetch(request) {
    try {
      await this.handleUpdate(await request.json());
    } catch (err) {
      console.error('listing desk:', err.stack || err.message);
    }
    return new Response('ok');
  }

  // Runs shortly after the last photo of an album arrived
  async alarm() {
    const now = Date.now();
    let stillArriving = false;
    for (const [key, album] of await this.storage.list({ prefix: 'album:' })) {
      if (now - album.lastAt < ALBUM_SETTLE_MS - 100) {
        stillArriving = true;
        continue;
      }
      await this.storage.delete(key);
      album.photos.sort((a, b) => a.message_id - b.message_id);
      try {
        await this.checkPost(album);
      } catch (err) {
        console.error('listing desk album:', err.stack || err.message);
      }
    }
    if (stillArriving) await this.storage.setAlarm(now + 1000);
  }

  tg(method, payload) {
    return telegram(this.env, method, payload);
  }

  async handleUpdate(update) {
    if (update.callback_query) return this.onButton(update.callback_query);

    const msg = update.message || update.edited_message || update.channel_post;
    if (!msg) return;

    // Setup helper: tells you a chat's id so it can go into wrangler.toml
    if (/^\/chatid(@\w+)?(\s|$)/i.test(msg.text || '')) {
      return this.tg('sendMessage', { chat_id: msg.chat.id, text: `Chat ID: <code>${msg.chat.id}</code>`, parse_mode: 'HTML' });
    }

    const staffChat = await this.staffChatId();
    if (await this.followUpgrade(msg, staffChat)) return;
    if (!staffChat || String(msg.chat.id) !== staffChat) return;

    if (update.edited_message) return this.onEdit(msg);
    if (msg.photo) return this.onPhoto(msg);
    if (msg.text && msg.reply_to_message) return this.onReply(msg);
  }

  /**
   * The staff group from wrangler.toml, or its new id after Telegram upgraded it.
   * The upgrade is only followed while STAFF_CHAT_ID still names the old group.
   */
  async staffChatId() {
    const configured = String(this.env.STAFF_CHAT_ID || '');
    const upgrade = await this.storage.get('staffChatUpgrade');
    return upgrade && upgrade.from === configured ? upgrade.to : configured;
  }

  /**
   * Telegram turns a basic group into a supergroup (with a new chat id) when some settings
   * change. It announces this in both chats; remember the new id so the bot keeps working.
   */
  async followUpgrade(msg, staffChat) {
    const configured = String(this.env.STAFF_CHAT_ID || '');
    let to = null;
    if (msg.migrate_to_chat_id && String(msg.chat.id) === staffChat) to = String(msg.migrate_to_chat_id);
    if (msg.migrate_from_chat_id && String(msg.migrate_from_chat_id) === staffChat) to = String(msg.chat.id);
    if (!to || !configured) return false;
    await this.storage.put('staffChatUpgrade', { from: configured, to });
    console.log(`staff group upgraded: ${staffChat} → ${to} (update STAFF_CHAT_ID in wrangler.toml)`);
    return true;
  }

  async onPhoto(msg) {
    const largest = msg.photo[msg.photo.length - 1];
    const photo = { file_id: largest.file_id, message_id: msg.message_id };
    const from = senderName(msg);

    if (!msg.media_group_id) {
      return this.checkPost({ chatId: msg.chat.id, postId: msg.message_id, photos: [photo], caption: msg.caption || '', from });
    }

    const key = `album:${msg.media_group_id}`;
    const album = (await this.storage.get(key)) ||
      { chatId: msg.chat.id, postId: msg.message_id, photos: [], caption: '', from };
    album.photos.push(photo);
    if (msg.caption) album.caption = msg.caption;
    album.postId = Math.min(album.postId, msg.message_id);
    album.lastAt = Date.now();
    await this.storage.put(key, album);
    await this.storage.setAlarm(Date.now() + ALBUM_SETTLE_MS);
  }

  /** First look at a new post (single photo or a whole album). */
  async checkPost(post) {
    const fields = parseCaption(post.caption);
    const check = checkListing(fields, post.photos.length);
    if (check.complete) return this.createDraft(post, check.values);

    const reply = await this.tg('sendMessage', {
      chat_id: post.chatId,
      text: problemsText(check),
      parse_mode: 'HTML',
      reply_parameters: { message_id: post.postId, allow_sending_without_reply: true }
    });
    // Wrong number of photos can only be fixed by posting again
    if (!check.photosOk) return;

    await this.storage.put(`pending:${reply.message_id}`, { ...post, fields });
    for (const photo of post.photos) await this.storage.put(`post:${photo.message_id}`, reply.message_id);
  }

  /** A reply to the bot's "missing info" message, to the post itself, or to a draft card / edit prompt. */
  async onReply(msg) {
    const target = msg.reply_to_message.message_id;

    const editDraftId = (await this.storage.get(`edit:${target}`)) || (await this.findDraftByCard(target));
    if (editDraftId) return this.onDraftEdit(msg, editDraftId, target);

    const botMsgId = (await this.storage.get(`pending:${target}`)) ? target : await this.storage.get(`post:${target}`);
    const pending = botMsgId && (await this.storage.get(`pending:${botMsgId}`));
    if (!pending) return;

    const added = parseCaption(msg.text);
    if (Object.keys(added).length === 0) {
      // A bare answer like "45000" counts when exactly one thing was asked for
      const open = fieldsToFix(checkListing(pending.fields, pending.photos.length));
      if (open.length === 1) added[open[0]] = msg.text.trim();
    }
    pending.fields = { ...pending.fields, ...added };
    return this.recheck(botMsgId, pending);
  }

  /** The employee edited the caption of a post the bot complained about. */
  async onEdit(msg) {
    if (msg.caption == null) return;
    const botMsgId = await this.storage.get(`post:${msg.message_id}`);
    const pending = botMsgId && (await this.storage.get(`pending:${botMsgId}`));
    if (!pending) return;
    pending.fields = { ...pending.fields, ...parseCaption(msg.caption) };
    return this.recheck(botMsgId, pending);
  }

  async recheck(botMsgId, pending) {
    const check = checkListing(pending.fields, pending.photos.length);
    if (!check.complete) {
      await this.storage.put(`pending:${botMsgId}`, pending);
      return this.editText(pending.chatId, botMsgId, problemsText(check));
    }
    await this.storage.delete(`pending:${botMsgId}`);
    for (const photo of pending.photos) await this.storage.delete(`post:${photo.message_id}`);
    await this.editText(pending.chatId, botMsgId, COMPLETE_TEXT);
    return this.createDraft(pending, check.values);
  }

  async createDraft(post, values) {
    const draftId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const draft = {
      chatId: post.chatId, postId: post.postId, photos: post.photos, from: post.from,
      values, isNewCategory: await this.isNewCategory(values.category), status: 'waiting'
    };
    const card = await this.tg('sendMessage', {
      chat_id: post.chatId,
      text: draftCardText(draft),
      parse_mode: 'HTML',
      reply_parameters: { message_id: post.postId, allow_sending_without_reply: true },
      reply_markup: draftButtons(draftId)
    });
    draft.cardId = card.message_id;
    await this.storage.put(`draft:${draftId}`, draft);
  }

  async findDraftByCard(cardId) {
    for (const [key, draft] of await this.storage.list({ prefix: 'draft:' })) {
      if (draft.cardId === cardId) return key.slice('draft:'.length);
    }
    return null;
  }

  replyTo(msg, text) {
    return this.tg('sendMessage', {
      chat_id: msg.chat.id,
      text,
      parse_mode: 'HTML',
      reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true }
    });
  }

  /** An admin changes fields of a waiting draft, e.g. "តម្លៃ: 20000" or "ប្រភេទ: កន្សែង". */
  async onDraftEdit(msg, draftId, target) {
    const key = `draft:${draftId}`;
    const draft = await this.storage.get(key);
    if (!draft || draft.status !== 'waiting') return; // already published or discarded
    if (!(await this.isAdmin(draft.chatId, msg.from?.id))) return this.replyTo(msg, ANSWER.adminsOnly);

    const changes = parseCaption(msg.text);
    const changed = Object.keys(changes);
    if (changed.length === 0) return this.replyTo(msg, EDIT_HINT_TEXT);

    const v = draft.values;
    const check = checkListing({
      name: v.name, price: String(v.price), category: v.category, stock: String(v.stock),
      description: v.description, ...changes
    }, draft.photos.length);
    if (!check.complete) return this.replyTo(msg, editProblemsText(check));

    draft.values = check.values;
    if ('category' in changes) draft.isNewCategory = await this.isNewCategory(draft.values.category);
    await this.storage.put(key, draft);
    await this.editCard(draft, draftCardText(draft), draftButtons(draftId));

    // Turn the edit prompt into the confirmation, or answer the reply to the card
    if (await this.storage.get(`edit:${target}`)) {
      await this.storage.delete(`edit:${target}`);
      return this.editText(draft.chatId, target, editDoneText(changed));
    }
    return this.replyTo(msg, editDoneText(changed));
  }

  /** Flag categories the website doesn't have yet, so typos are caught before publishing. */
  async isNewCategory(category) {
    try {
      const res = await fetch(this.env.PRODUCTS_URL);
      const rows = await res.json();
      const norm = (c) => String(c ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      const known = new Set(rows.map(r => {
        const key = Object.keys(r).find(k => k.trim().toLowerCase() === 'category');
        return norm(key ? r[key] : '');
      }));
      return !known.has(norm(category));
    } catch {
      return false; // can't tell; don't block anything
    }
  }

  async onButton(cb) {
    const [action, draftId] = String(cb.data || '').split(':');
    const answer = (text, showAlert = false) =>
      this.tg('answerCallbackQuery', { callback_query_id: cb.id, text, show_alert: showAlert }).catch(() => {});

    const key = `draft:${draftId}`;
    const draft = await this.storage.get(key);
    if (!draft) return answer(ANSWER.done);
    if (!(await this.isAdmin(draft.chatId, cb.from.id))) return answer(ANSWER.adminsOnly, true);
    if (draft.status !== 'waiting') return answer(ANSWER.busy);

    const adminName = displayName(cb.from);

    if (action === 'del') {
      await this.storage.delete(key);
      await answer(ANSWER.discarded);
      return this.editCard(draft, discardedText(draft, adminName));
    }
    if (action === 'edit') {
      await answer(ANSWER.editing);
      const prompt = await this.tg('sendMessage', {
        chat_id: draft.chatId,
        text: editPromptText(draft, cb.from.id, adminName),
        parse_mode: 'HTML',
        reply_parameters: { message_id: draft.cardId, allow_sending_without_reply: true },
        reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'តម្លៃ: 20000' }
      });
      return this.storage.put(`edit:${prompt.message_id}`, draftId);
    }
    if (action !== 'pub') return answer(ANSWER.done);

    draft.status = 'publishing';
    await this.storage.put(key, draft);
    await answer(ANSWER.publishing);

    try {
      const outcome = await publishListing(this.env, draftId, draft);
      await this.storage.delete(key);
      await this.editCard(draft, publishedText(draft, adminName, outcome));
    } catch (err) {
      console.error('publish failed:', err.message);
      draft.status = 'waiting';
      await this.storage.put(key, draft);
      await this.editCard(draft, publishFailedText(draft, err.message), draftButtons(draftId));
    }
  }

  async isAdmin(chatId, userId) {
    try {
      const member = await this.tg('getChatMember', { chat_id: chatId, user_id: userId });
      return member.status === 'creator' || member.status === 'administrator';
    } catch {
      return false;
    }
  }

  editText(chatId, messageId, text, replyMarkup) {
    return this.tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    }).catch(err => console.error('edit failed:', err.message)); // e.g. "message is not modified"
  }

  editCard(draft, text, replyMarkup) {
    return this.editText(draft.chatId, draft.cardId, text, replyMarkup);
  }
}
