// Small wrapper around the Telegram Bot API.

export async function telegram(env, method, payload = {}) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok) throw new Error(`${method}: ${data.description || 'failed'}`);
  return data.result;
}

/** Download a file someone sent to the bot (Telegram keeps it; we fetch the bytes). */
export async function downloadFile(env, fileId) {
  const file = await telegram(env, 'getFile', { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
  if (!res.ok) throw new Error(`photo download failed (HTTP ${res.status})`);
  return res.arrayBuffer();
}

export const displayName = (user) =>
  [user?.first_name, user?.last_name].filter(Boolean).join(' ') || (user?.username ? `@${user.username}` : 'Unknown');

/** Who posted a message: the person, or the group/channel name when posted anonymously. */
export const senderName = (msg) => msg.sender_chat?.title || displayName(msg.from);
