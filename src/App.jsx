import { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import MessagePreview from './components/MessagePreview'
import EmojiPicker from './components/EmojiPicker'
import MarkdownToolbar from './components/MarkdownToolbar'
import {
  LIMITS, buildPayload, extractWebhookParts, extractMessageId, extractThreadIdFromLink,
  embedFromApi, componentsFromApi, sendOrUpdateMessage, getWebhookMessage,
  deleteWebhookMessage, messageLinkFromResponse, embedCharCount, fetchWebhookInfo,
  resolveAttachments, mergePayloadEmbeds, isImageUrl, filenameFromUrl,
} from './lib/discord'
import './App.css'

const EMPTY_EMBED = () => ({
  title: '', description: '', url: '', color: '#5865f2',
  authorName: '', authorUrl: '', authorIcon: '',
  footerText: '', footerIcon: '',
  thumbnail: '', image: '', fields: [], timestamp: false,
})

/** @returns attachment url entry — default upload = file đính kèm thật trên Discord */
const EMPTY_URL_ATT = (url = '') => ({
  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
  url,
  name: url ? filenameFromUrl(url) : '',
  mode: 'upload', // upload (attachment) | embed | link | auto
})

const EMPTY_MSG = () => ({
  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  content: '',
  embeds: [],
  components: [],
  /** remote URL attachments (serializable) */
  attachments: [],
  /** local file previews only — actual File objects stay on <input multiple> */
  localPreviews: [],
  filePreview: null, // legacy single preview
  messageLink: '',
  username: '',
  avatar_url: '',
  thread_name: '',
  thread_id: '',
  flags: 0,
  tts: false,
})

const BTN_STYLES = [
  { value: 1, label: 'Blurple' },
  { value: 2, label: 'Grey' },
  { value: 3, label: 'Green' },
  { value: 4, label: 'Red' },
  { value: 5, label: 'Link' },
]

const FLAGS = {
  SUPPRESS_EMBEDS: 1 << 2,
  SUPPRESS_NOTIFICATIONS: 1 << 12,
}

function load(k, fb) {
  try {
    const v = localStorage.getItem(k)
    return v ? JSON.parse(v) : fb
  } catch {
    return fb
  }
}

function encodeConfig(data) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))))
  } catch {
    return null
  }
}

function decodeConfig(str) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(str))))
  } catch {
    return null
  }
}

function CharCount({ n, max }) {
  const over = n > max
  return (
    <span className={`char-count ${over ? 'over' : n > max * 0.9 ? 'warn' : ''}`}>
      {n}/{max}
    </span>
  )
}

