import React from 'react'
import MaterialIcon from './MaterialIcon'

/**
 * StageBar — the 1-2-3 the whole workflow is built around.
 *
 *   ① Identify codes      which runs of text are product codes  (import)
 *   ② Assign ElementTypes what each distinct code IS            (import)
 *   ③ Build recipes       where each product actually goes      (builder)
 *
 * The import owns ① and ②, and stops there. It writes the Form template and the
 * Product Spec, and never a recipe row: "add everything everywhere" lands rows in
 * positions nobody looked at, and checking them means visiting each one anyway.
 * ③ happens by hand in the builder, one tick at a time.
 *
 * Props:
 *   current  1 | 2 | 3
 *   progress { 1: 'n/m rows', 2: 'n/m codes', 3: 'in the builder' } — optional subtext
 *   done     stage numbers already complete
 */

const STAGES = [
  { n: 1, label: 'Identify codes', hint: 'which text is a product code' },
  { n: 2, label: 'Assign ElementTypes', hint: 'what each code is' },
  { n: 3, label: 'Build recipes', hint: 'where each product goes' },
]

export default function StageBar({ current = 1, progress = {}, done = [] }) {
  return (
    <div className="d-flex align-items-stretch gap-0" style={{ fontSize: 11 }}>
      {STAGES.map((s, i) => {
        const isDone = done.includes(s.n)
        const isCurrent = s.n === current
        const bg = isCurrent ? '#e7f1ff' : isDone ? '#d1e7dd' : '#f8f9fa'
        const fg = isCurrent ? '#084298' : isDone ? '#0f5132' : '#adb5bd'
        return (
          <div key={s.n} className="d-flex align-items-center px-2 py-1"
            style={{
              background: bg, color: fg, flex: 1, minWidth: 0,
              borderTop: '1px solid #e9ecef', borderBottom: '1px solid #e9ecef',
              borderLeft: i === 0 ? '1px solid #e9ecef' : 'none',
              borderRight: i === STAGES.length - 1 ? '1px solid #e9ecef' : '1px solid #e9ecef',
              borderTopLeftRadius: i === 0 ? 4 : 0, borderBottomLeftRadius: i === 0 ? 4 : 0,
              borderTopRightRadius: i === STAGES.length - 1 ? 4 : 0,
              borderBottomRightRadius: i === STAGES.length - 1 ? 4 : 0,
            }}
            title={s.hint}
          >
            <span className="d-inline-flex align-items-center justify-content-center me-2"
              style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                background: isCurrent ? '#084298' : isDone ? '#0f5132' : '#dee2e6',
                color: '#fff', fontSize: 10, fontWeight: 700,
              }}>
              {isDone ? <MaterialIcon name="check" size={11} /> : s.n}
            </span>
            <span className="text-truncate">
              <span style={{ fontWeight: isCurrent ? 600 : 400 }}>{s.label}</span>
              {progress[s.n] && (
                <span className="ms-1" style={{ opacity: 0.75, fontSize: 10 }}>· {progress[s.n]}</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
