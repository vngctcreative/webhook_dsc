import { useState, useEffect, useRef, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import MessagePreview from './components/MessagePreview'
import EmojiPicker from './components/EmojiPicker'
import './App.css'

const EMPTY_EMBED = () => ({
  title: '', description: '', url: '', color: '#5865f2',
  authorName: '', authorUrl: '', authorIcon: '',
  footerText: '', footerIcon: '',
  thumbnail: '', image: '', fields: [], timestamp: false,
})

const EMPTY_MSG = () => ({
  id: Date.now().toString(36),
  content: '',
  embeds: [],
  components: [],
  filePreview: null,
  messageLink: '',
  username: '',
  avatar_url: '',
  thread_name: '',
  flags: 0,
})

const BTN_STYLES = [
  { value: 1, label: 'Blurple' }, { value: 2, label: 'Grey' },
  { value: 3, label: 'Green' }, { value: 4, label: 'Red' }, { value: 5, label: 'Link' },
]

function load(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb } catch { return fb } }

function buildPayload(msg, wh) {
  const p = {}
  if (msg.content) p.content = msg.content
  const username = msg.username || wh?.name
  const avatar = msg.avatar_url || wh?.avatar
  if (username) p.username = username
  if (avatar) p.avatar_url = avatar
  if (msg.flags) p.flags = msg.flags
  if (msg.thread_name) p.thread_name = msg.thread_name
  if (msg.embeds.length > 0) {
    p.embeds = msg.embeds.map(e => {
      const o = { ...e }
      if (o.color) o.color = parseInt(String(o.color).replace('#', ''), 16); else delete o.color
      if (o.authorName) { o.author = { name: o.authorName }; if (o.authorUrl) o.author.url = o.authorUrl; if (o.authorIcon) o.author.icon_url = o.authorIcon }
      delete o.authorName; delete o.authorUrl; delete o.authorIcon
      if (o.footerText) { o.footer = { text: o.footerText }; if (o.footerIcon) o.footer.icon_url = o.footerIcon }
      delete o.footerText; delete o.footerIcon
      if (!o.thumbnail) delete o.thumbnail; if (!o.image) delete o.image
      if (!o.timestamp) delete o.timestamp; else o.timestamp = new Date().toISOString()
      if (!o.title) delete o.title; if (!o.description) delete o.description; if (!o.url) delete o.url
      o.fields = (o.fields || []).filter(f => f.name || f.value)
      if (o.fields.length === 0) delete o.fields
      return o
    })
  }
  if (msg.components.length > 0) p.components = msg.components
  return p
}

function extractWebhookParts(url) {
  const m = url.match(/\/webhooks\/(\d+)\/([^/\s?#]+)/)
  return m ? { id: m[1], token: m[2] } : null
}

function extractMessageId(link) {
  const m = link.match(/(?:channels\/\d+\/\d+\/)?(\d+)$/)
  return m ? m[1] : null
}

function encodeConfig(data) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))))
  } catch { return null }
}

function decodeConfig(str) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(str))))
  } catch { return null }
}

