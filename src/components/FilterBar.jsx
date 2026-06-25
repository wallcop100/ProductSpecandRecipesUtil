import React from 'react'

/**
 * FilterBar — reusable filter row: text + optional tag chips + optional family select.
 *
 * Presentational only; each surface owns its filter state and the actual
 * filtering. Pass the dimensions that apply: position surfaces use tags,
 * element surfaces use families.
 *
 * Props:
 *   text, onText, placeholder
 *   tagOptions?    string[]  — when present, renders toggle chips
 *   activeTags?    string[]  — currently active tags
 *   onToggleTag?   (tag) => void
 *   familyOptions? string[]  — when present, renders a select
 *   family?        string    — selected family ('' = all)
 *   onFamily?      (value) => void
 *   compact?       boolean   — tighter spacing for sidebars
 */
export default function FilterBar({
  text, onText, placeholder = 'Filter…',
  tagOptions, activeTags = [], onToggleTag,
  familyOptions, family = '', onFamily,
  compact = false,
}) {
  return (
    <div className={compact ? 'px-2 py-2' : 'px-0'} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="d-flex align-items-center gap-2">
        <div className="position-relative" style={{ flex: 1, minWidth: 0 }}>
          <input
            className="form-control form-control-sm"
            style={{ fontSize: 12, paddingRight: 22 }}
            placeholder={placeholder}
            value={text}
            onChange={e => onText(e.target.value)}
          />
          {text && (
            <button
              type="button"
              className="btn btn-sm p-0 position-absolute"
              style={{ right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 14, lineHeight: 1, color: '#888' }}
              onClick={() => onText('')}
              title="Clear filter"
            >
              ×
            </button>
          )}
        </div>

        {familyOptions && familyOptions.length > 0 && (
          <select
            className="form-select form-select-sm"
            style={{ fontSize: 12, width: compact ? '100%' : 180 }}
            value={family}
            onChange={e => onFamily(e.target.value)}
            title="Filter by family"
          >
            <option value="">All families</option>
            {familyOptions.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        )}
      </div>

      {tagOptions && tagOptions.length > 0 && (
        <div className="d-flex flex-wrap gap-1">
          {tagOptions.map(tag => {
            const active = activeTags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ fontSize: 10, padding: '0px 6px', borderRadius: 10 }}
                onClick={() => onToggleTag(tag)}
              >
                {tag}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
