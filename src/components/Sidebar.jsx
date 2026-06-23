import { useState } from 'react'

export default function Sidebar({ webhooks, activeId, onSelect, onAdd, onRemove, onRename }) {
  const [urlInput, setUrlInput] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  function handleAdd(e) {
    e.preventDefault()
    onAdd(urlInput)
    setUrlInput('')
  }

  function startRename(w) {
    setEditingId(w.id)
    setEditName(w.name)
  }

  function submitRename(id) {
    onRename(id, editName.trim() || `Webhook ${webhooks.findIndex(w => w.id === id) + 1}`)
    setEditingId(null)
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
        />
        <button className="btn btn-primary btn-add" type="submit" disabled={!urlInput.trim()}>+</button>
      </form>

      <div className="webhook-list">
        {webhooks.length === 0 && (
          <div className="empty-list">Chưa có webhook. Thêm URL ở trên.</div>
        )}
        {webhooks.map((w, i) => (
          <div
            key={w.id}
            className={`webhook-item ${w.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(w.id)}
          >
            <div className="webhook-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
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
                <span className="webhook-name" onDoubleClick={() => startRename(w)}>{w.name}</span>
              )}
              <span className="webhook-url">{w.url.length > 30 ? w.url.slice(0, 30) + '...' : w.url}</span>
            </div>
            <button
              className="btn-icon danger remove-btn"
              onClick={e => { e.stopPropagation(); onRemove(w.id) }}
              title="Xoá webhook"
            >✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
