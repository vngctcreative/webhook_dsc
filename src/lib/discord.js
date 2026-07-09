/**
 * Discord Webhook API helpers — aligned with Discord docs + Discohook behaviour.
 * https://discord.com/developers/docs/resources/webhook
 */

export const LIMITS = {
  content: 2000,
  username: 80,
  embedTitle: 256,
  embedDescription: 4096,
  embedFields: 25,
  embedFieldName: 256,
  embedFieldValue: 1024,
  embedFooter: 2048,
  embedAuthor: 256,
  embeds: 10,
  embedsTotal: 6000,
  componentRows: 5,
  buttonsPerRow: 5,
}

export function extractWebhookParts(url) {
  if (!url) return null
  const m = String(url).match(/discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/(\d+)\/([^/\s?#]+)/i)
  return m ? { id: m[1], token: m[2] } : null
}

export function extractMessageId(link) {
  if (!link) return null
  const m = String(link).match(/(?:channels\/\d+\/\d+\/)?(\d{17,20})\s*$/)
  return m ? m[1] : null
}

export function extractThreadIdFromLink(link) {
  // https://discord.com/channels/GUILD/CHANNEL_OR_THREAD/MESSAGE
  const m = String(link || '').match(/channels\/(\d+)\/(\d+)\/(\d+)/)
  return m ? { guildId: m[1], channelId: m[2], messageId: m[3] } : null
}

export function webhookAvatarUrl(id, avatarHash) {
  if (!id || !avatarHash) return ''
  const ext = String(avatarHash).startsWith('a_') ? 'gif' : 'png'
  return `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.${ext}?size=128`
}

/** GET /webhooks/{id}/{token} — no auth required */
export async function fetchWebhookInfo(url) {
  const parts = extractWebhookParts(url)
  if (!parts) throw new Error('Webhook URL không hợp lệ')
  const res = await fetch(`https://discord.com/api/webhooks/${parts.id}/${parts.token}`)
  if (!res.ok) {
    const t = await res.text()
    throw new Error(parseDiscordError(t, res.status))
  }
  const data = await res.json()
  return {
    id: data.id,
    name: data.name || 'Webhook',
    avatar: data.avatar ? webhookAvatarUrl(data.id, data.avatar) : '',
    channel_id: data.channel_id || '',
    guild_id: data.guild_id || '',
    application_id: data.application_id || null,
    token: data.token,
    url: `https://discord.com/api/webhooks/${data.id}/${data.token}`,
  }
}

/** PATCH webhook name/avatar (with token) */
export async function modifyWebhook(url, { name, avatar } = {}) {
  const parts = extractWebhookParts(url)
  if (!parts) throw new Error('Webhook URL không hợp lệ')
  const body = {}
  if (name !== undefined) body.name = name
  if (avatar !== undefined) body.avatar = avatar
  const res = await fetch(`https://discord.com/api/webhooks/${parts.id}/${parts.token}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(parseDiscordError(await res.text(), res.status))
  return res.json()
}

function parseEmoji(emoji) {
  if (!emoji) return undefined
  if (typeof emoji === 'object' && (emoji.id || emoji.name)) return emoji
  const s = String(emoji).trim()
  const custom = s.match(/^<(a)?:(\w+):(\d+)>$/)
  if (custom) return { id: custom[3], name: custom[2], animated: !!custom[1] }
  // unicode
  if (s.length <= 8) return { name: s }
  return undefined
}

function cleanButton(btn) {
  const out = { type: 2, style: Number(btn.style) || 2 }
  if (btn.label) out.label = String(btn.label).slice(0, 80)
  const emoji = parseEmoji(btn.emoji)
  if (emoji) out.emoji = emoji
  if (btn.disabled) out.disabled = true

  if (out.style === 5) {
    // Link button
    if (btn.url) out.url = btn.url
  } else {
    out.custom_id = btn.custom_id || `btn_${Math.random().toString(36).slice(2, 10)}`
  }
  // Premium style 6 needs sku_id — skip if missing
  if (out.style === 6 && !btn.sku_id) return null
  return out
}

function cleanComponents(rows) {
  if (!rows?.length) return undefined
  const cleaned = rows
    .map((row) => {
      const comps = (row.components || [])
        .map(cleanButton)
        .filter(Boolean)
        .slice(0, LIMITS.buttonsPerRow)
      if (!comps.length) return null
      return { type: 1, components: comps }
    })
    .filter(Boolean)
    .slice(0, LIMITS.componentRows)
  return cleaned.length ? cleaned : undefined
}

function cleanEmbed(e) {
  const o = {}
  if (e.title) o.title = String(e.title).slice(0, LIMITS.embedTitle)
  if (e.description) o.description = String(e.description).slice(0, LIMITS.embedDescription)
  if (e.url) o.url = e.url

  if (e.color) {
    const n = typeof e.color === 'number'
      ? e.color
      : parseInt(String(e.color).replace('#', ''), 16)
    if (!Number.isNaN(n)) o.color = n
  }

  const authorName = e.authorName || e.author?.name
  if (authorName) {
    o.author = { name: String(authorName).slice(0, LIMITS.embedAuthor) }
    const aUrl = e.authorUrl || e.author?.url
    const aIcon = e.authorIcon || e.author?.icon_url
    if (aUrl) o.author.url = aUrl
    if (aIcon) o.author.icon_url = aIcon
  }

  const footerText = e.footerText || e.footer?.text
  if (footerText) {
    o.footer = { text: String(footerText).slice(0, LIMITS.embedFooter) }
    const fIcon = e.footerIcon || e.footer?.icon_url
    if (fIcon) o.footer.icon_url = fIcon
  }

  // Discord requires { url } objects
  const thumb = typeof e.thumbnail === 'string' ? e.thumbnail : e.thumbnail?.url
  const image = typeof e.image === 'string' ? e.image : e.image?.url
  if (thumb) o.thumbnail = { url: thumb }
  if (image) o.image = { url: image }

  if (e.timestamp) {
    o.timestamp = e.timestamp === true ? new Date().toISOString() : e.timestamp
  }

  const fields = (e.fields || [])
    .filter((f) => f.name || f.value)
    .slice(0, LIMITS.embedFields)
    .map((f) => ({
      name: String(f.name || '\u200b').slice(0, LIMITS.embedFieldName),
      value: String(f.value || '\u200b').slice(0, LIMITS.embedFieldValue),
      inline: !!f.inline,
    }))
  if (fields.length) o.fields = fields

  // Skip empty embeds
  if (!o.title && !o.description && !o.fields && !o.author && !o.footer && !o.image && !o.thumbnail) {
    return null
  }
  return o
}

/**
 * Build Discord execute-webhook JSON payload from editor state.
 * @param {object} msg - editor message
 * @param {object} [wh] - webhook defaults { name, avatar }
 */
export function buildPayload(msg, wh) {
  const p = {}
  if (msg.content) p.content = String(msg.content).slice(0, LIMITS.content)

  const username = msg.username || wh?.name
  const avatar = msg.avatar_url || wh?.avatar
  if (username) p.username = String(username).slice(0, LIMITS.username)
  if (avatar) p.avatar_url = avatar

  if (msg.tts) p.tts = true
  if (msg.flags) p.flags = msg.flags
  if (msg.thread_name) p.thread_name = msg.thread_name

  if (msg.allowed_mentions) p.allowed_mentions = msg.allowed_mentions

  if (msg.embeds?.length) {
    const embeds = msg.embeds.map(cleanEmbed).filter(Boolean).slice(0, LIMITS.embeds)
    if (embeds.length) p.embeds = embeds
  }

  const components = cleanComponents(msg.components)
  if (components) p.components = components

  return p
}

/** Convert Discord API embed → editor embed shape */
export function embedFromApi(e) {
  return {
    title: e.title || '',
    description: e.description || '',
    url: e.url || '',
    color: e.color != null
      ? (typeof e.color === 'number' ? '#' + e.color.toString(16).padStart(6, '0') : e.color)
      : '#5865f2',
    authorName: e.author?.name || '',
    authorUrl: e.author?.url || '',
    authorIcon: e.author?.icon_url || '',
    footerText: e.footer?.text || '',
    footerIcon: e.footer?.icon_url || '',
    thumbnail: e.thumbnail?.url || (typeof e.thumbnail === 'string' ? e.thumbnail : '') || '',
    image: e.image?.url || (typeof e.image === 'string' ? e.image : '') || '',
    fields: (e.fields || []).map((f) => ({
      name: f.name || '',
      value: f.value || '',
      inline: !!f.inline,
    })),
    timestamp: !!e.timestamp,
  }
}

/** Convert Discord button → editor button */
export function buttonFromApi(b) {
  return {
    type: 2,
    style: b.style ?? 2,
    label: b.label || '',
    url: b.url || '',
    custom_id: b.custom_id || '',
    emoji: b.emoji
      ? (b.emoji.id
        ? `<${b.emoji.animated ? 'a' : ''}:${b.emoji.name}:${b.emoji.id}>`
        : b.emoji.name || '')
      : '',
    disabled: !!b.disabled,
  }
}

export function componentsFromApi(rows) {
  return (rows || []).map((row) => ({
    type: 1,
    components: (row.components || [])
      .filter((c) => c.type === 2)
      .map(buttonFromApi),
  }))
}

function parseDiscordError(text, status) {
  try {
    const j = JSON.parse(text)
    if (j.message) {
      if (j.errors) {
        const flat = flattenErrors(j.errors)
        return flat ? `${j.message}: ${flat}` : j.message
      }
      return j.message
    }
  } catch { /* ignore */ }
  return text || `HTTP ${status}`
}

function flattenErrors(obj, path = '') {
  const parts = []
  if (!obj || typeof obj !== 'object') return ''
  if (Array.isArray(obj._errors)) {
    parts.push(...obj._errors.map((e) => e.message))
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === '_errors') continue
    const sub = flattenErrors(v, path ? `${path}.${k}` : k)
    if (sub) parts.push(`${path ? path + '.' : ''}${k}: ${sub}`)
  }
  return parts.join('; ')
}

/**
 * Execute webhook (POST) or edit message (PATCH).
 * Uses wait=true & with_components=true (link buttons on non-app webhooks).
 */
export async function sendOrUpdateMessage({
  webhookUrl,
  payload,
  file,
  messageId,
  threadId,
  method, // 'POST' | 'PATCH'
}) {
  const parts = extractWebhookParts(webhookUrl)
  if (!parts) throw new Error('Webhook URL không hợp lệ')

  const isUpdate = method === 'PATCH' || !!messageId
  const qs = new URLSearchParams()
  if (!isUpdate) qs.set('wait', 'true')
  qs.set('with_components', 'true')
  if (threadId) qs.set('thread_id', threadId)

  let url
  if (isUpdate) {
    if (!messageId) throw new Error('Thiếu message ID để cập nhật')
    url = `https://discord.com/api/webhooks/${parts.id}/${parts.token}/messages/${messageId}?${qs}`
  } else {
    url = `${webhookUrl.replace(/\/$/, '')}?${qs}`
  }

  // Strip username/avatar on edit (not allowed)
  const bodyPayload = { ...payload }
  if (isUpdate) {
    delete bodyPayload.username
    delete bodyPayload.avatar_url
    delete bodyPayload.thread_name
    delete bodyPayload.tts
  }

  let res
  if (file) {
    const form = new FormData()
    form.append('payload_json', JSON.stringify(bodyPayload))
    form.append('files[0]', file, file.name)
    res = await fetch(url, { method: isUpdate ? 'PATCH' : 'POST', body: form })
  } else {
    res = await fetch(url, {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    })
  }

  if (res.status === 204) return { ok: true, data: null }
  const text = await res.text()
  if (!res.ok) throw new Error(parseDiscordError(text, res.status))
  try {
    return { ok: true, data: JSON.parse(text) }
  } catch {
    return { ok: true, data: null }
  }
}

export async function getWebhookMessage(webhookUrl, messageId, threadId) {
  const parts = extractWebhookParts(webhookUrl)
  if (!parts || !messageId) throw new Error('Webhook hoặc message ID không hợp lệ')
  const qs = threadId ? `?thread_id=${threadId}` : ''
  const res = await fetch(
    `https://discord.com/api/webhooks/${parts.id}/${parts.token}/messages/${messageId}${qs}`,
  )
  if (!res.ok) throw new Error(parseDiscordError(await res.text(), res.status))
  return res.json()
}

export async function deleteWebhookMessage(webhookUrl, messageId, threadId) {
  const parts = extractWebhookParts(webhookUrl)
  if (!parts || !messageId) throw new Error('Webhook hoặc message ID không hợp lệ')
  const qs = threadId ? `?thread_id=${threadId}` : ''
  const res = await fetch(
    `https://discord.com/api/webhooks/${parts.id}/${parts.token}/messages/${messageId}${qs}`,
    { method: 'DELETE' },
  )
  if (!res.ok && res.status !== 204) {
    throw new Error(parseDiscordError(await res.text(), res.status))
  }
  return true
}

/** Build discord message link from webhook message response */
export function messageLinkFromResponse(data, guildId) {
  if (!data?.id || !data?.channel_id) return ''
  const g = guildId || '@me'
  return `https://discord.com/channels/${g}/${data.channel_id}/${data.id}`
}

export function embedCharCount(embed) {
  let n = 0
  if (embed.title) n += embed.title.length
  if (embed.description) n += embed.description.length
  if (embed.footerText) n += embed.footerText.length
  if (embed.authorName) n += embed.authorName.length
  for (const f of embed.fields || []) {
    n += (f.name || '').length + (f.value || '').length
  }
  return n
}
