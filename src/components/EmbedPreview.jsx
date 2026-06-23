export default function EmbedPreview({ embed }) {
  const hasContent = embed.title || embed.description || embed.fields?.some(f => f.name) || embed.footerText || embed.authorName || embed.thumbnail || embed.image

  if (!hasContent) {
    return <div className="embed-empty">Chưa có nội dung embed. Chuyển qua tab Embed Builder để tạo.</div>
  }

  const color = embed.color || '#5865f2'

  return (
    <div className="embed-preview" style={{ borderLeftColor: color }}>
      <div className="embed-content">
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
            {embed.fields.filter(f => f.name).map((f, i) => (
              <div className={`embed-field ${f.inline ? 'inline' : ''}`} key={i}>
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
            {embed.timestamp && <span className="embed-timestamp">• {new Date().toLocaleString()}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
