import React, { useState } from 'react'
import { Modal, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

/**
 * ConceptCard — the four ideas this tool cannot be used without, explained where each
 * one bites, with the user's own data in the example.
 *
 * A tooltip vanishes. These do not: a `?` sits beside the thing it explains, and the
 * card can be reopened forever. The order below is the order they must be learned in —
 * a wrapper makes no sense until a recipe row does.
 *
 * The examples are not invented. `useExample` reads the live project so that ExtRef is
 * taught with the user's own redirects, and "shared" with the user's own wrappers.
 */

export const CONCEPTS = {
  READONLY: 'readonly',
  EXTREF: 'extref',
  WRAPPER: 'wrapper',
  INTENT: 'intent',
}

const CARDS = {
  [CONCEPTS.READONLY]: {
    icon: 'lock',
    title: 'Nothing here is ever saved',
    body: () => (
      <>
        <p>
          The three workbooks are opened <strong>read-only</strong>. Not by convention — the folder
          handle is requested with read permission and there is no code that could write to it.
        </p>
        <p>
          Your edits live in the browser. When you are ready, Export produces <strong>Office Script
          patch scripts</strong> — one for the Product Spec, one for the Recipes, one for the
          DesignDB — and you paste them into Excel yourself.
        </p>
        <p className="mb-0 text-muted">
          So there is no Save button, and no way for this tool to damage a workbook. Stop looking for
          one.
        </p>
      </>
    ),
  },

  [CONCEPTS.EXTREF]: {
    icon: 'alt_route',
    title: 'ExtRef — the Form says C01, the recipe lives on C01r',
    body: ({ redirects }) => (
      <>
        <p>
          <strong>The DesignDB decides what a position is called in the outside world.</strong>{' '}
          A PositionType whose real ref is <code>C01r</code> may declare <code>ExtRef = "C01"</code>,
          meaning: <em>external documents call me C01</em>. The Form template is an external document.
        </p>
        <p className="mb-2">
          There is <strong>no naming rule</strong>. Nothing infers <code>C01r</code> from{' '}
          <code>C01</code> by adding an "r". The <code>ExtRef</code> column is the only truth, which is
          why the import asks you to confirm each redirect.
        </p>
        {redirects.length > 0 ? (
          <div className="px-2 py-2 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', fontSize: 12 }}>
            <div className="text-muted mb-1" style={{ fontSize: 10 }}>In this project:</div>
            {redirects.slice(0, 6).map(r => (
              <div key={r.from} style={{ fontFamily: 'monospace' }}>
                {r.from} <span className="text-muted">→ recipe lives on</span> {r.to}
              </div>
            ))}
            {redirects.length > 6 && <div className="text-muted" style={{ fontSize: 10 }}>…and {redirects.length - 6} more</div>}
          </div>
        ) : (
          <div className="text-muted fst-italic" style={{ fontSize: 12 }}>
            No position in this project declares an ExtRef, so every Form ref means itself.
          </div>
        )}
      </>
    ),
  },

  [CONCEPTS.WRAPPER]: {
    icon: 'inventory_2',
    title: 'A wrapper is an assembly, and assemblies are shared',
    body: ({ sharedWrappers }) => (
      <>
        <p>
          <strong>A wrapper is a virtual element whose real deliverables are its contents.</strong>{' '}
          <code>ET-LIN-01</code> is not something you can buy. It is a linear luminaire assembly — the
          profile, the tape, the diffuser and the end caps inside it are what get purchased.
        </p>
        <p>
          Because it has no product, its Product Spec row reads{' '}
          <code>Ideaworks / N&nbsp;/&nbsp;A</code>, which names nothing on purpose.
        </p>
        <p className="mb-2">
          <strong>And an assembly is shared.</strong> Its contents belong to the assembly, not to the
          position you happen to be looking at. Change them from one position and you change every
          position using it. When you want only this one to differ, <strong>fork</strong> it: the
          position gets its own copy.
        </p>
        {sharedWrappers.length > 0 && (
          <div className="px-2 py-2 rounded" style={{ background: '#fff3cd', border: '1px solid #f0e0a8', fontSize: 12 }}>
            <div className="mb-1" style={{ fontSize: 10, color: '#856404' }}>Shared in this project:</div>
            {sharedWrappers.slice(0, 5).map(w => (
              <div key={w.ref} style={{ fontFamily: 'monospace' }}>
                {w.ref} <span className="text-muted">used by</span> {w.usedBy.join(', ')}
              </div>
            ))}
          </div>
        )}
      </>
    ),
  },

  [CONCEPTS.INTENT]: {
    icon: 'compare_arrows',
    title: 'The Form asks. The recipe has. The gap is your work.',
    body: () => (
      <>
        <p>
          The Form template is <strong>the truth about which products a position uses</strong>, and
          silent about everything else. It carries no quantities and no slots — it never says whether a
          driver sits at position level or inside a wrapper.
        </p>
        <p>Two consequences, and everything follows from them:</p>
        <ul className="mb-2" style={{ fontSize: 12 }}>
          <li>A product the Form names, missing from the recipe, is a <strong>defect</strong>.</li>
          <li>
            A recipe row the Form never named is <strong>derived detail</strong> — a connector, a
            strain relief, a plaster-in kit — and is never flagged red.
          </li>
        </ul>
        <p className="mb-0 text-muted">
          This is why nothing ever shows you one combined number. An intention and a fact are different
          things, and merging them would hide exactly what you came to find out.
        </p>
      </>
    ),
  },
}

/** Live examples, so each concept is taught with the user's own project. */
function useExample() {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const containerETRefs = useStore(s => s.containerETRefs)

  const redirects = positionTypes
    .filter(p => p.ExtRef || p.extRef)
    .map(p => ({ from: p.ExtRef || p.extRef, to: p.PositionTypeRef || p.positionTypeRef }))

  const byWrapper = new Map()
  for (const r of recipes) {
    if ((r.IsDeleted || r.isDeleted) === 'Y') continue
    if ((r.ContextType || r.contextType) !== 'PositionType') continue
    const ref = r.ElementTypeRef || r.elementTypeRef || ''
    if (!containerETRefs.has(ref.toLowerCase())) continue
    if (!byWrapper.has(ref)) byWrapper.set(ref, new Set())
    byWrapper.get(ref).add(r.PositionTypeRef || r.positionTypeRef)
  }
  const sharedWrappers = [...byWrapper.entries()]
    .filter(([, pos]) => pos.size > 1)
    .map(([ref, pos]) => ({ ref, usedBy: [...pos] }))

  return { redirects, sharedWrappers }
}

export default function ConceptCard({ concept, show, onHide }) {
  const example = useExample()
  const card = CARDS[concept]
  if (!card) return null

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name={card.icon} size={18} />
          {card.title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 13, maxHeight: '60vh' }}>{card.body(example)}</Modal.Body>
      <Modal.Footer>
        <Button variant="primary" size="sm" onClick={onHide}>Got it</Button>
      </Modal.Footer>
    </Modal>
  )
}

/**
 * ConceptHint — the `?` that opens a card. Put it beside the thing, not in a help menu.
 * A concept the user meets in passing is a concept they will meet again.
 */
export function ConceptHint({ concept, title, size = 12, style = {} }) {
  const [show, setShow] = useState(false)
  return (
    <>
      <span role="button" tabIndex={0}
        onClick={e => { e.stopPropagation(); setShow(true) }}
        onKeyDown={e => { if (e.key === 'Enter') setShow(true) }}
        title={title || 'What does this mean?'}
        style={{ cursor: 'help', color: '#6c757d', lineHeight: 1, ...style }}>
        <MaterialIcon name="help" size={size} />
      </span>
      {show && <ConceptCard concept={concept} show onHide={() => setShow(false)} />}
    </>
  )
}
