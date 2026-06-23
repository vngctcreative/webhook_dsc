import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import MessagePreview from './components/MessagePreview'
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
  username: '',
  avatar_url: '',
  embeds: [],
  components: [],
  file: null,
})

const BTN_STYLES = [
  { value: 1, label: 'Blurple' },
  { value: 2, label: 'Grey' },
  { value: 3, label: 'Green' },
  { value: 4, label: 'Red' },
  { value: 5, label: 'Link' },
]

function load(k, fb) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb }
  catch { return fb }
}

function buildPayload(msg) {
  const p = {}
  if (msg.content) p.content = msg.content
  if (msg.username) p.username = msg.username
  if (msg.avatar_url) p.avatar_url = msg.avatar_url
  if (msg.embeds.length > 0) {
    p.embeds = msg.embeds.map(e => {
      const o = { ...e }
      if (o.color) o.color = parseInt(String(o.color).replace('#', ''), 16)
      else delete o.color
      if (o.authorName) {
        o.author = { name: o.authorName }
        if (o.authorUrl) o.author.url = o.authorUrl
        if (o.authorIcon) o.author.icon_url = o.authorIcon
      }
      delete o.authorName; delete o.authorUrl; delete o.authorIcon
      if (o.footerText) {
        o.footer = { text: o.footerText }
        if (o.footerIcon) o.footer.icon_url = o.footerIcon
      }
      delete o.footerText; delete o.footerIcon
      if (!o.thumbnail) delete o.thumbnail
      if (!o.image) delete o.image
      if (!o.timestamp) delete o.timestamp
      else o.timestamp = new Date().toISOString()
      if (!o.title) delete o.title
      if (!o.description) delete o.description
      if (!o.url) delete o.url
      o.fields = (o.fields || []).filter(f => f.name || f.value)
      if (o.fields.length === 0) delete o.fields
      return o
    })
  }
  if (msg.components.length > 0) {
    p.components = msg.components
  }
  return p
}