export default function App() {
  const [webhooks, setWebhooks] = useState(() => {
    const saved = load('wh_webhooks', [])
    if (saved.length === 0) return [{ id: '1', url: '', name: 'Webhook 1', avatar: '', messages: [EMPTY_MSG()], activeMsgIdx: 0 }]
    return saved.map(w => ({
      ...w, avatar: w.avatar || '', messages: w.messages || [EMPTY_MSG()],
      messages: (w.messages || []).map(m => ({ ...EMPTY_MSG(), ...m })),
      activeMsgIdx: w.activeMsgIdx ?? 0,
    }))
  })
  const [activeId, setActiveId] = useState(() => {
    const saved = load('wh_webhooks', [])
    if (saved.length === 0) return '1'
    const lastId = load('wh_activeId', '') || saved[0].id
    return saved.some(w => w.id === lastId) ? lastId : saved[0].id
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
  const fileRef = useRef(null)
  const backupNameRef = useRef(null)

  useEffect(() => { localStorage.setItem('wh_webhooks', JSON.stringify(webhooks)) }, [webhooks])
  useEffect(() => { localStorage.setItem('wh_activeId', JSON.stringify(activeId)) }, [activeId])
  useEffect(() => { localStorage.setItem('wh_history', JSON.stringify(history)) }, [history])
  useEffect(() => { localStorage.setItem('wh_backups', JSON.stringify(backups)) }, [backups])
  useEffect(() => { ['wh_messages','wh_activeMsg','wh_draftMsg','wh_draftUser','wh_draftAvatar','wh_draftEmbed','wh_includeEmbed'].forEach(k => localStorage.removeItem(k)) }, [])

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash && hash.startsWith('config=')) {
      const data = decodeConfig(hash.slice(7))
      if (data && data.webhooks) {
        const now = Date.now()
        const newWebhooks = data.webhooks.map((w, i) => ({
          id: (now + i).toString(36), url: w.url || '', name: w.name || `Webhook ${i + 1}`, avatar: w.avatar || '',
          messages: (w.messages || []).map(m => ({ ...EMPTY_MSG(), ...m })),
          activeMsgIdx: w.activeMsgIdx ?? 0,
        }))
        setWebhooks(newWebhooks)
        setActiveId(newWebhooks[0]?.id || '')
        setStatus({ type: 'success', text: 'Đã tải config từ URL!' })
      }
      window.location.hash = ''
    }
  }, [])

  const activeWebhook = webhooks.find(w => w.id === activeId)
  const messages = activeWebhook?.messages || []
  const activeMsgIdx = activeWebhook?.activeMsgIdx ?? 0
  const msg = messages[activeMsgIdx] || messages[0]

  function updateWh(fn) { setWebhooks(prev => prev.map(w => w.id === activeId ? fn(w) : w)) }

  function addWebhook(url) {
    if (!url.trim()) return
    const id = Date.now().toString(36)
    setWebhooks(prev => [...prev, { id, url: url.trim(), name: `Webhook ${prev.length + 1}`, avatar: '', messages: [EMPTY_MSG()], activeMsgIdx: 0 }])
    setActiveId(id)
  }

  function removeWebhook(id) {
    setWebhooks(prev => prev.filter(w => w.id !== id))
    if (activeId === id) {
      const r = webhooks.filter(w => w.id !== id)
      setActiveId(r.length > 0 ? r[0].id : '')
    }
  }

  function renameWebhook(id, name) { setWebhooks(prev => prev.map(w => w.id === id ? { ...w, name } : w)) }

  function updateMsg(updates) {
    updateWh(w => {
      const msgs = w.messages.map((m, i) => i === w.activeMsgIdx ? { ...m, ...updates } : m)
      return { ...w, messages: msgs }
    })
  }

  function addEmbed() {
    updateWh(w => {
      const m = w.messages[w.activeMsgIdx]
      if (!m || m.embeds.length >= 10) return w
      const msgs = w.messages.map((msg, i) => i === w.activeMsgIdx ? { ...msg, embeds: [...msg.embeds, EMPTY_EMBED()] } : msg)
      return { ...w, messages: msgs }
    })
  }

  function removeEmbed(idx) {
    updateWh(w => {
      const m = w.messages[w.activeMsgIdx]
      if (!m) return w
      const msgs = w.messages.map((msg, i) => i === w.activeMsgIdx ? { ...msg, embeds: msg.embeds.filter((_, j) => j !== idx) } : msg)
      return { ...w, messages: msgs }
    })
  }

  function updateEmbed(idx, updates) {
    updateWh(w => {
      const m = w.messages[w.activeMsgIdx]
      if (!m) return w
      const embeds = m.embeds.map((e, i) => i === idx ? { ...e, ...updates } : e)
      const msgs = w.messages.map((msg, i) => i === w.activeMsgIdx ? { ...msg, embeds } : msg)
      return { ...w, messages: msgs }
    })
  }

  function updateField(eIdx, fIdx, key, val) {
    updateWh(w => {
      const m = w.messages[w.activeMsgIdx]; if (!m) return w
      const embeds = m.embeds.map((e, i) => i !== eIdx ? e : { ...e, fields: e.fields.map((f, j) => j === fIdx ? { ...f, [key]: val } : f) })
      const msgs = w.messages.map((msg, i) => i === w.activeMsgIdx ? { ...msg, embeds } : msg)
      return { ...w, messages: msgs }
    })
  }

  function addField(eIdx) {
    updateWh(w => {
      const m = w.messages[w.activeMsgIdx]; if (!m) return w
      const embeds = m.embeds.map((e, i) => i === eIdx ? { ...e, fields: [...e.fields, { name: '', value: '', inline: false }] } : e)
      const msgs = w.messages.map((msg, i) => i === w.activeMsgIdx ? { ...msg, embeds } : msg)
      return { ...w, messages: msgs }
    })
  }

  function removeField(eIdx, fIdx) {
    updateWh(w => {
      const m = w.messages[w.activeMsgIdx]; if (!m) return w
      const embeds = m.embeds.map((e, i) => i === eIdx ? { ...e, fields: e.fields.filter((_, j) => j !== fIdx) } : e)
      const msgs = w.messages.map((msg, i) => i === w.activeMsgIdx ? { ...msg, embeds } : msg)
      return { ...w, messages: msgs }
    })
  }

  function addRow() {
    updateWh(w => {
      const m = w.messages[w.activeMsgIdx]; if (!m || m.components.length >= 5) return w
      const msgs = w.messages.map((msg, i) => i === w.activeMsgIdx ? { ...msg, components: [...msg.components, { type: 1, components: [] }] } : msg)
      return { ...w, messages: msgs }
    })
  }

  function removeRow(rIdx) {
    updateWh(w => {
      const m = w.messages[w.activeMsgIdx]; if (!m) return w
      const msgs = w.messages.map((msg, i) => i === w.activeMsgIdx ? { ...msg, components: msg.components.filter((_, j) => j !== rIdx) } : msg)
      return { ...w, messages: msgs }
    })
  }

  function addButton(rIdx) {
    updateWh(w => {
      const m = w.messages[w.activeMsgIdx]; if (!m) return w
      const comp = m.components[rIdx]; if (!comp || comp.components.length >= 5) return w
      const rows = m.components.map((r, i) => i === rIdx ? { ...r, components: [...r.components, { type: 2, style: 2, label: 'Button', url: '', custom_id: '', emoji: '' }] } : r)
      const msgs = w.messages.map((msg, i) => i === w.activeMsgIdx ? { ...msg, components: rows } : msg)
      return { ...w, messages: msgs }
    })
  }

  function updateButton(rIdx, bIdx, key, val) {
    updateWh(w => {
      const m = w.messages[w.activeMsgIdx]; if (!m) return w
      const rows = m.components.map((r, i) => i === rIdx ? { ...r, components: r.components.map((b, j) => j === bIdx ? { ...b, [key]: val } : b) } : r)
      const msgs = w.messages.map((msg, i) => i === w.activeMsgIdx ? { ...msg, components: rows } : msg)
      return { ...w, messages: msgs }
    })
  }

  function removeButton(rIdx, bIdx) {
    updateWh(w => {
      const m = w.messages[w.activeMsgIdx]; if (!m) return w
      const rows = m.components.map((r, i) => i === rIdx ? { ...r, components: r.components.filter((_, j) => j !== bIdx) } : r)
      const msgs = w.messages.map((msg, i) => i === w.activeMsgIdx ? { ...msg, components: rows } : msg)
      return { ...w, messages: msgs }
    })
  }

  function addMessage() {
    if (!activeWebhook) return
    updateWh(w => {
      const m = EMPTY_MSG(); m.id = Date.now().toString(36)
      return { ...w, messages: [...w.messages, m], activeMsgIdx: w.messages.length }
    })
  }

  function removeMessage(idx) {
    updateWh(w => {
      if (w.messages.length <= 1) return w
      const msgs = w.messages.filter((_, i) => i !== idx)
      const newIdx = w.activeMsgIdx >= idx && w.activeMsgIdx > 0 ? w.activeMsgIdx - 1 : w.activeMsgIdx
      return { ...w, messages: msgs, activeMsgIdx: Math.min(newIdx, msgs.length - 1) }
    })
  }

  function duplicateMessage(idx) {
    updateWh(w => {
      const m = w.messages[idx]; if (!m) return w
      const copy = { ...JSON.parse(JSON.stringify(m)), id: Date.now().toString(36) }
      const msgs = [...w.messages]; msgs.splice(idx + 1, 0, copy)
      return { ...w, messages: msgs, activeMsgIdx: idx + 1 }
    })
  }

  function setActiveMsgIdx(idx) {
    updateWh(w => ({ ...w, activeMsgIdx: idx }))
  }

  function clearAll() {
    if (!confirm('Xoá tất cả webhooks và messages?')) return
    setWebhooks([{ id: '1', url: '', name: 'Webhook 1', avatar: '', messages: [EMPTY_MSG()], activeMsgIdx: 0 }])
    setActiveId('1')
    setStatus({ type: 'success', text: 'Đã xoá tất cả!' })
  }

  function saveConfig() {
    const data = {
      version: 2,
      webhooks: webhooks.map(w => ({
        url: w.url, name: w.name, avatar: w.avatar,
        messages: w.messages.map(m => ({ content: m.content, embeds: m.embeds, components: m.components, username: m.username, avatar_url: m.avatar_url, thread_name: m.thread_name, flags: m.flags })),
        activeMsgIdx: w.activeMsgIdx,
      })),
      activeWebhookUrl: activeWebhook?.url || '',
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'webhook-config.json'
    a.click(); setStatus({ type: 'success', text: 'Đã lưu config!' })
  }

  function loadConfig(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        if (!data.version || !data.webhooks) { setStatus({ type: 'error', text: 'File không hợp lệ!' }); return }
        const now = Date.now()
        const newWebhooks = data.webhooks.map((w, i) => ({
          id: (now + i).toString(36), url: w.url, name: w.name, avatar: w.avatar || '',
          messages: (w.messages || []).map(m => ({ ...EMPTY_MSG(), ...m })),
          activeMsgIdx: w.activeMsgIdx ?? 0,
        }))
        setWebhooks(newWebhooks)
        if (data.activeWebhookUrl) {
          const found = newWebhooks.find(w => w.url === data.activeWebhookUrl)
          setActiveId(found ? found.id : newWebhooks[0]?.id || '')
        } else {
          setActiveId(newWebhooks[0]?.id || '')
        }
        setStatus({ type: 'success', text: `Đã tải config (${newWebhooks.length} webhooks)!` })
      } catch (err) { setStatus({ type: 'error', text: `Lỗi: ${err.message}` }) }
    }
    reader.readAsText(file)
  }

  /* --- Backup Management --- */
  function saveBackup() {
    const name = backupNameRef.current?.value?.trim() || `Backup ${backups.length + 1}`
    const data = {
      version: 2,
      webhooks: webhooks.map(w => ({
        url: w.url, name: w.name, avatar: w.avatar,
        messages: w.messages.map(m => ({ content: m.content, embeds: m.embeds, components: m.components, username: m.username, avatar_url: m.avatar_url, thread_name: m.thread_name, flags: m.flags })),
        activeMsgIdx: w.activeMsgIdx,
      })),
    }
    const newBackup = { id: Date.now().toString(36), name, data, timestamp: new Date().toISOString() }
    setBackups(prev => [newBackup, ...prev])
    setStatus({ type: 'success', text: `Đã lưu backup "${name}"!` })
  }

  function loadBackup(id) {
    const backup = backups.find(b => b.id === id)
    if (!backup) return
    const d = backup.data
    const now = Date.now()
    const newWebhooks = d.webhooks.map((w, i) => ({
      id: (now + i).toString(36), url: w.url || '', name: w.name || `Webhook ${i + 1}`, avatar: w.avatar || '',
      messages: (w.messages || []).map(m => ({ ...EMPTY_MSG(), ...m })),
      activeMsgIdx: w.activeMsgIdx ?? 0,
    }))
    setWebhooks(newWebhooks)
    setActiveId(newWebhooks[0]?.id || '')
    setStatus({ type: 'success', text: `Đã tải backup "${backup.name}"!` })
  }

  function deleteBackup(id) {
    setBackups(prev => prev.filter(b => b.id !== id))
  }

  /* --- Share via URL --- */
  function shareConfig() {
    const data = {
      version: 2,
      webhooks: webhooks.map(w => ({
        url: w.url, name: w.name, avatar: w.avatar,
        messages: w.messages.map(m => ({ content: m.content, embeds: m.embeds, components: m.components, username: m.username, avatar_url: m.avatar_url, thread_name: m.thread_name, flags: m.flags })),
      })),
    }
    const encoded = encodeConfig(data)
    if (!encoded) { setStatus({ type: 'error', text: 'Lỗi khi mã hoá config!' }); return }
    const url = `${window.location.origin}${window.location.pathname}#config=${encoded}`
    navigator.clipboard.writeText(url)
    setStatus({ type: 'success', text: 'Đã copy URL chia sẻ vào clipboard!' })
  }

  /* --- JSON Editor --- */
  function syncJsonFromState() {
    if (!activeWebhook) return
    const payload = buildPayload(msg, activeWebhook)
    setJsonText(JSON.stringify({ ...payload, embeds: msg.embeds, components: msg.components }, null, 2))
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
      if (parsed.embeds) {
        updates.embeds = parsed.embeds.map(e => ({
          title: e.title || '', description: e.description || '', url: e.url || '',
          color: e.color ? (typeof e.color === 'number' ? '#' + e.color.toString(16).padStart(6, '0') : e.color) : '#5865f2',
          authorName: e.author?.name || '', authorUrl: e.author?.url || '', authorIcon: e.author?.icon_url || '',
          footerText: e.footer?.text || '', footerIcon: e.footer?.icon_url || '',
          thumbnail: e.thumbnail?.url || '', image: e.image?.url || '',
          fields: (e.fields || []).map(f => ({ name: f.name || '', value: f.value || '', inline: f.inline || false })),
          timestamp: !!e.timestamp,
        }))
      }
      if (parsed.components) updates.components = parsed.components
      updateMsg(updates)
      setStatus({ type: 'success', text: 'Đã áp dụng JSON!' })
    } catch (err) { setStatus({ type: 'error', text: `JSON lỗi: ${err.message}` }) }
  }

  /* --- Send / Update Message --- */
  async function send() {
    if (!activeWebhook) return
    const enabled = document.querySelectorAll('.msg-check:checked')
    const toSend = enabled.length > 0 ? messages.filter((_, i) => document.querySelector(`.msg-check-${i}`)?.checked) : messages
    if (toSend.length === 0) { setStatus({ type: 'error', text: 'Không có message nào được chọn' }); return }
    setSending(true); setStatus(null)
    let success = 0, fail = 0
    for (const m of toSend) {
      const payload = buildPayload(m, activeWebhook)
      try {
        const formData = new FormData()
        formData.append('payload_json', JSON.stringify(payload))
        const fileInput = document.querySelector(`.file-${m.id}`); const hasFile = fileInput?.files?.[0]
        if (hasFile) formData.append('file', fileInput.files[0])

        const wh = extractWebhookParts(activeWebhook.url)
        const mid = m.messageLink ? extractMessageId(m.messageLink) : null
        const isUpdate = wh && mid

        const url = isUpdate ? `https://discord.com/api/webhooks/${wh.id}/${wh.token}/messages/${mid}` : activeWebhook.url
        const res = await fetch(url, { method: isUpdate ? 'PATCH' : 'POST', body: formData })
        if (res.ok) { success++; setHistory(prev => [{ id: Date.now(), webhookName: activeWebhook.name, content: m.content, timestamp: new Date().toISOString(), status: 'success' }, ...prev].slice(0, 200)) }
        else { fail++; const err = await res.text(); setHistory(prev => [{ id: Date.now(), webhookName: activeWebhook.name, content: m.content, timestamp: new Date().toISOString(), status: 'error', error: err }, ...prev].slice(0, 200)) }
      } catch (err) { fail++ }
    }
    if (fail === 0) setStatus({ type: 'success', text: `Đã ${toSend.every(m => m.messageLink) ? 'cập nhật' : 'gửi'} ${success} tin nhắn thành công!` })
    else setStatus({ type: 'error', text: `${success} thành công, ${fail} thất bại` })
    setSending(false)
  }

  async function fetchMessage() {
    if (!activeWebhook?.url || !msg?.messageLink) return
    const wh = extractWebhookParts(activeWebhook.url)
    const mid = extractMessageId(msg.messageLink)
    if (!wh || !mid) { setStatus({ type: 'error', text: 'Link webhook hoặc message không hợp lệ!' }); return }
    setStatus({ type: 'info', text: 'Đang tải...' })
    try {
      const res = await fetch(`https://discord.com/api/webhooks/${wh.id}/${wh.token}/messages/${mid}`)
      if (!res.ok) { setStatus({ type: 'error', text: `Lỗi khi tải: ${res.status}` }); return }
      const d = await res.json()
      const embeds = (d.embeds || []).map(e => ({
        title: e.title || '', description: e.description || '', url: e.url || '', color: e.color ? '#' + e.color.toString(16).padStart(6, '0') : '#5865f2',
        authorName: e.author?.name || '', authorUrl: e.author?.url || '', authorIcon: e.author?.icon_url || '',
        footerText: e.footer?.text || '', footerIcon: e.footer?.icon_url || '',
        thumbnail: e.thumbnail?.url || '', image: e.image?.url || '',
        fields: (e.fields || []).map(f => ({ name: f.name || '', value: f.value || '', inline: f.inline || false })),
        timestamp: !!e.timestamp,
      }))
      updateMsg({
        content: d.content || '',
        embeds,
        components: d.components || [],
        filePreview: d.attachments?.[0]?.url || null,
        username: d.author?.username || '',
        avatar_url: d.author?.avatar || '',
      })
      setStatus({ type: 'success', text: 'Đã tải nội dung từ message!' })
    } catch (err) { setStatus({ type: 'error', text: `Lỗi: ${err.message}` }) }
  }

  async function updateMessage() {
    if (!activeWebhook?.url || !msg?.messageLink) return
    const wh = extractWebhookParts(activeWebhook.url)
    const mid = extractMessageId(msg.messageLink)
    if (!wh || !mid) { setStatus({ type: 'error', text: 'Link webhook hoặc message không hợp lệ!' }); return }
    setStatus({ type: 'info', text: 'Đang cập nhật...' })
    const payload = buildPayload(msg, activeWebhook)
    try {
      const formData = new FormData()
      formData.append('payload_json', JSON.stringify(payload))
      const res = await fetch(`https://discord.com/api/webhooks/${wh.id}/${wh.token}/messages/${mid}`, { method: 'PATCH', body: formData })
      if (res.ok) setStatus({ type: 'success', text: 'Đã cập nhật message!' })
      else { const err = await res.text(); setStatus({ type: 'error', text: `Lỗi: ${err}` }) }
    } catch (err) { setStatus({ type: 'error', text: `Lỗi: ${err.message}` }) }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <button className="mobile-hamburger" onClick={() => setMobilePanel(mobilePanel === 'webhooks' ? 'editor' : 'webhooks')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/>
          </svg>
          <span className="header-brand">Webhook Manager</span>
        </div>
        <nav className="header-nav">
          <button className="btn btn-sm btn-secondary" onClick={clearAll}>Clear All</button>
          <button className="btn btn-sm btn-secondary" onClick={() => setShowSettings(!showSettings)}>Settings</button>
          <button className="btn btn-sm btn-secondary" onClick={() => setStatus({ type: 'history', text: '' })}>History ({history.length})</button>
          <a className="btn btn-sm btn-secondary" href="https://discord.com/developers/docs/resources/webhook" target="_blank" rel="noopener noreferrer">Help</a>
        </nav>
      </header>

      <div className={`main-area${!activeWebhook ? ' no-webhook' : ''}`}>
        <div className={`mobile-overlay ${mobilePanel === 'webhooks' ? 'open' : ''}`}>
          <div className="mobile-overlay-header">
            <h3>Webhooks</h3>
            <button className="btn-icon" onClick={() => setMobilePanel('editor')}>✕</button>
          </div>
          <Sidebar
            webhooks={webhooks} activeId={activeId} onSelect={(id) => { setActiveId(id); setMobilePanel('editor') }}
            onAdd={addWebhook} onRemove={removeWebhook} onRename={renameWebhook}
            onSaveConfig={saveConfig} onLoadConfig={loadConfig}
            fileRef={fileRef}
            backups={backups} onSaveBackup={saveBackup} onLoadBackup={loadBackup} onDeleteBackup={deleteBackup}
            onShareConfig={shareConfig} backupNameRef={backupNameRef}
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
              <div key={m.id} className={`msg-list-item ${i === activeMsgIdx ? 'active' : ''}`} onClick={() => { setActiveMsgIdx(i); setMobilePanel('editor') }}>
                <input type="checkbox" className={`msg-check msg-check-${i}`} defaultChecked onClick={e => e.stopPropagation()} />
                <div className="msg-list-info">
                  <div className="msg-list-name">Message {i + 1}</div>
                  <div className="msg-list-preview">{m.content?.slice(0, 40) || '(empty)'}</div>
                </div>
                <div className="msg-list-actions">
                  <button className="btn-icon" onClick={e => { e.stopPropagation(); duplicateMessage(i) }} title="Duplicate">⧉</button>
                  {messages.length > 1 && <button className="btn-icon danger" onClick={e => { e.stopPropagation(); removeMessage(i) }} title="Xoá">✕</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>

        <div className="editor">
          {!activeWebhook ? (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
              <h3>Chưa có webhook nào</h3>
              <p>Thêm webhook URL ở sidebar bên trái để bắt đầu</p>
            </div>
          ) : !msg ? (
            <div className="empty-state"><p>Chọn hoặc tạo message</p></div>
          ) : (
            <div className="editor-content">
              {/* Editor Tabs */}
              <div className="editor-tabs">
                <button className={`editor-tab ${editorTab === 'visual' ? 'active' : ''}`} onClick={() => setEditorTab('visual')}>Visual Editor</button>
                <button className={`editor-tab ${editorTab === 'json' ? 'active' : ''}`} onClick={() => { setEditorTab('json'); syncJsonFromState() }}>JSON Editor</button>
              </div>

              {editorTab === 'json' ? (
                <div className="json-editor-section">
                  <textarea className="input json-textarea" value={jsonText} onChange={e => setJsonText(e.target.value)} spellCheck={false} />
                  <button className="btn btn-sm btn-primary" onClick={syncStateFromJson} style={{ marginTop: 6 }}>Apply JSON</button>
                </div>
              ) : (
              <>
              <div className="editor-section">
                <div className="section-header"><h4>Webhook Settings</h4></div>
                <div className="profile-row">
                  <input className="input" placeholder="Tên mặc định" value={activeWebhook?.name || ''} onChange={e => setWebhooks(prev => prev.map(w => w.id === activeId ? { ...w, name: e.target.value } : w))} />
                  <input className="input" placeholder="Avatar URL mặc định" value={activeWebhook?.avatar || ''} onChange={e => setWebhooks(prev => prev.map(w => w.id === activeId ? { ...w, avatar: e.target.value } : w))} />
                </div>
              </div>

              {/* Per-message Profile Override */}
              <div className="editor-section">
                <details className="embed-details">
                  <summary>Profile Override (per message)</summary>
                  <div className="form-row" style={{ marginTop: 6 }}>
                    <input className="input" placeholder="Username (mặc định: webhook)" value={msg.username} onChange={e => updateMsg({ username: e.target.value })} />
                    <input className="input" placeholder="Avatar URL" value={msg.avatar_url} onChange={e => updateMsg({ avatar_url: e.target.value })} />
                  </div>
                </details>
              </div>

              {/* Thread Settings */}
              <div className="editor-section">
                <details className="embed-details">
                  <summary>Thread Settings</summary>
                  <div className="form-row" style={{ marginTop: 6 }}>
                    <input className="input" placeholder="Tên thread (để trống nếu không tạo thread)" value={msg.thread_name} onChange={e => updateMsg({ thread_name: e.target.value })} />
                  </div>
                </details>
              </div>

              {/* Message Flags */}
              <div className="editor-section">
                <details className="embed-details">
                  <summary>Message Flags</summary>
                  <div style={{ marginTop: 6 }}>
                    <label className="toggle-label">
                      <input type="checkbox" checked={(msg.flags & 4) !== 0} onChange={e => updateMsg({ flags: e.target.checked ? (msg.flags | 4) : (msg.flags & ~4) })} />
                      <span className="toggle-switch"></span> Suppress Embeds
                    </label>
                  </div>
                </details>
              </div>

              <div className="editor-section">
                <div className="section-header"><h4>Content</h4></div>
                <div style={{ position: 'relative' }}>
                  <textarea className="input content-input" placeholder="Nhập nội dung tin nhắn..." rows={4} value={msg.content} onChange={e => updateMsg({ content: e.target.value })} />
                  <button className="btn-icon emoji-trigger" onClick={() => setShowEmoji(!showEmoji)} title="Emoji">😊</button>
                  {showEmoji && (
                    <div className="emoji-picker-wrapper">
                      <EmojiPicker onSelect={(emoji) => { updateMsg({ content: (msg.content || '') + emoji }); setShowEmoji(false) }} onClose={() => setShowEmoji(false)} />
                    </div>
                  )}
                </div>
                <div className="file-attach-row">
                  <input type="file" className={`file-${msg.id}`} style={{ fontSize: 13, flex: 1, minWidth: 0 }} onChange={e => {
                    const file = e.target.files[0]
                    if (file) updateMsg({ filePreview: URL.createObjectURL(file) })
                  }} />
                  {msg.filePreview && (
                    <button className="btn-icon danger file-remove-btn" onClick={() => {
                      const fi = document.querySelector(`.file-${msg.id}`)
                      if (fi) fi.value = ''
                      updateMsg({ filePreview: null })
                    }} title="Xoá file">✕</button>
                  )}
                </div>
              </div>

              <div className="editor-section">
                <div className="section-header"><h4>Message Link</h4></div>
                <div className="form-row">
                  <input className="input" placeholder="https://discord.com/channels/..." value={msg.messageLink} onChange={e => updateMsg({ messageLink: e.target.value })} />
                  <button className="btn btn-sm btn-primary" onClick={fetchMessage} disabled={!msg.messageLink || !activeWebhook?.url}>Load</button>
                </div>
              </div>

              <div className="editor-section">
                <div className="section-header">
                  <h4>Embeds ({msg.embeds.length}/10)</h4>
                  {msg.embeds.length < 10 && <button className="btn btn-sm btn-secondary" onClick={addEmbed}>+ Add Embed</button>}
                </div>
                {msg.embeds.map((embed, ei) => (
                  <div key={ei} className="embed-editor">
                    <div className="embed-editor-header">
                      <span className="embed-editor-title">Embed {ei + 1}</span>
                      <button className="btn-icon danger" onClick={() => removeEmbed(ei)} title="Xoá embed">✕</button>
                    </div>
                    <div className="embed-editor-body">
                      <div className="form-row">
                        <input type="color" value={embed.color} onChange={e => updateEmbed(ei, { color: e.target.value })} className="color-swatch" />
                        <input className="input" placeholder="#5865f2" value={embed.color} onChange={e => updateEmbed(ei, { color: e.target.value })} />
                        <input className="input" placeholder="Title" value={embed.title} onChange={e => updateEmbed(ei, { title: e.target.value })} />
                      </div>
                      <input className="input" placeholder="URL" value={embed.url} onChange={e => updateEmbed(ei, { url: e.target.value })} style={{ marginTop: 6 }} />
                      <textarea className="input" placeholder="Description" rows={2} value={embed.description} onChange={e => updateEmbed(ei, { description: e.target.value })} style={{ marginTop: 6 }} />
                      <details className="embed-details">
                        <summary>Author</summary>
                        <div className="form-row" style={{ marginTop: 6 }}>
                          <input className="input" placeholder="Name" value={embed.authorName} onChange={e => updateEmbed(ei, { authorName: e.target.value })} />
                          <input className="input" placeholder="URL" value={embed.authorUrl} onChange={e => updateEmbed(ei, { authorUrl: e.target.value })} />
                        </div>
                        <input className="input" placeholder="Icon URL" value={embed.authorIcon} onChange={e => updateEmbed(ei, { authorIcon: e.target.value })} style={{ marginTop: 6 }} />
                      </details>
                      <details className="embed-details">
                        <summary>Fields ({embed.fields.length})</summary>
                        {embed.fields.map((f, fi) => (
                          <div key={fi} className="field-row" style={{ marginTop: 6 }}>
                            <input className="input" placeholder="Name" value={f.name} onChange={e => updateField(ei, fi, 'name', e.target.value)} />
                            <input className="input" placeholder="Value" value={f.value} onChange={e => updateField(ei, fi, 'value', e.target.value)} />
                            <label className="inline-label"><input type="checkbox" checked={f.inline} onChange={e => updateField(ei, fi, 'inline', e.target.checked)} /> Inline</label>
                            <button className="btn-icon danger" onClick={() => removeField(ei, fi)}>✕</button>
                          </div>
                        ))}
                        {embed.fields.length < 25 && <button className="btn btn-sm btn-secondary" onClick={() => addField(ei)} style={{ marginTop: 6 }}>+ Field</button>}
                      </details>
                      <details className="embed-details">
                        <summary>Footer & Media</summary>
                        <div className="form-row" style={{ marginTop: 6 }}>
                          <input className="input" placeholder="Footer text" value={embed.footerText} onChange={e => updateEmbed(ei, { footerText: e.target.value })} />
                          <input className="input" placeholder="Footer icon URL" value={embed.footerIcon} onChange={e => updateEmbed(ei, { footerIcon: e.target.value })} />
                        </div>
                        <div className="form-row" style={{ marginTop: 6 }}>
                          <input className="input" placeholder="Thumbnail URL" value={embed.thumbnail} onChange={e => updateEmbed(ei, { thumbnail: e.target.value })} />
                          <input className="input" placeholder="Image URL" value={embed.image} onChange={e => updateEmbed(ei, { image: e.target.value })} />
                        </div>
                        <label className="toggle-label" style={{ marginTop: 6 }}>
                          <input type="checkbox" checked={embed.timestamp} onChange={e => updateEmbed(ei, { timestamp: e.target.checked })} />
                          <span className="toggle-switch"></span> Timestamp
                        </label>
                      </details>
                    </div>
                  </div>
                ))}
              </div>

              <div className="editor-section">
                <div className="section-header">
                  <h4>Components ({msg.components.length}/5 rows)</h4>
                  {msg.components.length < 5 && <button className="btn btn-sm btn-secondary" onClick={addRow}>+ Row</button>}
                </div>
                {msg.components.map((row, ri) => (
                  <div key={ri} className="component-row">
                    <div className="component-row-header">
                      <span>Row {ri + 1}</span>
                      <div className="msg-list-actions">
                        <span className="text-muted" style={{ fontSize: 11 }}>{row.components.length}/5 btns</span>
                        {row.components.length < 5 && <button className="btn-icon" onClick={() => addButton(ri)} title="Add button">+</button>}
                        <button className="btn-icon danger" onClick={() => removeRow(ri)} title="Xoá row">✕</button>
                      </div>
                    </div>
                    <div className="component-buttons">
                      {row.components.map((btn, bi) => (
                        <div key={bi} className="component-btn-editor">
                          <div className="form-row" style={{ flexWrap: 'wrap' }}>
                            <select className="input btn-style-select" value={btn.style} onChange={e => updateButton(ri, bi, 'style', Number(e.target.value))}>
                              {BTN_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <input className="input" placeholder="Label" value={btn.label} onChange={e => updateButton(ri, bi, 'label', e.target.value)} />
                            {btn.style === 5 ? (
                              <input className="input" placeholder="https://..." value={btn.url} onChange={e => updateButton(ri, bi, 'url', e.target.value)} />
                            ) : (
                              <input className="input" placeholder="custom_id" value={btn.custom_id} onChange={e => updateButton(ri, bi, 'custom_id', e.target.value)} />
                            )}
                            <input className="input btn-emoji" placeholder="emoji" value={btn.emoji} onChange={e => updateButton(ri, bi, 'emoji', e.target.value)} />
                            <button className="btn-icon danger" onClick={() => removeButton(ri, bi)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {status?.type === 'history' && (
                <div className="history-panel">
                  <div className="section-header"><h4>Lịch sử gửi ({history.length})</h4>
                    <button className="btn btn-sm btn-secondary" onClick={() => { setHistory([]); setStatus(null) }}>Xoá hết</button>
                  </div>
                  {history.length === 0 ? (
                    <div className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Chưa có lịch sử</div>
                  ) : (
                    <div className="history-list-compact">
                      {history.slice(0, 50).map((entry) => (
                        <div key={entry.id} className="history-entry">
                          <span className={entry.status === 'success' ? 'h-success' : 'h-error'}>{entry.status === 'success' ? '✓' : '✗'}</span>
                          <span className="h-webhook">{entry.webhookName}</span>
                          <span className="h-content">{entry.content?.slice(0, 30) || '(embed)'}</span>
                          <span className="h-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                          <button className="btn-icon danger" onClick={() => setHistory(prev => prev.filter(e => e.id !== entry.id))}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {status && status.type !== 'history' && <div className={`status-bar ${status.type}`}>{status.type === 'success' ? '✓' : '✗'} {status.text}</div>}

              <button className="btn btn-primary btn-send" onClick={send} disabled={sending}>
                {sending ? (<><span className="spinner"></span> Đang xử lý...</>) : (
                  <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg> {msg?.messageLink ? 'Cập nhật tin nhắn' : `Gửi ${document.querySelectorAll('.msg-check:checked').length || messages.length} message(s)`}</>
                )}
              </button>

              <TimestampGenerator />
              </>
              )}
            </div>
          )}
        </div>

        <div className={`mobile-overlay ${mobilePanel === 'preview' ? 'open' : ''}`}>
          <div className="mobile-overlay-header">
            <h3>Preview</h3>
            <button className="btn-icon" onClick={() => setMobilePanel('editor')}>✕</button>
          </div>
        <div className="preview-panel">
          <div className="preview-panel-header"><h4>Preview</h4></div>
          <div className="preview-panel-body">
            {msg && <MessagePreview msg={msg} webhookName={activeWebhook?.name} webhookAvatar={activeWebhook?.avatar} />}
          </div>
        </div>
        </div>
      </div>

      <nav className="mobile-tab-bar">
        <button className={`mobile-tab ${mobilePanel === 'webhooks' ? 'active' : ''}`} onClick={() => setMobilePanel('webhooks')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
          <span>Webhooks</span>
        </button>
        <button className={`mobile-tab ${mobilePanel === 'messages' ? 'active' : ''}`} onClick={() => setMobilePanel('messages')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Messages</span>
        </button>
        <button className={`mobile-tab ${mobilePanel === 'editor' ? 'active' : ''}`} onClick={() => setMobilePanel('editor')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span>Editor</span>
        </button>
        <button className={`mobile-tab ${mobilePanel === 'preview' ? 'active' : ''}`} onClick={() => setMobilePanel('preview')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>Preview</span>
        </button>
      </nav>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Settings</h3>
              <button className="btn-icon" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="editor-section">
                <div className="section-header"><h4>Backups ({backups.length})</h4></div>
                <div className="form-row" style={{ marginBottom: 8 }}>
                  <input ref={backupNameRef} className="input" placeholder="Tên backup..." />
                  <button className="btn btn-sm btn-primary" onClick={() => { saveBackup(); setShowSettings(false) }}>Save Backup</button>
                </div>
                {backups.length === 0 ? (
                  <div className="text-muted" style={{ textAlign: 'center', padding: 12 }}>Chưa có backup nào</div>
                ) : (
                  <div className="backup-list">
                    {backups.map(b => (
                      <div key={b.id} className="backup-item">
                        <div className="backup-info">
                          <span className="backup-name">{b.name}</span>
                          <span className="backup-time">{new Date(b.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="msg-list-actions">
                          <button className="btn btn-sm btn-secondary" onClick={() => { loadBackup(b.id); setShowSettings(false) }}>Load</button>
                          <button className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(JSON.stringify(b.data, null, 2))}>Copy</button>
                          <button className="btn-icon danger" onClick={() => deleteBackup(b.id)}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="editor-section">
                <div className="section-header"><h4>Config Management</h4></div>
                <div className="form-row">
                  <button className="btn btn-sm btn-secondary" onClick={saveConfig}>Save to File</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => fileRef.current?.click()}>Load from File</button>
                  <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => { loadConfig(e.target.files[0]); e.target.value = '' }} />
                  <button className="btn btn-sm btn-secondary" onClick={shareConfig}>Share via URL</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <span>Webhook Manager &mdash; Free &amp; Open Source</span>
        <span>
          <a href="https://discord.com/developers/docs/resources/webhook" target="_blank" rel="noopener noreferrer">Discord API Docs</a>
          {' '}&middot;{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); setShowSettings(true) }}>Settings</a>
        </span>
      </footer>
    </div>
  )
}

const TS_FORMATS = [
  { id: 't', label: 'Short Time', ex: '12:00 PM' },
  { id: 'T', label: 'Long Time', ex: '12:00:00 PM' },
  { id: 'd', label: 'Short Date', ex: '12/01/2024' },
  { id: 'D', label: 'Long Date', ex: 'December 1, 2024' },
  { id: 'f', label: 'Short Date/Time', ex: 'December 1, 2024 12:00 PM' },
  { id: 'F', label: 'Long Date/Time', ex: 'Monday, December 1, 2024 12:00 PM' },
  { id: 'R', label: 'Relative', ex: '2 months ago' },
]

function TimestampGenerator() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))

  const d = new Date(date)
  const unix = Math.floor(d.getTime() / 1000)

  function ts(fmt) {
    const t = fmt === 'f' ? `<t:${unix}>` : `<t:${unix}:${fmt}>`
    return t
  }

  function preview(fmt) {
    switch (fmt) {
      case 't': return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      case 'T': return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
      case 'd': return d.toLocaleDateString('en-US')
      case 'D': return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      case 'f': return `${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      case 'F': return `${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`
      case 'R': { const s = Math.floor((d - new Date()) / 1000); const a = Math.abs(s); const r = a < 60 ? `${a}s ago` : a < 3600 ? `${Math.floor(a/60)}m ago` : a < 86400 ? `${Math.floor(a/3600)}h ago` : a < 2592000 ? `${Math.floor(a/86400)}d ago` : a < 31536000 ? `${Math.floor(a/2592000)}mo ago` : `${Math.floor(a/31536000)}y ago`; return s > 0 ? r : r.replace('ago', 'from now') }
      default: return ''
    }
  }

  function copy(fmt) {
    navigator.clipboard.writeText(ts(fmt))
  }

  return (
    <div className="editor-section ts-generator">
      <div className="section-header"><h4>Discord Timestamp</h4></div>
      <div className="form-row">
        <input type="datetime-local" className="input" value={date} onChange={e => setDate(e.target.value)} />
        <button className="btn btn-sm btn-secondary" onClick={() => setDate(new Date().toISOString().slice(0, 16))}>Now</button>
      </div>
      <div className="ts-list">
        {TS_FORMATS.map(f => (
          <div key={f.id} className="ts-row">
            <span className="ts-badge">{f.id}</span>
            <span className="ts-preview">{preview(f.id)}</span>
            <code className="ts-code">{ts(f.id)}</code>
            <button className="btn btn-sm btn-primary" onClick={() => copy(f.id)}>Copy</button>
          </div>
        ))}
      </div>
    </div>
  )
}