export default function App() {
  const [webhooks, setWebhooks] = useState(() => {
    const saved = load('wh_webhooks', [])
    if (saved.length === 0) {
      return [{ id: '1', url: '', name: 'Webhook 1', avatar: '', messages: [EMPTY_MSG()], activeMsgIdx: 0 }]
    }
    return saved.map((w) => ({
      ...w,
      avatar: w.avatar || '',
      messages: (w.messages || [EMPTY_MSG()]).map((m) => ({ ...EMPTY_MSG(), ...m })),
      activeMsgIdx: w.activeMsgIdx ?? 0,
    }))
  })
  const [activeId, setActiveId] = useState(() => {
    const saved = load('wh_webhooks', [])
    if (saved.length === 0) return '1'
    const lastId = load('wh_activeId', '') || saved[0].id
    return saved.some((w) => w.id === lastId) ? lastId : saved[0].id
  })
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState(() => load('wh_history', []))
  const [backups, setBackups] = useState(() => load('wh_backups', []))
  const [editorTab, setEditorTab] = useState('visual')
  const [showEmoji, setShowEmoji] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [mobilePanel, setMobilePanel] = useState('editor')
  const [checkedMsgs, setCheckedMsgs] = useState({})
  const fileRef = useRef(null)
  const backupNameRef = useRef(null)
  const contentRef = useRef(null)
  const [attachUrlInput, setAttachUrlInput] = useState('')

  useEffect(() => { localStorage.setItem('wh_webhooks', JSON.stringify(webhooks)) }, [webhooks])
  useEffect(() => { localStorage.setItem('wh_activeId', JSON.stringify(activeId)) }, [activeId])
  useEffect(() => { localStorage.setItem('wh_history', JSON.stringify(history)) }, [history])
  useEffect(() => { localStorage.setItem('wh_backups', JSON.stringify(backups)) }, [backups])
  useEffect(() => {
    ;['wh_messages', 'wh_activeMsg', 'wh_draftMsg', 'wh_draftUser', 'wh_draftAvatar', 'wh_draftEmbed', 'wh_includeEmbed']
      .forEach((k) => localStorage.removeItem(k))
  }, [])

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash && hash.startsWith('config=')) {
      const data = decodeConfig(hash.slice(7))
      if (data?.webhooks) {
        const now = Date.now()
        const newWebhooks = data.webhooks.map((w, i) => ({
          id: (now + i).toString(36),
          url: w.url || '',
          name: w.name || `Webhook ${i + 1}`,
          avatar: w.avatar || '',
          channel_id: w.channel_id || '',
          guild_id: w.guild_id || '',
          messages: (w.messages || []).map((m) => ({ ...EMPTY_MSG(), ...m })),
          activeMsgIdx: w.activeMsgIdx ?? 0,
        }))
        setWebhooks(newWebhooks)
        setActiveId(newWebhooks[0]?.id || '')
        setStatus({ type: 'success', text: 'Đã tải config từ URL!' })
      }
      window.location.hash = ''
    }
  }, [])

  // Auto-hide success/error after 5s
  useEffect(() => {
    if (!status || status.type === 'history' || status.type === 'info') return
    const t = setTimeout(() => setStatus(null), 5000)
    return () => clearTimeout(t)
  }, [status])

  const activeWebhook = webhooks.find((w) => w.id === activeId)
  const messages = activeWebhook?.messages || []
  const activeMsgIdx = activeWebhook?.activeMsgIdx ?? 0
  const msg = messages[activeMsgIdx] || messages[0]

  function updateWh(fn) {
    setWebhooks((prev) => prev.map((w) => (w.id === activeId ? fn(w) : w)))
  }

  function addWebhook(data) {
    const id = Date.now().toString(36)
    const entry = typeof data === 'string'
      ? { id, url: data.trim(), name: `Webhook ${webhooks.length + 1}`, avatar: '', messages: [EMPTY_MSG()], activeMsgIdx: 0 }
      : {
          id,
          url: data.url || '',
          name: data.name || `Webhook ${webhooks.length + 1}`,
          avatar: data.avatar || '',
          channel_id: data.channel_id || '',
          guild_id: data.guild_id || '',
          messages: [EMPTY_MSG()],
          activeMsgIdx: 0,
        }
    setWebhooks((prev) => [...prev, entry])
    setActiveId(id)
  }

  function removeWebhook(id) {
    setWebhooks((prev) => prev.filter((w) => w.id !== id))
    if (activeId === id) {
      const r = webhooks.filter((w) => w.id !== id)
      setActiveId(r.length > 0 ? r[0].id : '')
    }
  }

  function renameWebhook(id, name) {
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, name } : w)))
  }

  function updateWebhookMeta(id, meta) {
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, ...meta } : w)))
  }

  function updateMsg(updates) {
    updateWh((w) => {
      const msgs = w.messages.map((m, i) => (i === w.activeMsgIdx ? { ...m, ...updates } : m))
      return { ...w, messages: msgs }
    })
  }

  function addEmbed() {
    updateWh((w) => {
      const m = w.messages[w.activeMsgIdx]
      if (!m || m.embeds.length >= 10) return w
      const msgs = w.messages.map((msg, i) =>
        i === w.activeMsgIdx ? { ...msg, embeds: [...msg.embeds, EMPTY_EMBED()] } : msg,
      )
      return { ...w, messages: msgs }
    })
  }

  function removeEmbed(idx) {
    updateWh((w) => {
      const msgs = w.messages.map((msg, i) =>
        i === w.activeMsgIdx ? { ...msg, embeds: msg.embeds.filter((_, j) => j !== idx) } : msg,
      )
      return { ...w, messages: msgs }
    })
  }

  function updateEmbed(idx, updates) {
    updateWh((w) => {
      const m = w.messages[w.activeMsgIdx]
      if (!m) return w
      const embeds = m.embeds.map((e, i) => (i === idx ? { ...e, ...updates } : e))
      const msgs = w.messages.map((msg, i) => (i === w.activeMsgIdx ? { ...msg, embeds } : msg))
      return { ...w, messages: msgs }
    })
  }

  function updateField(eIdx, fIdx, key, val) {
    updateWh((w) => {
      const m = w.messages[w.activeMsgIdx]
      if (!m) return w
      const embeds = m.embeds.map((e, i) =>
        i !== eIdx ? e : { ...e, fields: e.fields.map((f, j) => (j === fIdx ? { ...f, [key]: val } : f)) },
      )
      const msgs = w.messages.map((msg, i) => (i === w.activeMsgIdx ? { ...msg, embeds } : msg))
      return { ...w, messages: msgs }
    })
  }

  function addField(eIdx) {
    updateWh((w) => {
      const m = w.messages[w.activeMsgIdx]
      if (!m) return w
      const embeds = m.embeds.map((e, i) =>
        i === eIdx ? { ...e, fields: [...e.fields, { name: '', value: '', inline: false }] } : e,
      )
      const msgs = w.messages.map((msg, i) => (i === w.activeMsgIdx ? { ...msg, embeds } : msg))
      return { ...w, messages: msgs }
    })
  }

  function removeField(eIdx, fIdx) {
    updateWh((w) => {
      const m = w.messages[w.activeMsgIdx]
      if (!m) return w
      const embeds = m.embeds.map((e, i) =>
        i === eIdx ? { ...e, fields: e.fields.filter((_, j) => j !== fIdx) } : e,
      )
      const msgs = w.messages.map((msg, i) => (i === w.activeMsgIdx ? { ...msg, embeds } : msg))
      return { ...w, messages: msgs }
    })
  }

  function addRow() {
    updateWh((w) => {
      const m = w.messages[w.activeMsgIdx]
      if (!m || m.components.length >= 5) return w
      const msgs = w.messages.map((msg, i) =>
        i === w.activeMsgIdx ? { ...msg, components: [...msg.components, { type: 1, components: [] }] } : msg,
      )
      return { ...w, messages: msgs }
    })
  }

  function removeRow(rIdx) {
    updateWh((w) => {
      const msgs = w.messages.map((msg, i) =>
        i === w.activeMsgIdx ? { ...msg, components: msg.components.filter((_, j) => j !== rIdx) } : msg,
      )
      return { ...w, messages: msgs }
    })
  }

  function addButton(rIdx) {
    updateWh((w) => {
      const m = w.messages[w.activeMsgIdx]
      if (!m) return w
      const comp = m.components[rIdx]
      if (!comp || comp.components.length >= 5) return w
      const rows = m.components.map((r, i) =>
        i === rIdx
          ? {
              ...r,
              components: [
                ...r.components,
                { type: 2, style: 5, label: 'Button', url: 'https://', custom_id: '', emoji: '' },
              ],
            }
          : r,
      )
      const msgs = w.messages.map((msg, i) => (i === w.activeMsgIdx ? { ...msg, components: rows } : msg))
      return { ...w, messages: msgs }
    })
  }

  function updateButton(rIdx, bIdx, key, val) {
    updateWh((w) => {
      const m = w.messages[w.activeMsgIdx]
      if (!m) return w
      const rows = m.components.map((r, i) =>
        i === rIdx
          ? { ...r, components: r.components.map((b, j) => (j === bIdx ? { ...b, [key]: val } : b)) }
          : r,
      )
      const msgs = w.messages.map((msg, i) => (i === w.activeMsgIdx ? { ...msg, components: rows } : msg))
      return { ...w, messages: msgs }
    })
  }

  function removeButton(rIdx, bIdx) {
    updateWh((w) => {
      const m = w.messages[w.activeMsgIdx]
      if (!m) return w
      const rows = m.components.map((r, i) =>
        i === rIdx ? { ...r, components: r.components.filter((_, j) => j !== bIdx) } : r,
      )
      const msgs = w.messages.map((msg, i) => (i === w.activeMsgIdx ? { ...msg, components: rows } : msg))
      return { ...w, messages: msgs }
    })
  }

  function addMessage() {
    if (!activeWebhook) return
    updateWh((w) => {
      const m = EMPTY_MSG()
      return { ...w, messages: [...w.messages, m], activeMsgIdx: w.messages.length }
    })
  }

  function removeMessage(idx) {
    updateWh((w) => {
      if (w.messages.length <= 1) return w
      const msgs = w.messages.filter((_, i) => i !== idx)
      const newIdx = w.activeMsgIdx >= idx && w.activeMsgIdx > 0 ? w.activeMsgIdx - 1 : w.activeMsgIdx
      return { ...w, messages: msgs, activeMsgIdx: Math.min(newIdx, msgs.length - 1) }
    })
  }

  function duplicateMessage(idx) {
    updateWh((w) => {
      const m = w.messages[idx]
      if (!m) return w
      const copy = { ...JSON.parse(JSON.stringify(m)), id: Date.now().toString(36), messageLink: '' }
      const msgs = [...w.messages]
      msgs.splice(idx + 1, 0, copy)
      return { ...w, messages: msgs, activeMsgIdx: idx + 1 }
    })
  }

  function setActiveMsgIdx(idx) {
    updateWh((w) => ({ ...w, activeMsgIdx: idx }))
  }

  function clearAll() {
    if (!confirm('Xoá tất cả webhooks và messages?')) return
    setWebhooks([{ id: '1', url: '', name: 'Webhook 1', avatar: '', messages: [EMPTY_MSG()], activeMsgIdx: 0 }])
    setActiveId('1')
    setStatus({ type: 'success', text: 'Đã xoá tất cả!' })
  }

  function snapshotConfig() {
    return {
      version: 2,
      webhooks: webhooks.map((w) => ({
        url: w.url,
        name: w.name,
        avatar: w.avatar,
        channel_id: w.channel_id,
        guild_id: w.guild_id,
        messages: w.messages.map((m) => ({
          content: m.content,
          embeds: m.embeds,
          components: m.components,
          attachments: m.attachments || [],
          username: m.username,
          avatar_url: m.avatar_url,
          thread_name: m.thread_name,
          thread_id: m.thread_id,
          flags: m.flags,
          tts: m.tts,
          messageLink: m.messageLink,
        })),
        activeMsgIdx: w.activeMsgIdx,
      })),
      activeWebhookUrl: activeWebhook?.url || '',
    }
  }

  function saveConfig() {
    const data = snapshotConfig()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'webhook-config.json'
    a.click()
    setStatus({ type: 'success', text: 'Đã lưu config!' })
  }

  function loadConfig(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        // Support Discohook-style single message export: { content, embeds, components }
        if (!data.webhooks && (data.content !== undefined || data.embeds || data.components)) {
          const m = {
            ...EMPTY_MSG(),
            content: data.content || '',
            embeds: (data.embeds || []).map(embedFromApi),
            components: componentsFromApi(data.components || []),
            username: data.username || '',
            avatar_url: data.avatar_url || '',
          }
          updateMsg(m)
          setStatus({ type: 'success', text: 'Đã import JSON message (Discohook format)!' })
          return
        }
        if (!data.webhooks) {
          setStatus({ type: 'error', text: 'File không hợp lệ!' })
          return
        }
        const now = Date.now()
        const newWebhooks = data.webhooks.map((w, i) => ({
          id: (now + i).toString(36),
          url: w.url || '',
          name: w.name || `Webhook ${i + 1}`,
          avatar: w.avatar || '',
          channel_id: w.channel_id || '',
          guild_id: w.guild_id || '',
          messages: (w.messages || []).map((m) => ({ ...EMPTY_MSG(), ...m })),
          activeMsgIdx: w.activeMsgIdx ?? 0,
        }))
        setWebhooks(newWebhooks)
        if (data.activeWebhookUrl) {
          const found = newWebhooks.find((w) => w.url === data.activeWebhookUrl)
          setActiveId(found ? found.id : newWebhooks[0]?.id || '')
        } else {
          setActiveId(newWebhooks[0]?.id || '')
        }
        setStatus({ type: 'success', text: `Đã tải config (${newWebhooks.length} webhooks)!` })
      } catch (err) {
        setStatus({ type: 'error', text: `Lỗi: ${err.message}` })
      }
    }
    reader.readAsText(file)
  }

  function saveBackup() {
    const name = backupNameRef.current?.value?.trim() || `Backup ${backups.length + 1}`
    const newBackup = {
      id: Date.now().toString(36),
      name,
      data: snapshotConfig(),
      timestamp: new Date().toISOString(),
    }
    setBackups((prev) => [newBackup, ...prev])
    setStatus({ type: 'success', text: `Đã lưu backup "${name}"!` })
  }

  function loadBackup(id) {
    const backup = backups.find((b) => b.id === id)
    if (!backup) return
    const d = backup.data
    const now = Date.now()
    const newWebhooks = d.webhooks.map((w, i) => ({
      id: (now + i).toString(36),
      url: w.url || '',
      name: w.name || `Webhook ${i + 1}`,
      avatar: w.avatar || '',
      channel_id: w.channel_id || '',
      guild_id: w.guild_id || '',
      messages: (w.messages || []).map((m) => ({ ...EMPTY_MSG(), ...m })),
      activeMsgIdx: w.activeMsgIdx ?? 0,
    }))
    setWebhooks(newWebhooks)
    setActiveId(newWebhooks[0]?.id || '')
    setStatus({ type: 'success', text: `Đã tải backup "${backup.name}"!` })
  }

  function deleteBackup(id) {
    setBackups((prev) => prev.filter((b) => b.id !== id))
  }

  function shareConfig() {
    const data = snapshotConfig()
    // Don't put full webhook tokens in share URL for safety — strip tokens optional
    const encoded = encodeConfig(data)
    if (!encoded) {
      setStatus({ type: 'error', text: 'Lỗi khi mã hoá config!' })
      return
    }
    const url = `${window.location.origin}${window.location.pathname}#config=${encoded}`
    navigator.clipboard.writeText(url)
    setStatus({ type: 'success', text: 'Đã copy URL chia sẻ (chứa webhook token — cẩn thận)!' })
  }

  function syncJsonFromState() {
    if (!activeWebhook || !msg) return
    const payload = buildPayload(msg, activeWebhook)
    setJsonText(JSON.stringify(payload, null, 2))
  }

  function syncStateFromJson() {
    try {
      const parsed = JSON.parse(jsonText)
      const updates = {}
      if (parsed.content !== undefined) updates.content = parsed.content
      if (parsed.username !== undefined) updates.username = parsed.username
      if (parsed.avatar_url !== undefined) updates.avatar_url = parsed.avatar_url
      if (parsed.thread_name !== undefined) updates.thread_name = parsed.thread_name
      if (parsed.flags !== undefined) updates.flags = parsed.flags
      if (parsed.tts !== undefined) updates.tts = parsed.tts
      if (parsed.embeds) updates.embeds = parsed.embeds.map(embedFromApi)
      if (parsed.components) updates.components = componentsFromApi(parsed.components)
      updateMsg(updates)
      setStatus({ type: 'success', text: 'Đã áp dụng JSON!' })
    } catch (err) {
      setStatus({ type: 'error', text: `JSON lỗi: ${err.message}` })
    }
  }

  function isMsgChecked(i) {
    return checkedMsgs[`${activeId}-${i}`] !== false
  }

  function toggleMsgCheck(i) {
    const key = `${activeId}-${i}`
    setCheckedMsgs((prev) => ({ ...prev, [key]: !(prev[key] !== false) }))
  }

  async function send() {
    if (!activeWebhook?.url) {
      setStatus({ type: 'error', text: 'Chưa có webhook URL!' })
      return
    }
    if (!extractWebhookParts(activeWebhook.url)) {
      setStatus({ type: 'error', text: 'Webhook URL không hợp lệ!' })
      return
    }

    const toSendIdx = messages
      .map((m, i) => ({ m, i }))
      .filter(({ i }) => isMsgChecked(i))

    if (toSendIdx.length === 0) {
      setStatus({ type: 'error', text: 'Không có message nào được chọn' })
      return
    }

    setSending(true)
    setStatus({ type: 'info', text: 'Đang gửi...' })
    let success = 0
    let fail = 0
    const allWarnings = []

    for (const { m, i } of toSendIdx) {
      try {
        const fileInput = document.querySelector(`.file-${m.id}`)
        const localFiles = fileInput?.files ? Array.from(fileInput.files) : []
        const { files, extraEmbeds, warnings } = await resolveAttachments(m.attachments || [], localFiles)

        let payload = buildPayload(m, activeWebhook)
        payload = mergePayloadEmbeds(payload, extraEmbeds)

        const hasContent =
          payload.content ||
          payload.embeds?.length ||
          payload.components?.length ||
          files.length > 0

        if (!hasContent) {
          fail++
          setHistory((prev) =>
            [{
              id: Date.now() + i,
              webhookName: activeWebhook.name,
              content: '(empty)',
              timestamp: new Date().toISOString(),
              status: 'error',
              error: 'Message trống — cần content, embed, component, URL hoặc file',
            }, ...prev].slice(0, 200),
          )
          continue
        }

        if (warnings.length) allWarnings.push(...warnings)

        const mid = m.messageLink ? extractMessageId(m.messageLink) : null
        const threadId = m.thread_id || undefined

        const result = await sendOrUpdateMessage({
          webhookUrl: activeWebhook.url,
          payload,
          files,
          messageId: mid || undefined,
          threadId,
          method: mid ? 'PATCH' : 'POST',
        })

        success++
        // Auto-fill message link after create
        if (!mid && result.data) {
          const link = messageLinkFromResponse(result.data, activeWebhook.guild_id)
          if (link) {
            updateWh((w) => {
              const msgs = w.messages.map((msg, idx) =>
                idx === i ? { ...msg, messageLink: link } : msg,
              )
              return { ...w, messages: msgs }
            })
          }
        }

        setHistory((prev) =>
          [{
            id: Date.now() + i,
            webhookName: activeWebhook.name,
            content: m.content,
            timestamp: new Date().toISOString(),
            status: 'success',
          }, ...prev].slice(0, 200),
        )
      } catch (err) {
        fail++
        setHistory((prev) =>
          [{
            id: Date.now() + i,
            webhookName: activeWebhook.name,
            content: m.content,
            timestamp: new Date().toISOString(),
            status: 'error',
            error: err.message,
          }, ...prev].slice(0, 200),
        )
      }
    }

    if (fail === 0) {
      setStatus({
        type: allWarnings.length ? 'info' : 'success',
        text: allWarnings.length
          ? `Đã gửi ${success} tin. Lưu ý: ${allWarnings[0]}`
          : `Đã ${toSendIdx.every(({ m }) => m.messageLink) ? 'cập nhật' : 'gửi'} ${success} tin nhắn!`,
      })
    } else {
      setStatus({ type: 'error', text: `${success} thành công, ${fail} thất bại — xem History` })
    }
    setSending(false)
  }

  async function fetchMessage() {
    if (!activeWebhook?.url || !msg?.messageLink) return
    const mid = extractMessageId(msg.messageLink)
    if (!mid) {
      setStatus({ type: 'error', text: 'Message link không hợp lệ!' })
      return
    }
    setStatus({ type: 'info', text: 'Đang tải message...' })
    try {
      const d = await getWebhookMessage(activeWebhook.url, mid, msg.thread_id || undefined)
      const loadedAtts = (d.attachments || []).map((a) => ({
        id: a.id?.toString() || Date.now().toString(36),
        url: a.url || a.proxy_url || '',
        name: a.filename || filenameFromUrl(a.url || ''),
        mode: 'upload', // re-send as real attachment when possible
      })).filter((a) => a.url)

      updateMsg({
        content: d.content || '',
        embeds: (d.embeds || []).map(embedFromApi),
        components: componentsFromApi(d.components || []),
        attachments: loadedAtts,
        filePreview: d.attachments?.[0]?.url || null,
        localPreviews: [],
        flags: d.flags || 0,
      })
      setStatus({ type: 'success', text: 'Đã tải nội dung từ message!' })
    } catch (err) {
      setStatus({ type: 'error', text: `Lỗi: ${err.message}` })
    }
  }

  async function deleteMessage() {
    if (!activeWebhook?.url || !msg?.messageLink) return
    if (!confirm('Xoá message này trên Discord?')) return
    const mid = extractMessageId(msg.messageLink)
    if (!mid) {
      setStatus({ type: 'error', text: 'Message link không hợp lệ!' })
      return
    }
    try {
      await deleteWebhookMessage(activeWebhook.url, mid, msg.thread_id || undefined)
      updateMsg({ messageLink: '' })
      setStatus({ type: 'success', text: 'Đã xoá message trên Discord!' })
    } catch (err) {
      setStatus({ type: 'error', text: `Lỗi: ${err.message}` })
    }
  }

  async function refreshWebhookInfo() {
    if (!activeWebhook?.url) return
    try {
      const info = await fetchWebhookInfo(activeWebhook.url)
      updateWebhookMeta(activeId, {
        name: info.name,
        avatar: info.avatar,
        channel_id: info.channel_id,
        guild_id: info.guild_id,
        url: info.url,
      })
      setStatus({ type: 'success', text: 'Đã làm mới thông tin webhook' })
    } catch (err) {
      setStatus({ type: 'error', text: err.message })
    }
  }

  function addAttachmentUrl() {
    const raw = attachUrlInput.trim()
    if (!raw) return
    // support paste multiple urls separated by space/newline/comma
    const urls = raw.split(/[\n\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s))
    if (!urls.length) {
      setStatus({ type: 'error', text: 'URL phải bắt đầu bằng http:// hoặc https://' })
      return
    }
    const current = msg?.attachments || []
    const room = LIMITS.attachments - current.length - (msg?.localPreviews?.length || 0)
    if (room <= 0) {
      setStatus({ type: 'error', text: `Tối đa ${LIMITS.attachments} attachments` })
      return
    }
    const toAdd = urls.slice(0, room).map((u) => EMPTY_URL_ATT(u))
    updateMsg({ attachments: [...current, ...toAdd] })
    setAttachUrlInput('')
    if (toAdd.length < urls.length) {
      setStatus({ type: 'info', text: `Chỉ thêm được ${toAdd.length}/${urls.length} (giới hạn ${LIMITS.attachments})` })
    }
  }

  function updateAttachment(id, updates) {
    const list = (msg?.attachments || []).map((a) => (a.id === id ? { ...a, ...updates } : a))
    updateMsg({ attachments: list })
  }

  function removeAttachment(id) {
    updateMsg({ attachments: (msg?.attachments || []).filter((a) => a.id !== id) })
  }

  const selectedCount = messages.filter((_, i) => isMsgChecked(i)).length
  const isEditMode = !!(msg?.messageLink && extractMessageId(msg.messageLink))

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <button
            className="mobile-hamburger"
            onClick={() => setMobilePanel(mobilePanel === 'webhooks' ? 'editor' : 'webhooks')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <div className="header-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </div>
          <div className="header-brand-wrap">
            <span className="header-brand">Webhook Manager</span>
            <span className="header-sub">Discord message designer</span>
          </div>
          <span className="header-badge">Discohook</span>
        </div>
        <nav className="header-nav">
          <button className="btn btn-sm btn-secondary" onClick={clearAll}>Clear All</button>
          <button className="btn btn-sm btn-secondary" onClick={() => setShowSettings(!showSettings)}>Settings</button>
          <button className="btn btn-sm btn-secondary" onClick={() => setStatus({ type: 'history', text: '' })}>
            History ({history.length})
          </button>
          <a
            className="btn btn-sm btn-secondary"
            href="https://discord.com/developers/docs/resources/webhook"
            target="_blank"
            rel="noopener noreferrer"
          >
            API Docs
          </a>
        </nav>
      </header>

      <div className={`main-area${!activeWebhook ? ' no-webhook' : ''}`}>
        <div className={`mobile-overlay ${mobilePanel === 'webhooks' ? 'open' : ''}`}>
          <div className="mobile-overlay-header">
            <h3>Webhooks</h3>
            <button className="btn-icon" onClick={() => setMobilePanel('editor')}>✕</button>
          </div>
          <Sidebar
            webhooks={webhooks}
            activeId={activeId}
            onSelect={(id) => { setActiveId(id); setMobilePanel('editor') }}
            onAdd={addWebhook}
            onRemove={removeWebhook}
            onRename={renameWebhook}
            onUpdateUrl={updateWebhookMeta}
            onSaveConfig={saveConfig}
            onLoadConfig={loadConfig}
            fileRef={fileRef}
            backups={backups}
            onSaveBackup={saveBackup}
            onLoadBackup={loadBackup}
            onDeleteBackup={deleteBackup}
            onShareConfig={shareConfig}
            backupNameRef={backupNameRef}
            onStatus={setStatus}
          />
        </div>

        <div className={`mobile-overlay ${mobilePanel === 'messages' ? 'open' : ''}`}>
          <div className="mobile-overlay-header">
            <h3>Messages</h3>
            <button className="btn-icon" onClick={() => setMobilePanel('editor')}>✕</button>
          </div>
          <div className="msg-sidebar">
            <div className="msg-sidebar-header">
              <h3>Messages ({messages.length})</h3>
              <button className="btn btn-sm btn-secondary" onClick={addMessage}>+</button>
            </div>
            <div className="msg-list">
              {messages.map((m, i) => (
                <div
                  key={m.id}
                  className={`msg-list-item ${i === activeMsgIdx ? 'active' : ''}`}
                  onClick={() => { setActiveMsgIdx(i); setMobilePanel('editor') }}
                >
                  <input
                    type="checkbox"
                    checked={isMsgChecked(i)}
                    onChange={() => toggleMsgCheck(i)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="msg-list-info">
                    <div className="msg-list-name">
                      Message {i + 1}
                      {m.messageLink ? <span className="msg-badge edit">edit</span> : null}
                    </div>
                    <div className="msg-list-preview">{m.content?.slice(0, 40) || m.embeds?.[0]?.title || '(empty)'}</div>
                  </div>
                  <div className="msg-list-actions">
                    <button className="btn-icon" onClick={(e) => { e.stopPropagation(); duplicateMessage(i) }} title="Duplicate">⧉</button>
                    {messages.length > 1 && (
                      <button className="btn-icon danger" onClick={(e) => { e.stopPropagation(); removeMessage(i) }} title="Xoá">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="editor">
          {!activeWebhook ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </div>
              <h3>Bắt đầu với webhook</h3>
              <p>Dán webhook URL ở sidebar trái — Server Settings → Integrations → Webhooks → Copy Webhook URL</p>
            </div>
          ) : !msg ? (
            <div className="empty-state"><p>Chọn hoặc tạo message</p></div>
          ) : (
            <>
            <div className="editor-content">
              <div className="editor-tabs">
                <button
                  className={`editor-tab ${editorTab === 'visual' ? 'active' : ''}`}
                  onClick={() => setEditorTab('visual')}
                >
                  Visual Editor
                </button>
                <button
                  className={`editor-tab ${editorTab === 'json' ? 'active' : ''}`}
                  onClick={() => { setEditorTab('json'); syncJsonFromState() }}
                >
                  JSON Data
                </button>
              </div>

              {editorTab === 'json' ? (
                <div className="json-editor-section">
                  <p className="text-muted" style={{ marginBottom: 8, fontSize: 12 }}>
                    Payload Discord execute-webhook (có thể import từ Discohook JSON).
                  </p>
                  <textarea
                    className="input json-textarea"
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    spellCheck={false}
                  />
                  <div className="form-row" style={{ marginTop: 8 }}>
                    <button className="btn btn-sm btn-primary" onClick={syncStateFromJson}>Apply JSON</button>
                    <button className="btn btn-sm btn-secondary" onClick={syncJsonFromState}>Reset from editor</button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(jsonText)
                        setStatus({ type: 'success', text: 'Đã copy JSON' })
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Webhook profile (defaults) */}
                  <div className="editor-section">
                    <div className="section-header">
                      <h4>Webhook / Profile</h4>
                      <button className="btn btn-sm btn-secondary" onClick={refreshWebhookInfo} disabled={!activeWebhook.url}>
                        Refresh info
                      </button>
                    </div>
                    <div className="profile-card">
                      <div className="profile-avatar-wrap">
                        {activeWebhook.avatar || msg.avatar_url ? (
                          <img src={msg.avatar_url || activeWebhook.avatar} alt="" className="profile-avatar" />
                        ) : (
                          <div className="profile-avatar fallback">
                            {(msg.username || activeWebhook.name || 'W')[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="profile-fields">
                        <div className="form-row">
                          <input
                            className="input"
                            placeholder="Webhook name (default)"
                            value={activeWebhook.name || ''}
                            onChange={(e) =>
                              setWebhooks((prev) =>
                                prev.map((w) => (w.id === activeId ? { ...w, name: e.target.value } : w)),
                              )
                            }
                          />
                          <input
                            className="input"
                            placeholder="Avatar URL (default)"
                            value={activeWebhook.avatar || ''}
                            onChange={(e) =>
                              setWebhooks((prev) =>
                                prev.map((w) => (w.id === activeId ? { ...w, avatar: e.target.value } : w)),
                              )
                            }
                          />
                        </div>
                        <details className="embed-details" style={{ marginTop: 6 }}>
                          <summary>Override cho message này</summary>
                          <div className="form-row" style={{ marginTop: 6 }}>
                            <input
                              className="input"
                              placeholder="Username override"
                              value={msg.username}
                              maxLength={LIMITS.username}
                              onChange={(e) => updateMsg({ username: e.target.value })}
                            />
                            <input
                              className="input"
                              placeholder="Avatar URL override"
                              value={msg.avatar_url}
                              onChange={(e) => updateMsg({ avatar_url: e.target.value })}
                            />
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="editor-section">
                    <div className="section-header">
                      <h4>Content</h4>
                      <CharCount n={(msg.content || '').length} max={LIMITS.content} />
                    </div>
                    <MarkdownToolbar
                      targetRef={contentRef}
                      value={msg.content || ''}
                      onChange={(v) => updateMsg({ content: v })}
                    />
                    <div style={{ position: 'relative' }}>
                      <textarea
                        ref={contentRef}
                        className="input content-input"
                        placeholder="Nội dung tin nhắn (markdown Discord)..."
                        rows={4}
                        value={msg.content}
                        maxLength={LIMITS.content + 100}
                        onChange={(e) => updateMsg({ content: e.target.value })}
                      />
                      <button
                        className="btn-icon emoji-trigger"
                        onClick={() => setShowEmoji(!showEmoji)}
                        title="Emoji"
                        type="button"
                      >
                        😊
                      </button>
                      {showEmoji && (
                        <div className="emoji-picker-wrapper">
                          <EmojiPicker
                            onSelect={(emoji) => {
                              updateMsg({ content: (msg.content || '') + emoji })
                              setShowEmoji(false)
                            }}
                            onClose={() => setShowEmoji(false)}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Attachments: URL + multi local files */}
                  <div className="editor-section">
                    <div className="section-header">
                      <h4>
                        Attachments (
                        {(msg.attachments?.length || 0) + (msg.localPreviews?.length || 0)}
                        /{LIMITS.attachments})
                      </h4>
                    </div>
                    <p className="field-hint" style={{ marginTop: 0, marginBottom: 10 }}>
                      <strong>Upload (mặc định)</strong> = ảnh/file đính kèm bình thường trên Discord.
                      <strong> Embed</strong> = khung embed (không phải file).
                      Host chặn CORS → upload URL fail, hãy chọn file local hoặc mode Embed.
                    </p>

                    <div className="attach-url-add form-row">
                      <input
                        className="input"
                        placeholder="https://example.com/image.png hoặc link file..."
                        value={attachUrlInput}
                        onChange={(e) => setAttachUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addAttachmentUrl()
                          }
                        }}
                      />
                      <button className="btn btn-sm btn-primary" type="button" onClick={addAttachmentUrl}>
                        + URL
                      </button>
                    </div>

                    <div className="attach-url-batch form-row" style={{ marginTop: 8 }}>
                      <textarea
                        className="input"
                        rows={2}
                        placeholder="Dán nhiều URL (mỗi dòng một link) rồi bấm Thêm tất cả"
                        id={`multi-url-${msg.id}`}
                      />
                      <button
                        className="btn btn-sm btn-secondary"
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(`multi-url-${msg.id}`)
                          const text = el?.value || ''
                          const urls = text.split(/[\n\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s))
                          if (!urls.length) {
                            setStatus({ type: 'error', text: 'Không tìm thấy URL hợp lệ' })
                            return
                          }
                          const current = msg.attachments || []
                          const room = LIMITS.attachments - current.length - (msg.localPreviews?.length || 0)
                          if (room <= 0) {
                            setStatus({ type: 'error', text: `Tối đa ${LIMITS.attachments} attachments` })
                            return
                          }
                          const toAdd = urls.slice(0, room).map((u) => EMPTY_URL_ATT(u))
                          updateMsg({ attachments: [...current, ...toAdd] })
                          if (el) el.value = ''
                          setStatus({ type: 'success', text: `Đã thêm ${toAdd.length} URL` })
                        }}
                      >
                        Thêm tất cả
                      </button>
                    </div>

                    {(msg.attachments || []).length > 0 && (
                      <>
                      <div className="form-row" style={{ marginTop: 8, marginBottom: 4 }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          type="button"
                          onClick={() => updateMsg({
                            attachments: (msg.attachments || []).map((a) => ({ ...a, mode: 'upload' })),
                          })}
                        >
                          Tất cả → Upload
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          type="button"
                          onClick={() => updateMsg({
                            attachments: (msg.attachments || []).map((a) => ({ ...a, mode: 'embed' })),
                          })}
                        >
                          Tất cả → Embed
                        </button>
                      </div>
                      <div className="attach-list">
                        {msg.attachments.map((att) => (
                          <div key={att.id} className="attach-item">
                            <div className="attach-thumb">
                              {isImageUrl(att.url) ? (
                                <img src={att.url} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                              ) : (
                                <span className="attach-file-icon">📄</span>
                              )}
                            </div>
                            <div className="attach-meta">
                              <input
                                className="input attach-name"
                                value={att.name}
                                placeholder="Tên file"
                                onChange={(e) => updateAttachment(att.id, { name: e.target.value })}
                              />
                              <input
                                className="input attach-url"
                                value={att.url}
                                placeholder="URL"
                                onChange={(e) => updateAttachment(att.id, {
                                  url: e.target.value,
                                  name: att.name || filenameFromUrl(e.target.value),
                                })}
                              />
                              <select
                                className="input attach-mode"
                                value={att.mode || 'upload'}
                                onChange={(e) => updateAttachment(att.id, { mode: e.target.value })}
                                title="Cách gửi lên Discord"
                              >
                                <option value="upload">📎 Upload (file thật)</option>
                                <option value="auto">Auto (upload → fallback embed)</option>
                                <option value="embed">🖼️ Embed (khung màu)</option>
                                <option value="link">🔗 Chỉ link</option>
                              </select>
                            </div>
                            <button
                              className="btn-icon danger"
                              type="button"
                              onClick={() => removeAttachment(att.id)}
                              title="Xoá"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      </>
                    )}

                    <div className="file-attach-row" style={{ marginTop: 10 }}>
                      <input
                        type="file"
                        multiple
                        className={`file-${msg.id}`}
                        style={{ fontSize: 13, flex: 1, minWidth: 0 }}
                        onChange={(e) => {
                          const list = Array.from(e.target.files || [])
                          const previews = list.map((f) => ({
                            id: Math.random().toString(36).slice(2, 9),
                            name: f.name,
                            size: f.size,
                            preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
                            isImage: f.type.startsWith('image/'),
                          }))
                          updateMsg({
                            localPreviews: previews,
                            filePreview: previews.find((p) => p.preview)?.preview || null,
                          })
                        }}
                      />
                      {(msg.localPreviews?.length > 0) && (
                        <button
                          className="btn btn-sm btn-secondary"
                          type="button"
                          onClick={() => {
                            const fi = document.querySelector(`.file-${msg.id}`)
                            if (fi) fi.value = ''
                            updateMsg({ localPreviews: [], filePreview: null })
                          }}
                        >
                          Xoá file local
                        </button>
                      )}
                    </div>

                    {(msg.localPreviews || []).length > 0 && (
                      <div className="attach-list local">
                        {msg.localPreviews.map((f) => (
                          <div key={f.id} className="attach-item compact">
                            <div className="attach-thumb">
                              {f.preview ? (
                                <img src={f.preview} alt="" />
                              ) : (
                                <span className="attach-file-icon">📎</span>
                              )}
                            </div>
                            <div className="attach-meta">
                              <span className="attach-local-name">{f.name}</span>
                              <span className="attach-local-size">
                                {f.size < 1024
                                  ? `${f.size} B`
                                  : f.size < 1048576
                                    ? `${(f.size / 1024).toFixed(1)} KB`
                                    : `${(f.size / 1048576).toFixed(1)} MB`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Message link / edit */}
                  <div className="editor-section">
                    <div className="section-header"><h4>Message Link (edit existing)</h4></div>
                    <div className="form-row">
                      <input
                        className="input"
                        placeholder="https://discord.com/channels/guild/channel/message"
                        value={msg.messageLink}
                        onChange={(e) => {
                          const link = e.target.value
                          const parts = extractThreadIdFromLink(link)
                          updateMsg({
                            messageLink: link,
                            // channel in link may be thread id when message is in a thread
                            ...(parts ? {} : {}),
                          })
                        }}
                      />
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={fetchMessage}
                        disabled={!msg.messageLink || !activeWebhook?.url}
                        type="button"
                      >
                        Load
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={deleteMessage}
                        disabled={!msg.messageLink || !activeWebhook?.url}
                        type="button"
                        title="Xoá message trên Discord"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="form-row" style={{ marginTop: 6 }}>
                      <input
                        className="input"
                        placeholder="thread_id (nếu message trong thread)"
                        value={msg.thread_id || ''}
                        onChange={(e) => updateMsg({ thread_id: e.target.value })}
                      />
                    </div>
                    <p className="field-hint">
                      Sau khi gửi mới, link sẽ tự điền (cần guild_id từ webhook). Chỉ webhook đã gửi mới edit/xoá được.
                    </p>
                  </div>

                  {/* Thread + flags */}
                  <div className="editor-section">
                    <details className="embed-details">
                      <summary>Thread &amp; Flags</summary>
                      <div className="form-row" style={{ marginTop: 6 }}>
                        <input
                          className="input"
                          placeholder="Tạo thread mới (forum channel): thread name"
                          value={msg.thread_name}
                          onChange={(e) => updateMsg({ thread_name: e.target.value })}
                        />
                      </div>
                      <div className="flags-grid" style={{ marginTop: 8 }}>
                        <label className="toggle-label">
                          <input
                            type="checkbox"
                            checked={!!msg.tts}
                            onChange={(e) => updateMsg({ tts: e.target.checked })}
                          />
                          <span className="toggle-switch" /> TTS
                        </label>
                        <label className="toggle-label">
                          <input
                            type="checkbox"
                            checked={(msg.flags & FLAGS.SUPPRESS_EMBEDS) !== 0}
                            onChange={(e) =>
                              updateMsg({
                                flags: e.target.checked
                                  ? msg.flags | FLAGS.SUPPRESS_EMBEDS
                                  : msg.flags & ~FLAGS.SUPPRESS_EMBEDS,
                              })
                            }
                          />
                          <span className="toggle-switch" /> Suppress Embeds
                        </label>
                        <label className="toggle-label">
                          <input
                            type="checkbox"
                            checked={(msg.flags & FLAGS.SUPPRESS_NOTIFICATIONS) !== 0}
                            onChange={(e) =>
                              updateMsg({
                                flags: e.target.checked
                                  ? msg.flags | FLAGS.SUPPRESS_NOTIFICATIONS
                                  : msg.flags & ~FLAGS.SUPPRESS_NOTIFICATIONS,
                              })
                            }
                          />
                          <span className="toggle-switch" /> Suppress Notifications
                        </label>
                      </div>
                    </details>
                  </div>

                  {/* Embeds */}
                  <div className="editor-section">
                    <div className="section-header">
                      <h4>Embeds ({msg.embeds.length}/{LIMITS.embeds})</h4>
                      {msg.embeds.length < LIMITS.embeds && (
                        <button className="btn btn-sm btn-secondary" type="button" onClick={addEmbed}>
                          + Add Embed
                        </button>
                      )}
                    </div>
                    {msg.embeds.map((embed, ei) => {
                      const ec = embedCharCount(embed)
                      const color = /^#[0-9a-fA-F]{6}$/.test(embed.color) ? embed.color : '#5865f2'
                      return (
                        <div key={ei} className="embed-editor" style={{ '--embed-color': color }}>
                          <div className="embed-editor-header">
                            <span className="embed-editor-title">
                              Embed {ei + 1}
                              <CharCount n={ec} max={LIMITS.embedsTotal} />
                            </span>
                            <button className="btn-icon danger" type="button" onClick={() => removeEmbed(ei)} title="Xoá embed">
                              ✕
                            </button>
                          </div>
                          <div className="embed-editor-body">
                            <div className="form-row">
                              <input
                                type="color"
                                value={/^#[0-9a-fA-F]{6}$/.test(embed.color) ? embed.color : '#5865f2'}
                                onChange={(e) => updateEmbed(ei, { color: e.target.value })}
                                className="color-swatch"
                              />
                              <input
                                className="input"
                                placeholder="#5865f2"
                                value={embed.color}
                                onChange={(e) => updateEmbed(ei, { color: e.target.value })}
                                style={{ maxWidth: 110 }}
                              />
                              <div style={{ flex: 1, position: 'relative' }}>
                                <input
                                  className="input"
                                  placeholder="Title"
                                  value={embed.title}
                                  maxLength={LIMITS.embedTitle}
                                  onChange={(e) => updateEmbed(ei, { title: e.target.value })}
                                />
                              </div>
                            </div>
                            <input
                              className="input"
                              placeholder="Title URL"
                              value={embed.url}
                              onChange={(e) => updateEmbed(ei, { url: e.target.value })}
                              style={{ marginTop: 6 }}
                            />
                            <div style={{ marginTop: 6 }}>
                              <div className="section-header" style={{ marginBottom: 4 }}>
                                <span className="text-muted" style={{ fontSize: 11 }}>Description</span>
                                <CharCount n={(embed.description || '').length} max={LIMITS.embedDescription} />
                              </div>
                              <textarea
                                className="input"
                                placeholder="Description (markdown)"
                                rows={3}
                                value={embed.description}
                                onChange={(e) => updateEmbed(ei, { description: e.target.value })}
                              />
                            </div>

                            <details className="embed-details">
                              <summary>Author</summary>
                              <div className="form-row" style={{ marginTop: 6 }}>
                                <input
                                  className="input"
                                  placeholder="Name"
                                  value={embed.authorName}
                                  maxLength={LIMITS.embedAuthor}
                                  onChange={(e) => updateEmbed(ei, { authorName: e.target.value })}
                                />
                                <input
                                  className="input"
                                  placeholder="URL"
                                  value={embed.authorUrl}
                                  onChange={(e) => updateEmbed(ei, { authorUrl: e.target.value })}
                                />
                              </div>
                              <input
                                className="input"
                                placeholder="Icon URL"
                                value={embed.authorIcon}
                                onChange={(e) => updateEmbed(ei, { authorIcon: e.target.value })}
                                style={{ marginTop: 6 }}
                              />
                            </details>

                            <details className="embed-details">
                              <summary>Fields ({embed.fields.length}/{LIMITS.embedFields})</summary>
                              {embed.fields.map((f, fi) => (
                                <div key={fi} className="field-row" style={{ marginTop: 6 }}>
                                  <input
                                    className="input"
                                    placeholder="Name"
                                    value={f.name}
                                    maxLength={LIMITS.embedFieldName}
                                    onChange={(e) => updateField(ei, fi, 'name', e.target.value)}
                                  />
                                  <input
                                    className="input"
                                    placeholder="Value"
                                    value={f.value}
                                    maxLength={LIMITS.embedFieldValue}
                                    onChange={(e) => updateField(ei, fi, 'value', e.target.value)}
                                  />
                                  <label className="inline-label">
                                    <input
                                      type="checkbox"
                                      checked={f.inline}
                                      onChange={(e) => updateField(ei, fi, 'inline', e.target.checked)}
                                    />
                                    Inline
                                  </label>
                                  <button className="btn-icon danger" type="button" onClick={() => removeField(ei, fi)}>
                                    ✕
                                  </button>
                                </div>
                              ))}
                              {embed.fields.length < LIMITS.embedFields && (
                                <button
                                  className="btn btn-sm btn-secondary"
                                  type="button"
                                  onClick={() => addField(ei)}
                                  style={{ marginTop: 6 }}
                                >
                                  + Field
                                </button>
                              )}
                            </details>

                            <details className="embed-details">
                              <summary>Footer &amp; Media</summary>
                              <div className="form-row" style={{ marginTop: 6 }}>
                                <input
                                  className="input"
                                  placeholder="Footer text"
                                  value={embed.footerText}
                                  maxLength={LIMITS.embedFooter}
                                  onChange={(e) => updateEmbed(ei, { footerText: e.target.value })}
                                />
                                <input
                                  className="input"
                                  placeholder="Footer icon URL"
                                  value={embed.footerIcon}
                                  onChange={(e) => updateEmbed(ei, { footerIcon: e.target.value })}
                                />
                              </div>
                              <div className="form-row" style={{ marginTop: 6 }}>
                                <input
                                  className="input"
                                  placeholder="Thumbnail URL"
                                  value={embed.thumbnail}
                                  onChange={(e) => updateEmbed(ei, { thumbnail: e.target.value })}
                                />
                                <input
                                  className="input"
                                  placeholder="Image URL"
                                  value={embed.image}
                                  onChange={(e) => updateEmbed(ei, { image: e.target.value })}
                                />
                              </div>
                              <label className="toggle-label" style={{ marginTop: 6 }}>
                                <input
                                  type="checkbox"
                                  checked={embed.timestamp}
                                  onChange={(e) => updateEmbed(ei, { timestamp: e.target.checked })}
                                />
                                <span className="toggle-switch" /> Timestamp
                              </label>
                            </details>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Components */}
                  <div className="editor-section">
                    <div className="section-header">
                      <h4>Components ({msg.components.length}/{LIMITS.componentRows} rows)</h4>
                      {msg.components.length < LIMITS.componentRows && (
                        <button className="btn btn-sm btn-secondary" type="button" onClick={addRow}>
                          + Row
                        </button>
                      )}
                    </div>
                    <p className="field-hint">
                      Link buttons (style 5) hoạt động với mọi webhook. Button tương tác (blurple/grey/…) cần application-owned webhook hoặc bot.
                    </p>
                    {msg.components.map((row, ri) => (
                      <div key={ri} className="component-row">
                        <div className="component-row-header">
                          <span>Row {ri + 1}</span>
                          <div className="msg-list-actions">
                            <span className="text-muted" style={{ fontSize: 11 }}>
                              {row.components.length}/{LIMITS.buttonsPerRow}
                            </span>
                            {row.components.length < LIMITS.buttonsPerRow && (
                              <button className="btn-icon" type="button" onClick={() => addButton(ri)} title="Add button">
                                +
                              </button>
                            )}
                            <button className="btn-icon danger" type="button" onClick={() => removeRow(ri)} title="Xoá row">
                              ✕
                            </button>
                          </div>
                        </div>
                        <div className="component-buttons">
                          {row.components.map((btn, bi) => (
                            <div key={bi} className="component-btn-editor">
                              <div className="form-row" style={{ flexWrap: 'wrap' }}>
                                <select
                                  className="input btn-style-select"
                                  value={btn.style}
                                  onChange={(e) => updateButton(ri, bi, 'style', Number(e.target.value))}
                                >
                                  {BTN_STYLES.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </select>
                                <input
                                  className="input"
                                  placeholder="Label"
                                  value={btn.label}
                                  maxLength={80}
                                  onChange={(e) => updateButton(ri, bi, 'label', e.target.value)}
                                />
                                {btn.style === 5 ? (
                                  <input
                                    className="input"
                                    placeholder="https://..."
                                    value={btn.url}
                                    onChange={(e) => updateButton(ri, bi, 'url', e.target.value)}
                                  />
                                ) : (
                                  <input
                                    className="input"
                                    placeholder="custom_id"
                                    value={btn.custom_id}
                                    onChange={(e) => updateButton(ri, bi, 'custom_id', e.target.value)}
                                  />
                                )}
                                <input
                                  className="input btn-emoji"
                                  placeholder="emoji"
                                  value={btn.emoji}
                                  onChange={(e) => updateButton(ri, bi, 'emoji', e.target.value)}
                                />
                                <button className="btn-icon danger" type="button" onClick={() => removeButton(ri, bi)}>
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {status?.type === 'history' && (
                    <div className="history-panel">
                      <div className="section-header">
                        <h4>Lịch sử gửi ({history.length})</h4>
                        <button className="btn btn-sm btn-secondary" type="button" onClick={() => { setHistory([]); setStatus(null) }}>
                          Xoá hết
                        </button>
                      </div>
                      {history.length === 0 ? (
                        <div className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Chưa có lịch sử</div>
                      ) : (
                        <div className="history-list-compact">
                          {history.slice(0, 50).map((entry) => (
                            <div key={entry.id} className="history-entry">
                              <span className={entry.status === 'success' ? 'h-success' : 'h-error'}>
                                {entry.status === 'success' ? '✓' : '✗'}
                              </span>
                              <span className="h-webhook">{entry.webhookName}</span>
                              <span className="h-content" title={entry.error || entry.content}>
                                {entry.error || entry.content?.slice(0, 40) || '(embed)'}
                              </span>
                              <span className="h-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                              <button
                                className="btn-icon danger"
                                type="button"
                                onClick={() => setHistory((prev) => prev.filter((e) => e.id !== entry.id))}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <TimestampGenerator />
                </>
              )}
            </div>

            <div className="editor-action-bar">
              {status && status.type !== 'history' && (
                <div className={`status-bar ${status.type}`}>
                  {status.type === 'success' ? '✓' : status.type === 'info' ? '…' : '✗'} {status.text}
                </div>
              )}
              <button
                className="btn btn-primary btn-send"
                type="button"
                onClick={send}
                disabled={sending || !activeWebhook?.url}
              >
                {sending ? (
                  <>
                    <span className="spinner" /> Đang xử lý...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 2L11 13" />
                      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                    </svg>
                    {isEditMode ? 'Cập nhật tin nhắn' : `Gửi ${selectedCount} message(s)`}
                  </>
                )}
              </button>
              {!activeWebhook?.url && (
                <p className="field-hint" style={{ marginTop: 8, textAlign: 'center' }}>
                  Thêm webhook URL ở sidebar để gửi tin nhắn
                </p>
              )}
            </div>
            </>
          )}
        </div>

        <div className={`mobile-overlay ${mobilePanel === 'preview' ? 'open' : ''}`}>
          <div className="mobile-overlay-header">
            <h3>Preview</h3>
            <button className="btn-icon" onClick={() => setMobilePanel('editor')}>✕</button>
          </div>
          <div className="preview-panel">
            <div className="preview-panel-header">
              <span className="preview-hash">#</span>
              <h4>preview</h4>
              <span className="preview-label">Live</span>
            </div>
            <div className="preview-panel-body">
              {msg && (
                <MessagePreview
                  msg={msg}
                  webhookName={activeWebhook?.name}
                  webhookAvatar={activeWebhook?.avatar}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <nav className="mobile-tab-bar">
        <button className={`mobile-tab ${mobilePanel === 'webhooks' ? 'active' : ''}`} onClick={() => setMobilePanel('webhooks')}>
          <span>Webhooks</span>
        </button>
        <button className={`mobile-tab ${mobilePanel === 'messages' ? 'active' : ''}`} onClick={() => setMobilePanel('messages')}>
          <span>Messages</span>
        </button>
        <button className={`mobile-tab ${mobilePanel === 'editor' ? 'active' : ''}`} onClick={() => setMobilePanel('editor')}>
          <span>Editor</span>
        </button>
        <button className={`mobile-tab ${mobilePanel === 'preview' ? 'active' : ''}`} onClick={() => setMobilePanel('preview')}>
          <span>Preview</span>
        </button>
      </nav>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Settings</h3>
              <button className="btn-icon" type="button" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="editor-section">
                <div className="section-header"><h4>Backups ({backups.length})</h4></div>
                <div className="form-row" style={{ marginBottom: 8 }}>
                  <input ref={backupNameRef} className="input" placeholder="Tên backup..." />
                  <button
                    className="btn btn-sm btn-primary"
                    type="button"
                    onClick={() => { saveBackup(); setShowSettings(false) }}
                  >
                    Save Backup
                  </button>
                </div>
                {backups.length === 0 ? (
                  <div className="text-muted" style={{ textAlign: 'center', padding: 12 }}>Chưa có backup</div>
                ) : (
                  <div className="backup-list">
                    {backups.map((b) => (
                      <div key={b.id} className="backup-item">
                        <div className="backup-info">
                          <span className="backup-name">{b.name}</span>
                          <span className="backup-time">{new Date(b.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="msg-list-actions">
                          <button className="btn btn-sm btn-secondary" type="button" onClick={() => { loadBackup(b.id); setShowSettings(false) }}>Load</button>
                          <button className="btn-icon danger" type="button" onClick={() => deleteBackup(b.id)}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="editor-section">
                <div className="section-header"><h4>Config</h4></div>
                <div className="form-row">
                  <button className="btn btn-sm btn-secondary" type="button" onClick={saveConfig}>Save to File</button>
                  <button className="btn btn-sm btn-secondary" type="button" onClick={() => fileRef.current?.click()}>Load from File</button>
                  <button className="btn btn-sm btn-secondary" type="button" onClick={shareConfig}>Share via URL</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <span>Webhook Manager · free local editor</span>
        <span>
          <a href="https://discord.com/developers/docs/resources/webhook" target="_blank" rel="noopener noreferrer">
            Discord API
          </a>
          {' · '}
          <a href="https://discohook.app" target="_blank" rel="noopener noreferrer">Discohook</a>
        </span>
      </footer>
    </div>
  )
}

const TS_FORMATS = [
  { id: 't', label: 'Short Time' },
  { id: 'T', label: 'Long Time' },
  { id: 'd', label: 'Short Date' },
  { id: 'D', label: 'Long Date' },
  { id: 'f', label: 'Short Date/Time' },
  { id: 'F', label: 'Long Date/Time' },
  { id: 'R', label: 'Relative' },
]

function TimestampGenerator() {
  const [date, setDate] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })

  const d = new Date(date)
  const unix = Math.floor(d.getTime() / 1000)

  function ts(fmt) {
    return fmt === 'f' ? `<t:${unix}>` : `<t:${unix}:${fmt}>`
  }

  function preview(fmt) {
    switch (fmt) {
      case 't':
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      case 'T':
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
      case 'd':
        return d.toLocaleDateString('en-US')
      case 'D':
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      case 'f':
        return `${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      case 'F':
        return `${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      case 'R': {
        const s = Math.floor((d - new Date()) / 1000)
        const a = Math.abs(s)
        const r =
          a < 60 ? `${a}s`
            : a < 3600 ? `${Math.floor(a / 60)}m`
              : a < 86400 ? `${Math.floor(a / 3600)}h`
                : a < 2592000 ? `${Math.floor(a / 86400)}d`
                  : a < 31536000 ? `${Math.floor(a / 2592000)}mo`
                    : `${Math.floor(a / 31536000)}y`
        return s >= 0 ? `in ${r}` : `${r} ago`
      }
      default:
        return ''
    }
  }

  return (
    <div className="editor-section ts-generator">
      <div className="section-header"><h4>Discord Timestamp</h4></div>
      <div className="form-row">
        <input type="datetime-local" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <button
          className="btn btn-sm btn-secondary"
          type="button"
          onClick={() => {
            const n = new Date()
            n.setMinutes(n.getMinutes() - n.getTimezoneOffset())
            setDate(n.toISOString().slice(0, 16))
          }}
        >
          Now
        </button>
      </div>
      <div className="ts-list">
        {TS_FORMATS.map((f) => (
          <div key={f.id} className="ts-row">
            <span className="ts-badge">{f.id}</span>
            <span className="ts-preview">{preview(f.id)}</span>
            <code className="ts-code">{ts(f.id)}</code>
            <button className="btn btn-sm btn-primary" type="button" onClick={() => navigator.clipboard.writeText(ts(f.id))}>
              Copy
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
