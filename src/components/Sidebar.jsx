import { useState } from 'react'
import { extractWebhookParts, fetchWebhookInfo } from '../lib/discord'

export default function Sidebar({
  webhooks, activeId, onSelect, onAdd, onRemove, onRename, onUpdateUrl,
  onSaveConfig, onLoadConfig, fileRef,
  backups, onSaveBackup, onLoadBackup, onDeleteBackup,
  onShareConfig, backupNameRef, onStatus,
}) {
  const [urlInput, setUrlInput] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editingUrlId, setEditingUrlId] = useState(null)
  const [editUrl, setEditUrl] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [showBackups, setShowBackups] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    const url = urlInput.trim()
    if (!url) return
    if (!extractWebhookParts(url)) {
      onStatus?.({ type: 'error', text: 'URL webhook không hợp lệ (cần dạng discord.com/api/webhooks/...)' })
      return
    }
    setLoading(true)
    try {
      const info = await fetchWebhookInfo(url)
      onAdd({
        url: info.url || url,
        name: info.name,
        avatar: info.avatar,
        channel_id: info.channel_id,
        guild_id: info.guild_id,
      })
      setUrlInput('')
      onStatus?.({ type: 'success', text: `Đã thêm webhook: ${info.name}` })
    } catch (err) {
      // Vẫn cho thêm URL nếu GET fail (CORS / network) — dùng tên tạm
      onAdd({ url, name: 'Webhook', avatar: '' })
      setUrlInput('')
      onStatus?.({ type: 'error', text: `Thêm URL nhưng không lấy được info: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }

  function startRename(w) {
    setEditingId(w.id)
    setEditName(w.name)
  }

  function submitRename(id) {
    onRename(id, editName.trim() || `Webhook ${webhooks.findIndex(w => w.id === id) + 1}`)
    setEditingId(null)
  }

  function startEditUrl(w) {
    setEditingUrlId(w.id)
    setEditUrl(w.url)
  }

  async function submitUrl(id) {
    const url = editUrl.trim()
    setEditingUrlId(null)
    if (!url || !extractWebhookParts(url)) {
      onStatus?.({ type: 'error', text: 'URL không hợp lệ' })
      return
    }
    try {
      const info = await fetchWebhookInfo(url)
      onUpdateUrl?.(id, {
        url: info.url || url,
        name: info.name,
        avatar: info.avatar,
        channel_id: info.channel_id,
        guild_id: info.guild_id,
      })
      onStatus?.({ type: 'success', text: 'Đã cập nhật webhook' })
    } catch {
      onUpdateUrl?.(id, { url })
    }
  }

  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <button className="sidebar-toggle" onClick={() => setCollapsed(false)} title="Mở rộng">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18L9 12L15 6"/></svg>
        </button>
      </div>
    )
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Webhooks</h2>
        <button className="sidebar-toggle" onClick={() => setCollapsed(true)} title="Thu gọn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18L15 12L9 6"/></svg>
        </button>
      </div>

      <form className="add-form" onSubmit={handleAdd}>
        <input
          className="input add-input"
          placeholder="Paste webhook URL..."
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          disabled={loading}
        />
        <button className="btn btn-primary btn-add" type="submit" disabled={!urlInput.trim() || loading} title="Add webhook">
          {loading ? '…' : '+'}
        </button>
      </form>
      <p className="sidebar-hint">Integrations → Webhooks → Copy URL</p>

      <div className="webhook-list">
        {webhooks.length === 0 && (
          <div className="empty-list">Chưa có webhook. Dán URL ở trên.</div>
        )}
        {webhooks.map((w) => (
          <div
            key={w.id}
            className={`webhook-item ${w.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(w.id)}
          >
            <div className="webhook-icon">
              {w.avatar ? (
                <img src={w.avatar} alt="" className="wh-avatar" />
              ) : (
                <div className="wh-avatar-fallback">{(w.name || 'W')[0]?.toUpperCase()}</div>
              )}
            </div>
            <div className="webhook-info">
              {editingId === w.id ? (
                <input
                  className="input inline-input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={() => submitRename(w.id)}
                  onKeyDown={e => e.key === 'Enter' && submitRename(w.id)}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="webhook-name" onDoubleClick={() => startRename(w)} title="Double-click để đổi tên">{w.name}</span>
              )}
              {editingUrlId === w.id ? (
                <input
                  className="input inline-input"
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  onBlur={() => submitUrl(w.id)}
                  onKeyDown={e => e.key === 'Enter' && submitUrl(w.id)}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 11 }}
                />
              ) : (
                <span
                  className="webhook-url"
                  onDoubleClick={(e) => { e.stopPropagation(); startEditUrl(w) }}
                  title="Double-click để sửa URL"
                >
                  {w.url ? (w.url.length > 36 ? w.url.slice(0, 36) + '…' : w.url) : '(chưa có URL)'}
                </span>
              )}
            </div>
            <button
              className="btn-icon danger remove-btn"
              onClick={e => { e.stopPropagation(); onRemove(w.id) }}
              title="Xoá webhook"
            >✕</button>
          </div>
        ))}
      </div>

      <div className="sidebar-config">
        <button className="btn btn-sm btn-secondary config-btn" onClick={onSaveConfig}>Save</button>
        <button className="btn btn-sm btn-secondary config-btn" onClick={() => fileRef.current?.click()}>Load</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => { onLoadConfig(e.target.files[0]); e.target.value = '' }} />
        <button className="btn btn-sm btn-secondary config-btn" onClick={onShareConfig}>Share</button>
        <button className="btn btn-sm btn-secondary config-btn" onClick={() => setShowBackups(!showBackups)}>Backup</button>
      </div>

      {showBackups && (
        <div className="sidebar-backups">
          <div className="sidebar-backups-header">
            <h3>Backups ({backups.length})</h3>
            <button className="btn-icon" onClick={() => setShowBackups(false)}>✕</button>
          </div>
          <div className="form-row" style={{ padding: '4px 8px' }}>
            <input ref={backupNameRef} className="input" placeholder="Tên backup..." style={{ fontSize: 12 }} />
            <button className="btn btn-sm btn-primary" onClick={() => { onSaveBackup(); setShowBackups(false) }}>Save</button>
          </div>
          <div className="backup-mini-list">
            {backups.length === 0 && <div className="empty-list" style={{ fontSize: 12 }}>Chưa có backup</div>}
            {backups.map(b => (
              <div key={b.id} className="backup-mini-item">
                <div className="backup-mini-info" onClick={() => { onLoadBackup(b.id); setShowBackups(false) }}>
                  <span className="backup-mini-name">{b.name}</span>
                  <span className="backup-mini-time">{new Date(b.timestamp).toLocaleDateString()}</span>
                </div>
                <button className="btn-icon danger" onClick={() => onDeleteBackup(b.id)} style={{ fontSize: 10 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
