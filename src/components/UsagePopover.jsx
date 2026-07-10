import React, { useMemo, useRef, useState } from 'react'
import { Overlay, Popover } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { elementTypeUsage } from '../utils/usage'

/**
 * UsagePopover — "where else is this used?"
 *
 * Answered from two sources, kept apart on purpose:
 *
 *   THE FORM SAYS  — an intention. What the imported template asks for.
 *   THE RECIPE HAS — a fact. What is actually built.
 *
 * When they differ, the difference IS the outstanding work, so it is stated first
 * and in plain words. Merging them into one number would hide exactly the thing you
 * opened the popover to learn.
 *
 * Wrap any ElementType ref:  <UsagePopover etRef="ET-LIN-01"><code>ET-LIN-01</code></UsagePopover>
 */

const Label = ({ children }) => (
  <div className="fw-semibold text-muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em' }}>
    {children}
  </div>
)
const Refs = ({ items }) => (
  <span style={{ fontFamily: 'monospace' }}>{items.join(', ')}</span>
)

export default function UsagePopover({ etRef, children, placement = 'right' }) {
  const [show, setShow] = useState(false)
  const [target, setTarget] = useState(null)

  const recipes = useStore(s => s.recipes)
  const psRows = useStore(s => s.psRows)
  const elementTypes = useStore(s => s.elementTypes)
  const formCaptures = useStore(s => s.formCaptures)
  const containerETRefs = useStore(s => s.containerETRefs)

  // Computed only while open — this runs over every recipe row, and a pane can hold
  // dozens of these.
  const computed = useMemo(
    () => (show && etRef ? elementTypeUsage(etRef, { recipes, psRows, elementTypes, formCaptures, containerETRefs }) : null),
    [show, etRef, recipes, psRows, elementTypes, formCaptures, containerETRefs]
  )

  // Overlay fades OUT: it renders the popover one last time after `show` goes false,
  // when `computed` is already null. Keep the last value so that final render has
  // something to read instead of throwing and taking the whole app down with it.
  const last = useRef(null)
  if (computed) last.current = computed
  const usage = computed || last.current

  if (!etRef) return children

  return (
    <>
      <span
        ref={setTarget}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={e => { e.stopPropagation(); setShow(v => !v) }}
        style={{ cursor: 'help', borderBottom: '1px dotted #adb5bd' }}
      >
        {children}
      </span>

      <Overlay target={target} show={show && !!usage} placement={placement}>
        {props => (
          <Popover {...props} style={{ ...props.style, maxWidth: 320 }}>
            <Popover.Header style={{ fontSize: 11, fontFamily: 'monospace' }}>{etRef}</Popover.Header>
            <Popover.Body style={{ fontSize: 11 }}>
              {usage.differs && (
                <div className="mb-2 px-2 py-1 rounded" style={{ background: '#fff3cd', color: '#856404', fontSize: 10 }}>
                  <MaterialIcon name="warning" size={11} />{' '}
                  {usage.onlyInForm.length > 0 && (
                    <>The Form asks for it in <Refs items={usage.onlyInForm} />, where the recipe does not have it.</>
                  )}
                  {usage.onlyInRecipe.length > 0 && (
                    <> The recipe has it in <Refs items={usage.onlyInRecipe} />, where the Form does not ask for it.</>
                  )}
                </div>
              )}

              {formCaptures && (
                <div className="mb-2">
                  <Label>The Form says</Label>
                  {usage.form.positions.length
                    ? <div><Refs items={usage.form.positions} />
                        {usage.form.codes.length > 0 && (
                          <div className="text-muted" style={{ fontSize: 10 }}>as {usage.form.codes.join(', ')}</div>
                        )}
                      </div>
                    : <div className="text-muted fst-italic">nothing — this is derived detail</div>}
                </div>
              )}

              <div className="mb-2">
                <Label>The recipe has</Label>
                {usage.recipe.positions.length
                  ? <div><Refs items={usage.recipe.positions} /></div>
                  : <div className="text-muted fst-italic">not used in any recipe</div>}
                {usage.recipe.containers.length > 0 && (
                  <div className="text-muted" style={{ fontSize: 10 }}>
                    inside <Refs items={usage.recipe.containers} />
                  </div>
                )}
              </div>

              {usage.recipe.isContainer && (
                <div className="mb-2">
                  <Label>It is a wrapper, holding</Label>
                  {usage.recipe.contains.length
                    ? <Refs items={usage.recipe.contains.map(c => c.ref)} />
                    : <span className="text-muted fst-italic">nothing yet</span>}
                  {usage.recipe.positions.length > 1 && (
                    <div style={{ color: '#856404', fontSize: 10 }}>
                      shared — editing its contents changes all {usage.recipe.positions.length} positions
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label>Product spec</Label>
                {usage.spec
                  ? <span>{usage.spec.manufacturer || <em className="text-muted">no manufacturer</em>}
                      {' · '}
                      <span style={{ fontFamily: 'monospace' }}>{usage.spec.productCode || '—'}</span>
                    </span>
                  : <span className="text-muted fst-italic">no spec row</span>}
              </div>
            </Popover.Body>
          </Popover>
        )}
      </Overlay>
    </>
  )
}
