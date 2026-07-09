/** Insert Discord markdown around selected text in a textarea/input */
export default function MarkdownToolbar({ targetRef, value, onChange }) {
  function wrap(before, after = before, placeholder = 'text') {
    const el = targetRef?.current
    if (!el) {
      onChange(value + before + placeholder + after)
      return
    }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const selected = value.slice(start, end) || placeholder
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + before.length + selected.length + after.length
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
      void pos
    })
  }

  const tools = [
    { label: 'B', title: 'Bold', action: () => wrap('**') },
    { label: 'I', title: 'Italic', action: () => wrap('*') },
    { label: 'U', title: 'Underline', action: () => wrap('__') },
    { label: 'S', title: 'Strikethrough', action: () => wrap('~~') },
    { label: '</>', title: 'Inline code', action: () => wrap('`') },
    { label: '```', title: 'Code block', action: () => wrap('```\n', '\n```', 'code') },
    { label: '||', title: 'Spoiler', action: () => wrap('||') },
    { label: '>', title: 'Quote', action: () => {
      const el = targetRef?.current
      const start = el?.selectionStart ?? 0
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      onChange(value.slice(0, lineStart) + '> ' + value.slice(lineStart))
    }},
  ]

  return (
    <div className="md-toolbar">
      {tools.map((t) => (
        <button key={t.title} type="button" className="md-btn" title={t.title} onClick={t.action}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
