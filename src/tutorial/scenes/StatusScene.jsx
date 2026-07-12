import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { Stage, Click, Pulse, Appear, Caption } from './atoms'
import { DEMO_STATUS } from '../demo-data'

/**
 * StatusScene — the "Where the project stands" modal, as it actually is.
 *
 * The first version drew four generic rows and two floating pills. The real thing is a modal
 * with TWO TABS, and the tabs are the whole shape of it:
 *
 *   Am I done?   (ReadinessPanel) a headline box, then four CLAUSES — each an icon, a label
 *                that stays bold until it is done, a DETAIL line naming the actual refs, and a
 *                count pill. A clause you have not finished is clickable and takes you there.
 *   Validation   (ValidationPanel) [Run] and [Step through], a headline counting tasks vs
 *                items, then TASK CARDS. A task is issues grouped by the ACTION that clears
 *                them — "45 ElementTypes missing from the DesignDB master" is ONE card with
 *                one button, not 45 alarms. Red = a pasted patch would be WRONG; amber =
 *                unfinished; grey = already queued into the patch. Expand a card and the
 *                individual refs and their messages are there.
 *
 * The step-through (ValidationFixModal) is its own modal: a progress bar, the rule, "1 of 3",
 * the message, a button that takes you to the fix — and the escape hatch, because some
 * positions genuinely carry no recipe at all.
 *
 * beats: 0 the two tabs, and the four clauses — never a percentage
 *        1 a clause is a door: click it and you are where the work is
 *        2 the Validation tab: tasks, not issues
 *        3 expand a task — the refs are there, and one button clears the class
 *        4 the step-through, and "this needs no recipe" as an honest answer
 */

const CLAUSE_ICON = { done: 'check_circle', open: 'radio_button_unchecked', queued: 'schedule' }
const CLAUSE_COLOUR = { done: '#198754', open: '#495057', queued: '#6c757d' }

/** The real TaskRow palette. */
const TASK_STYLE = t => t.queued
  ? { bg: '#f8f9fa', border: '#e9ecef', fg: '#6c757d', icon: 'schedule' }
  : t.blocking
    ? { bg: '#fff5f5', border: '#f5c2c7', fg: '#dc3545', icon: 'error' }
    : { bg: '#fffbe6', border: '#ffd677', fg: '#997404', icon: 'warning' }

