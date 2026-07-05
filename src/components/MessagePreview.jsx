function renderContent(text) {
  if (!text) return null

  const emojiRe = /(<a?:\w+:\d+>)/g
  const mentionRe = /(@everyone|@here|<@!?\d+>|<@&\d+>|<\d+>)/g
  const parts = text.split(new RegExp(`(${mentionRe.source.slice(1,-1)}|${emojiRe.source.slice(1,-1)})`, 'g'))

  return parts.map((part, i) => {
    if (!part) return null
    if (part === '@everyone') return <span key={i} className="discord-mention">@everyone</span>
    if (part === '@here') return <span key={i} className="discord-mention">@here</span>
    if (/^<@!?\d+>$/.test(part)) return <span key={i} className="discord-mention">{part}</span>
    if (/^<@&\d+>$/.test(part)) return <span key={i} className="discord-mention">{part}</span>
    if (/^<#?\d+>$/.test(part)) return <span key={i} className="discord-mention">{part}</span>

    const emojiMatch = part.match(/^<a?:(\w+):(\d+)>$/)
    if (emojiMatch) {
      const isAnimated = part.startsWith('<a')
      return <img key={i} className="discord-emoji" src={`https://cdn.discordapp.com/emojis/${emojiMatch[2]}.${isAnimated ? 'gif' : 'png'}`} alt={`:${emojiMatch[1]}:`} title={emojiMatch[1]} />
    }

    return renderMarkdown(part)
  })
}

function renderMarkdown(text) {
  if (!text) return null
  const patterns = [
    { re: /\*\*\*(.+?)\*\*\*/, wrap: (s, k) => <em key={k}><strong>{s}</strong></em> },
    { re: /\*\*(.+?)\*\*/, wrap: (s, k) => <strong key={k}>{s}</strong> },
    { re: /\*(.+?)\*/, wrap: (s, k) => <em key={k}>{s}</em> },
    { re: /__(.+?)__/, wrap: (s, k) => <u key={k}>{s}</u> },
    { re: /~~(.+?)~~/, wrap: (s, k) => <s key={k}>{s}</s> },
    { re: /\|\|(.+?)\|\|/, wrap: (s, k) => <span key={k} className="discord-spoiler">{s}</span> },
    { re: /`([^`]+)`/, wrap: (s, k) => <code key={k} className="discord-code">{s}</code> },
  ]
  const result = []
  let remaining = text, key = 0
  while (remaining) {
    let bestIdx = -1, bestMatch = null, bestPat = null
    for (const p of patterns) {
      const m = remaining.match(p.re)
      if (m && (bestIdx === -1 || m.index < bestIdx)) { bestIdx = m.index; bestMatch = m; bestPat = p }
    }
    if (!bestMatch) { result.push(<span key={key++}>{remaining}</span>); break }
    if (bestIdx > 0) result.push(<span key={key++}>{remaining.slice(0, bestIdx)}</span>)
    result.push(bestPat.wrap(bestMatch[1], key++))
    remaining = remaining.slice(bestIdx + bestMatch[0].length)
  }
  return result
}

export default function MessagePreview({ msg, webhookName, webhookAvatar }) {
  if (!msg) return null

  const hasEmbeds = msg.embeds?.length > 0 && msg.embeds.some(e => e.title || e.description || e.fields?.length > 0 || e.footerText || e.authorName || e.thumbnail || e.image)
  const hasComponents = msg.components?.length > 0 && msg.components.some(r => r.components?.length > 0)

  const displayUsername = msg.username || webhookName || 'Webhook'
  const displayAvatar = msg.avatar_url || webhookAvatar || ''

  const colors = ['#5865f2','#ed4245','#f47b2a','#f1c40f','#23a55a','#3ba55c','#5865f2','#949ba4','#eb459e','#00b0f4']
  const avatarColor = colors[displayUsername.length % colors.length]

  return (
    <div className="discord-message">
      <div className="discord-avatar" style={displayAvatar ? {} : { background: avatarColor }}>
        {displayAvatar ? <img src={displayAvatar} alt="" /> : displayUsername[0]?.toUpperCase()}
      </div>
      <div className="discord-body">
        <div className="discord-header">
          <span className="discord-username">{displayUsername}</span>
          <span className="discord-bot-tag">BOT</span>
          <span className="discord-timestamp">{new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
        </div>
        {msg.content && <div className="discord-content">{renderContent(msg.content)}</div>}
        {!msg.content && !hasEmbeds && !hasComponents && !msg.filePreview && <div className="discord-content discord-empty">(tin nhắn trống)</div>}

        {msg.filePreview && (
          <div className="discord-file-attach">
            <img src={msg.filePreview} alt="" className="discord-file-img" />
          </div>
        )}

        {hasEmbeds && msg.embeds.map((embed, i) => {
          if (!embed.title && !embed.description && !embed.fields?.some(f => f.name) && !embed.footerText && !embed.authorName && !embed.thumbnail && !embed.image) return null
          const color = embed.color || '#5865f2'
          return (
            <div key={i} className="discord-embed" style={{ borderLeftColor: color }}>
              {embed.authorName && (
                <div className="discord-embed-author">
                  {embed.authorIcon && <img className="discord-embed-author-icon" src={embed.authorIcon} alt="" />}
                  {embed.authorUrl ? <a href={embed.authorUrl} target="_blank" rel="noopener noreferrer">{embed.authorName}</a> : <span>{embed.authorName}</span>}
                </div>
              )}
              <div className="discord-embed-inner">
                {embed.thumbnail && <img className="discord-embed-thumb" src={embed.thumbnail} alt="" />}
                {embed.title && (
                  embed.url
                    ? <a className="discord-embed-title" href={embed.url} target="_blank" rel="noopener noreferrer">{embed.title}</a>
                    : <div className="discord-embed-title">{embed.title}</div>
                )}
                {embed.description && <div className="discord-embed-desc">{embed.description}</div>}
                {embed.fields?.filter(f => f.name).length > 0 && (
                  <div className="discord-embed-fields">
                    {embed.fields.filter(f => f.name).map((f, fi) => (
                      <div key={fi} className={`discord-embed-field ${f.inline ? 'inline' : ''}`}>
                        <div className="discord-embed-field-name">{f.name}</div>
                        <div className="discord-embed-field-value">{f.value}</div>
                      </div>
                    ))}
                  </div>
                )}
                {embed.image && <img className="discord-embed-image" src={embed.image} alt="" />}
              </div>
              {(embed.footerText || embed.timestamp) && (
                <div className="discord-embed-footer">
                  {embed.footerIcon && <img className="discord-embed-footer-icon" src={embed.footerIcon} alt="" />}
                  {embed.footerText && <span>{embed.footerText}</span>}
                  {embed.timestamp && <span className="discord-embed-sep">•</span>}
                  {embed.timestamp && <span>{new Date().toLocaleString()}</span>}
                </div>
              )}
            </div>
          )
        })}

        {hasComponents && msg.components.map((row, ri) => {
          if (!row.components?.length) return null
          return (
            <div key={ri} className="discord-action-row">
              {row.components.map((btn, bi) => (
                btn.style === 5 ? (
                  <a key={bi} href={btn.url || '#'} target="_blank" rel="noopener noreferrer" className={`discord-btn style-${btn.style}`}>
                    {btn.emoji && <span className="discord-btn-emoji">{btn.emoji}</span>}
                    {btn.label || 'Button'}
                  </a>
                ) : (
                  <button key={bi} className={`discord-btn style-${btn.style}`} disabled>
                    {btn.emoji && <span className="discord-btn-emoji">{btn.emoji}</span>}
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
