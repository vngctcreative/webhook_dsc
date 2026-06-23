export default function History({ history, onClear }) {
  return (
    <div className="history-tab">
      <div className="panel">
        <div className="panel-header">
          <h3>Lịch sử gửi tin nhắn ({history.length})</h3>
          {history.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={onClear}>Xoá tất cả</button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <p>Chưa có lịch sử gửi tin nhắn</p>
          </div>
        ) : (
          <div className="history-list">
            {history.map((entry) => (
              <div key={entry.id} className={`history-item ${entry.status}`}>
                <div className="history-icon">
                  {entry.status === 'success' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2"><path d="M20 6L9 17L4 12"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  )}
                </div>
                <div className="history-body">
                  <div className="history-meta">
                    <span className="history-webhook">{entry.webhookName}</span>
                    <span className="history-time">{new Date(entry.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="history-content">{entry.content || <span className="text-muted">(embed only)</span>}</div>
                  {entry.error && <div className="history-error">Lỗi: {entry.error}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