export default function StatusScene({ beat }) {
  const tab = beat >= 2 ? 'validation' : 'done'
  const expanded = beat >= 3
  const { fixer } = DEMO_STATUS

  if (beat === 4) {
    return (
      <>
        <Stage height={268}>
          <Appear when>
            {/* ValidationFixModal — its own modal, on top of the panel */}
            <div className="rounded mx-auto" style={{ background: '#fff', border: '1px solid #dee2e6', maxWidth: 300 }}>
              <div className="px-2 py-1 border-bottom fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 10 }}>
                <MaterialIcon name="rule" size={12} /> Fix validation issues
              </div>
              <div className="px-2 py-2">
                <div style={{ height: 4, background: '#e9ecef', borderRadius: 2, marginBottom: 10 }}>
                  <div style={{ width: '33%', height: '100%', background: '#ffc107', borderRadius: 2 }} />
                </div>
                <div className="d-flex align-items-center gap-1 mb-1">
                  <MaterialIcon name="warning" size={13} style={{ color: '#997404' }} />
                  <span className="fw-semibold" style={{ fontSize: 9, color: '#997404' }}>{fixer.rule}</span>
                  <span className="ms-auto text-muted" style={{ fontSize: 8 }}>
                    {fixer.index} of {fixer.total}
                  </span>
                </div>
                <div style={{ fontSize: 10 }}>{fixer.message}</div>

                <span className="rounded px-1 mt-2 d-inline-block" style={{ background: '#0d6efd', color: '#fff', fontSize: 8 }}>
                  <MaterialIcon name="open_in_new" size={9} /> Go to {fixer.ref}
                </span>

                {/* the escape hatch — not every flag is a defect */}
                <div className="rounded px-2 py-1 mt-2" style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}>
                  <div className="text-muted mb-1" style={{ fontSize: 8 }}>…or it needs no recipe at all:</div>
                  <div className="d-flex gap-1">
                    <Click on>
                      <span className="rounded px-1 d-inline-flex align-items-center gap-1"
                        style={{ border: '1px solid #6c757d', color: '#6c757d', fontSize: 8 }}>
                        <MaterialIcon name="do_not_disturb_on" size={9} /> Ignore {fixer.ref}
                      </span>
                    </Click>
                    <span className="rounded px-1 d-inline-flex align-items-center gap-1"
                      style={{ border: '1px solid #6c757d', color: '#6c757d', fontSize: 8 }}>
                      <MaterialIcon name="do_not_disturb_on" size={9} /> Ignore family {fixer.family}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Appear>
        </Stage>
        <Caption>
          Not every flag is a defect. A position that genuinely carries no recipe can say so —
          on its own, or with its whole family, which asks first. Its issues drop out on the spot.
        </Caption>
      </>
    )
  }

  return (
    <>
      <Stage height={268}>
        {/* the modal title + the two tabs */}
        <div className="d-flex align-items-center gap-1 mb-1 fw-semibold" style={{ fontSize: 10 }}>
          <MaterialIcon name="rule" size={13} /> Where the project stands
        </div>
        <div className="d-flex gap-1 mb-2" style={{ borderBottom: '1px solid #dee2e6' }}>
          {[['done', 'Am I done?'], ['validation', `Validation (${DEMO_STATUS.tasks.length})`]].map(([k, label]) => {
            const on = k === tab
            return (
              <Click key={k} on={beat === 2 && k === 'validation'}>
                <span className="px-2 py-1" style={{
                  fontSize: 8, borderRadius: '4px 4px 0 0', marginBottom: -1,
                  border: on ? '1px solid #dee2e6' : '1px solid transparent',
                  borderBottom: on ? '1px solid #f8f9fa' : 'none',
                  background: on ? '#f8f9fa' : 'transparent',
                  color: on ? '#495057' : '#0d6efd',
                }}>{label}</span>
              </Click>
            )
          })}
        </div>

        {tab === 'done' ? (
          <>
            {/* the headline box */}
            <div className="px-2 py-1 rounded mb-2" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', fontSize: 9 }}>
              <span style={{ color: '#dc3545' }}>1 item blocks a correct patch.</span>{' '}
              <span className="text-muted">Fix those first.</span>
            </div>

            {DEMO_STATUS.clauses.map((c, i) => {
              const hot = beat === 1 && i === 0
              return (
                <Click key={c.label} on={hot} style={{ width: '100%' }}>
                  <Pulse on={hot} style={{ width: '100%' }}>
                    <div className="d-flex align-items-start gap-2 py-1 border-bottom" style={{ width: '100%', fontSize: 9 }}>
                      <MaterialIcon name={CLAUSE_ICON[c.state]} size={12}
                        style={{ color: CLAUSE_COLOUR[c.state], flexShrink: 0, marginTop: 1 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ color: CLAUSE_COLOUR[c.state], fontWeight: c.state === 'done' ? 400 : 600 }}>
                          {c.label}
                        </div>
                        <div className="text-muted text-truncate" style={{ fontSize: 8 }}>{c.detail}</div>
                      </div>
                      {c.count > 0 && (
                        <span className="rounded px-1" style={{ fontSize: 8, background: '#f1f3f5', color: '#495057', flexShrink: 0 }}>
                          {c.count}
                        </span>
                      )}
                    </div>
                  </Pulse>
                </Click>
              )
            })}
          </>
        ) : (
          <>
            {/* Run · Step through, then the headline: tasks vs items */}
            <div className="d-flex align-items-center gap-1 mb-1" style={{ fontSize: 8 }}>
              <span className="rounded px-1" style={{ border: '1px solid #0d6efd', color: '#0d6efd' }}>Run</span>
              <span className="rounded px-1 d-inline-flex align-items-center gap-1"
                style={{ border: '1px solid #6c757d', color: '#6c757d' }}>
                <MaterialIcon name="checklist" size={9} /> Step through
              </span>
            </div>
            <div className="text-muted mb-1" style={{ fontSize: 8 }}>
              2 tasks · 3 items <span style={{ color: '#dc3545' }}>· 1 blocks a correct patch</span>
            </div>

            {DEMO_STATUS.tasks.map((t, i) => {
              const s = TASK_STYLE(t)
              const open = expanded && i === 0
              return (
                <div key={t.title} className="rounded mb-1" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                  <Click on={beat === 3 && i === 0} style={{ width: '100%' }}>
                    <div className="d-flex align-items-center gap-1 px-1 py-1" style={{ width: '100%' }}>
                      <MaterialIcon name={open ? 'expand_more' : 'chevron_right'} size={10} style={{ color: s.fg, flexShrink: 0 }} />
                      <MaterialIcon name={s.icon} size={11} style={{ color: s.fg, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 8.5, fontWeight: 600, color: s.fg }}>
                          {t.count ?? 1} {t.title}
                        </div>
                        <div className="text-muted text-truncate" style={{ fontSize: 7.5 }}>
                          {t.queued
                            ? 'Queued for export. The workbook learns about it when you paste the patch.'
                            : t.hint}
                        </div>
                      </div>
                      {t.action && (
                        <span className="rounded px-1 flex-shrink-0"
                          style={{ border: '1px solid #0d6efd', color: '#0d6efd', fontSize: 7.5 }}>
                          {t.action}
                        </span>
                      )}
                    </div>
                  </Click>

                  {open && (
                    <Appear when>
                      <div className="px-1 pb-1">
                        {t.items.map(it => (
                          <div key={it.ref} className="d-flex align-items-baseline gap-1 py-1 border-top" style={{ fontSize: 7.5 }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{it.ref}</span>
                            <span className="text-muted text-truncate ms-auto" style={{ minWidth: 0 }}>{it.message}</span>
                          </div>
                        ))}
                      </div>
                    </Appear>
                  )}
                </div>
              )
            })}
          </>
        )}
      </Stage>
      <Caption>
        {[
          '“Am I done?” is four clauses, each naming the refs holding it up. Deliberately never a percentage — 87% tells you nothing about what to do next.',
          'A clause is a door: the unfinished ones are clickable, and take you straight to the work.',
          'The Validation tab groups issues by the ACTION that clears them. Red means a pasted patch would be WRONG; amber is merely unfinished; grey is already in the patch.',
          'Expand a task and the refs are right there — and one button clears the whole class of them.',
        ][beat]}
      </Caption>
    </>
  )
}