export default function App() {
  const [webhooks, setWebhooks] = useState(() => load('wh_webhooks', []))
  const [activeId, setActiveId] = useState(() => load('wh_activeId', ''))
  const [messages, setMessages] = useState(() => load('wh_messages', [EMPTY_MSG()]))
  const [activeMsgIdx, setActiveMsgIdx] = useState(() => load('wh_activeMsg', 0))
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState(() => load('wh_history', []))

  useEffect(() => { localStorage.setItem('wh_webhooks', JSON.stringify(webhooks)) }, [webhooks])
  useEffect(() => { localStorage.setItem('wh_activeId', JSON.stringify(activeId)) }, [activeId])
  useEffect(() => { localStorage.setItem('wh_messages', JSON.stringify(messages)) }, [messages])
  useEffect(() => { localStorage.setItem('wh_activeMsg', JSON.stringify(activeMsgIdx)) }, [activeMsgIdx])
  useEffect(() => { localStorage.setItem('wh_history', JSON.stringify(history)) }, [history])

  const activeWebhook = webhooks.find(w => w.id === activeId)
  const msg = messages[activeMsgIdx] || messages[0]

  function addWebhook(url) {
    if (!url.trim()) return
    const id = Date.now().toString(36)
    setWebhooks(prev => [...prev, { id, url: url.trim(), name: `Webhook ${prev.length + 1}` }])
    if (!activeId) setActiveId(id)
  }

  function removeWebhook(id) {
    setWebhooks(prev => prev.filter(w => w.id !== id))
    if (activeId === id) {
      const r = webhooks.filter(w => w.id !== id)
      setActiveId(r.length > 0 ? r[0].id : '')
    }
  }

  function renameWebhook(id, name) {
    setWebhooks(prev => prev.map(w => w.id === id ? { ...w, name } : w))
  }

  function updateMsg(updates) {
    setMessages(prev => prev.map((m, i) => i === activeMsgIdx ? { ...m, ...updates } : m))
  }

  function addEmbed() {
    const msg = messages[activeMsgIdx]
    if (!msg) return
    if (msg.embeds.length >= 10) return
    updateMsg({ embeds: [...msg.embeds, EMPTY_EMBED()] })
  }

  function removeEmbed(idx) {
    const msg = messages[activeMsgIdx]
    if (!msg) return
    updateMsg({ embeds: msg.embeds.filter((_, i) => i !== idx) })
  }

  function updateEmbed(idx, updates) {
    const msg = messages[activeMsgIdx]
    if (!msg) return
    const embeds = msg.embeds.map((e, i) => i === idx ? { ...e, ...updates } : e)
    updateMsg({ embeds })
  }

  function updateField(eIdx, fIdx, key, val) {
    const msg = messages[activeMsgIdx]
    if (!msg) return
    const embeds = msg.embeds.map((e, i) => {
      if (i !== eIdx) return e
      const fields = e.fields.map((f, j) => j === fIdx ? { ...f, [key]: val } : f)
      return { ...e, fields }
    })
    updateMsg({ embeds })
  }

  function addField(eIdx) {
    const msg = messages[activeMsgIdx]
    if (!msg) return
    const embeds = msg.embeds.map((e, i) =>
      i === eIdx ? { ...e, fields: [...e.fields, { name: '', value: '', inline: false }] } : e
    )
    updateMsg({ embeds })
  }

  function removeField(eIdx, fIdx) {
    const msg = messages[activeMsgIdx]
    if (!msg) return
    const embeds = msg.embeds.map((e, i) =>
      i === eIdx ? { ...e, fields: e.fields.filter((_, j) => j !== fIdx) } : e
    )
    updateMsg({ embeds })
  }

  /* Components */
  function addRow() {
    const msg = messages[activeMsgIdx]
    if (!msg) return
    if (msg.components.length >= 5) return
    updateMsg({ components: [...msg.components, { type: 1, components: [] }] })
  }

  function removeRow(rIdx) {
    const msg = messages[activeMsgIdx]
    if (!msg) return
    updateMsg({ components: msg.components.filter((_, i) => i !== rIdx) })
  }

  function addButton(rIdx) {
    const msg = messages[activeMsgIdx]
    if (!msg) return
    const comp = msg.components[rIdx]
    if (!comp || comp.components.length >= 5) return
    const rows = msg.components.map((r, i) =>
      i === rIdx
        ? { ...r, components: [...r.components, { type: 2, style: 2, label: 'Button', url: '', custom_id: '', emoji: '' }] }
        : r
    )
    updateMsg({ components: rows })
  }

  function updateButton(rIdx, bIdx, key, val) {
    const msg = messages[activeMsgIdx]
    if (!msg) return
    const rows = msg.components.map((r, i) =>
      i === rIdx
        ? { ...r, components: r.components.map((b, j) => j === bIdx ? { ...b, [key]: val } : b) }
        : r
    )
    updateMsg({ components: rows })
  }

  function removeButton(rIdx, bIdx) {
    const msg = messages[activeMsgIdx]
    if (!msg) return
    const rows = msg.components.map((r, i) =>
      i === rIdx
        ? { ...r, components: r.components.filter((_, j) => j !== bIdx) }
        : r
    )
    updateMsg({ components: rows })
  }

  /* Messages */
  function addMessage() {
    const m = EMPTY_MSG()
    m.id = Date.now().toString(36)
    setMessages(prev => [...prev, m])
    setActiveMsgIdx(messages.length)
  }

  function removeMessage(idx) {
    if (messages.length <= 1) return
    setMessages(prev => prev.filter((_, i) => i !== idx))
    if (activeMsgIdx >= idx && activeMsgIdx > 0) {
      setActiveMsgIdx(activeMsgIdx - 1)
    }
  }

  function duplicateMessage(idx) {
    const m = messages[idx]
    if (!m) return
    const copy = { ...JSON.parse(JSON.stringify(m)), id: Date.now().toString(36) }
    setMessages(prev => {
      const n = [...prev]
      n.splice(idx + 1, 0, copy)
      return n
    })
    setActiveMsgIdx(idx + 1)
  }

  async function send() {
    if (!activeWebhook) return
    const enabled = document.querySelectorAll('.msg-check:checked')
    const toSend = enabled.length > 0
      ? messages.filter((_, i) => document.querySelector(`.msg-check-${i}`)?.checked)
      : messages

    if (toSend.length === 0) { setStatus({ type: 'error', text: 'Không có message nào được chọn' }); return }

    setSending(true)
    setStatus(null)
    let success = 0, fail = 0

    for (const msg of toSend) {
      const payload = buildPayload(msg)
      try {
        const formData = new FormData()
        formData.append('payload_json', JSON.stringify(payload))
        const fileInput = document.querySelector(`.file-${msg.id}`)
        const hasFile = fileInput?.files?.[0]
        if (hasFile) formData.append('file', hasFile)

        const res = await fetch(activeWebhook.url, {
          method: 'POST',
          body: hasFile ? formData : JSON.stringify(payload),
          headers: hasFile ? {} : { 'Content-Type': 'application/json' },
        })

        if (res.ok) {
          success++
          setHistory(prev => [{
            id: Date.now(), webhookName: activeWebhook.name,
            content: msg.content, timestamp: new Date().toISOString(), status: 'success',
          }, ...prev].slice(0, 200))
        } else {
          fail++
          const err = await res.text()
          setHistory(prev => [{
            id: Date.now(), webhookName: activeWebhook.name,
            content: msg.content, timestamp: new Date().toISOString(), status: 'error', error: err,
          }, ...prev].slice(0, 200))
        }
      } catch (err) {
        fail++
      }
    }

    if (fail === 0) setStatus({ type: 'success', text: `Đã gửi ${success} tin nhắn thành công!` })
    else setStatus({ type: 'error', text: `${success} thành công, ${fail} thất bại` })
    setSending(false)
  }

  return (
    <div className="app">
      <Sidebar
        webhooks={webhooks}
        activeId={activeId}
        onSelect={setActiveId}
        onAdd={addWebhook}
        onRemove={removeWebhook}
        onRename={renameWebhook}
      />

      <div className="main-area">
        {/* Messages list sidebar */}
        <div className="msg-sidebar">
          <div className="msg-sidebar-header">
            <h3>Messages ({messages.length})</h3>
            <button className="btn btn-sm btn-secondary" onClick={addMessage}>+</button>
          </div>
          <div className="msg-list">
            {messages.map((m, i) => (
              <div key={m.id} className={`msg-list-item ${i === activeMsgIdx ? 'active' : ''}`} onClick={() => setActiveMsgIdx(i)}>
                <input type="checkbox" className={`msg-check msg-check-${i}`} defaultChecked onClick={e => e.stopPropagation()} />
                <div className="msg-list-info">
                  <div className="msg-list-name">Message {i + 1}</div>
                  <div className="msg-list-preview">{m.content?.slice(0, 40) || '(empty)'}</div>
                </div>
                <div className="msg-list-actions">
                  <button className="btn-icon" onClick={e => { e.stopPropagation(); duplicateMessage(i) }} title="Duplicate">⧉</button>
                  {messages.length > 1 && (
                    <button className="btn-icon danger" onClick={e => { e.stopPropagation(); removeMessage(i) }} title="Xoá">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
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
              <div className="editor-toolbar">
                <button className="btn btn-sm btn-secondary" onClick={() => setStatus({ type: 'history', text: '' })}>Lịch sử ({history.length})</button>
              </div>
              {/* Profile */}
              <div className="editor-section">
                <div className="section-header"><h4>Profile</h4></div>
                <div className="profile-row">
                  <input className="input" placeholder="Tên hiển thị" value={msg.username} onChange={e => updateMsg({ username: e.target.value })} />
                  <input className="input" placeholder="Avatar URL" value={msg.avatar_url} onChange={e => updateMsg({ avatar_url: e.target.value })} />
                </div>
              </div>

              {/* Content */}
              <div className="editor-section">
                <div className="section-header"><h4>Content</h4></div>
                <textarea className="input content-input" placeholder="Nhập nội dung tin nhắn..." rows={4} value={msg.content} onChange={e => updateMsg({ content: e.target.value })} />
                <input type="file" className={`file-${msg.id}`} style={{ marginTop: 8, fontSize: 13 }} onChange={e => {
                  const file = e.target.files[0]
                  if (file) {
                    const url = URL.createObjectURL(file)
                    updateMsg({ filePreview: url })
                  } else {
                    updateMsg({ filePreview: null })
                  }
                }} />
              </div>

              {/* Embeds */}
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
                          <span className="toggle-switch"></span>
                          Timestamp
                        </label>
                      </details>
                    </div>
                  </div>
                ))}
              </div>

              {/* Components / Buttons */}
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

              {/* History panel */}
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

              {/* Send button */}
              {status && status.type !== 'history' && <div className={`status-bar ${status.type}`}>{status.type === 'success' ? '✓' : '✗'} {status.text}</div>}

              <button className="btn btn-primary btn-send" onClick={send} disabled={sending}>
                {sending ? (
                  <><span className="spinner"></span> Đang gửi...</>
                ) : (
                  <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg> Gửi {document.querySelectorAll('.msg-check:checked').length || messages.length} message(s)</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="preview-panel">
          <div className="preview-panel-header">
            <h4>Preview</h4>
          </div>
          <div className="preview-panel-body">
            {msg && <MessagePreview msg={msg} webhookName={activeWebhook?.name} />}
          </div>
        </div>
      </div>
    </div>
  )
}
