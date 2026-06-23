export default function MessagePreview({ msg, webhookName }) {
  if (!msg) return null

  const hasEmbeds = msg.embeds?.length > 0 && msg.embeds.some(e => e.title || e.description || e.fields?.length > 0 || e.footerText || e.authorName || e.thumbnail || e.image)
  const hasComponents = msg.components?.length > 0 && msg.components.some(r => r.components?.length > 0)

  return (
    <div className="discord-message">
      <div className="discord-avatar">
        {msg.avatar_url ? <img src={msg.avatar_url} alt="" /> : (msg.username?.[0]?.toUpperCase() || 'W')}
      </div>
      <div className="discord-body">
        <div className="discord-header">
          <span className="discord-username">{msg.username || webhookName || 'Webhook'}</span>
          <span className="discord-timestamp">{new Date().toLocaleString()}</span>
        </div>
        {msg.content && <div className="discord-content">{msg.content}</div>}
        {!msg.content && !hasEmbeds && !hasComponents && !msg.filePreview && <div className="discord-content" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>(empty message)</div>}

        {msg.filePreview && (
          <div className="discord-file" style={{ marginTop: 6 }}>
            <img src={msg.filePreview} alt="" className="discord-file-img" />
          </div>
        )}

        {hasEmbeds && msg.embeds.map((embed, i) => {
          if (!embed.title && !embed.description && !embed.fields?.some(f => f.name) && !embed.footerText && !embed.authorName && !embed.thumbnail && !embed.image) return null
          const color = embed.color || '#5865f2'
          return (
            <div key={i} className="embed-preview" style={{ borderLeftColor: color, maxWidth: 440 }}>
              {embed.authorName && (
                <div className="embed-author">
                  {embed.authorIcon && <img className="embed-author-icon" src={embed.authorIcon} alt="" />}
                  <span>{embed.authorName}</span>
                </div>
              )}
              {embed.title && (
                embed.url
                  ? <a className="embed-title" href={embed.url} target="_blank" rel="noopener noreferrer">{embed.title}</a>
                  : <div className="embed-title">{embed.title}</div>
              )}
              {embed.description && <div className="embed-description">{embed.description}</div>}
              {embed.thumbnail && <img className="embed-thumbnail" src={embed.thumbnail} alt="" />}
              {embed.fields?.filter(f => f.name).length > 0 && (
                <div className="embed-fields">
                  {embed.fields.filter(f => f.name).map((f, fi) => (
                    <div key={fi} className={`embed-field ${f.inline ? 'inline' : ''}`}>
                      <div className="embed-field-name">{f.name}</div>
                      <div className="embed-field-value">{f.value}</div>
                    </div>
                  ))}
                </div>
              )}
              {embed.image && <img className="embed-image" src={embed.image} alt="" />}
              {(embed.footerText || embed.timestamp) && (
                <div className="embed-footer">
                  {embed.footerIcon && <img className="embed-footer-icon" src={embed.footerIcon} alt="" />}
                  {embed.footerText && <span>{embed.footerText}</span>}
                  {embed.timestamp && <span>• {new Date().toLocaleString()}</span>}
                </div>
              )}
            </div>
          )
        })}

        {hasComponents && msg.components.map((row, ri) => {
          if (!row.components?.length) return null
          const isLinkRow = row.components.every(b => b.style === 5)
          return (
            <div key={ri} className="action-row">
              {row.components.map((btn, bi) => (
                btn.style === 5 ? (
                  <a key={bi} href={btn.url || '#'} target="_blank" rel="noopener noreferrer" className={`discord-btn style-${btn.style}`}>
                    {btn.emoji && <span>{btn.emoji}</span>}
                    {btn.label || 'Button'}
                  </a>
                ) : (
                  <button key={bi} className={`discord-btn style-${btn.style}`} disabled>
                    {btn.emoji && <span>{btn.emoji}</span>}
                    {btn.label || 'Button'}
                  </button>
                )
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
