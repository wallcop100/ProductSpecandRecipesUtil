import React, { useEffect, useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import InfoTip from './InfoTip'
import { useCompanion } from '../platform/companion'

/** The column names a fact is written against; the catalogue refuses anything else. */
const ATTR_RE = /^[A-Za-z]+\.[A-Za-z][\w()% /-]*$/

/**
 * CatalogueFacts — what a shared product catalogue holds for this (maker, code), and a way
 * to offer it one more fact. Rendered only when the app is served beside a companion with
 * a catalogue (platform/companion.js); on a static host it is nothing.
 *
 * An offered fact is reviewed by a person before the catalogue holds it, and it must say
 * where it came from — a datasheet, a page, a person. Anonymous facts are not facts.
 */
export default function CatalogueFacts({ code, manufacturer }) {
  const api = useCompanion()
  const [product, setProduct] = useState(undefined)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ attribute: '', value: '', source: '' })
  const [sent, setSent] = useState(null)

  useEffect(() => {
    setProduct(undefined); setSent(null)
    if (!api?.lookupProduct || !code || !manufacturer) return
    let live = true
    api.lookupProduct(code, manufacturer).then(p => { if (live) setProduct(p) })
    return () => { live = false }
  }, [api, code, manufacturer])

  if (!api?.lookupProduct || !code || !manufacturer) return null

  const valid = ATTR_RE.test(draft.attribute.trim()) && draft.value.trim() && draft.source.trim()
  async function offer() {
    const ok = await api.contribute?.({
      kind: 'fact', code, manufacturer,
      attribute: draft.attribute.trim(), value: draft.value.trim(), source: draft.source.trim(),
    })
    setSent(ok ? 'Sent for review.' : 'Could not send — try again later.')
    if (ok) setDraft({ attribute: '', value: '', source: '' })
  }

  const facts = product?.facts || []
  return (
    <div className="mb-3" data-testid="catalogue-facts" style={{ fontSize: 11 }}>
      <button className="btn btn-link btn-sm p-0 d-inline-flex align-items-center gap-1"
        style={{ fontSize: 11, textDecoration: 'none', color: '#6c757d' }} onClick={() => setOpen(v => !v)}>
        <MaterialIcon name="travel_explore" size={14} /> Catalogue
        {product === undefined ? '' : product ? ` · ${facts.length} fact${facts.length === 1 ? '' : 's'}` : ' · not seen'}
      </button>
      {open && (
        <div className="mt-1">
          {product?.retired && (
            <div style={{ color: '#842029' }}>Retired{product.replacement && <> — replaced by <code>{product.replacement}</code></>}</div>
          )}
          {facts.map((f, i) => (
            <div key={i} className="text-muted" title={f.source || undefined}>
              <code>{f.attribute}</code> = {f.value} {f.tier && <span>({f.tier})</span>}
            </div>
          ))}
          {product?.refsUsed?.length > 0 && (
            <div className="text-muted">Used elsewhere as {product.refsUsed.map(r => r.ref).join(', ')}</div>
          )}
          <div className="d-flex gap-1 mt-2 align-items-center">
            <Form.Control size="sm" placeholder="ElementTypes.MaxPower(W)" aria-label="Attribute"
              value={draft.attribute} onChange={e => setDraft(d => ({ ...d, attribute: e.target.value }))}
              list="catalogue-attrs" style={{ fontSize: 11, flex: 3 }} />
            <Form.Control size="sm" placeholder="value" aria-label="Value"
              value={draft.value} onChange={e => setDraft(d => ({ ...d, value: e.target.value }))} style={{ fontSize: 11, flex: 1 }} />
            <datalist id="catalogue-attrs">
              {[...new Set(facts.map(f => f.attribute))].map(a => <option key={a} value={a} />)}
            </datalist>
          </div>
          <div className="d-flex gap-1 mt-1 align-items-center">
            <Form.Control size="sm" placeholder="source (datasheet, page, person)" aria-label="Source"
              value={draft.source} onChange={e => setDraft(d => ({ ...d, source: e.target.value }))} style={{ fontSize: 11 }} />
            <Button size="sm" variant="outline-primary" style={{ fontSize: 11, padding: '0 8px' }} disabled={!valid} onClick={offer}>
              Share
            </Button>
            <InfoTip size={11}>
              Offers this value to the shared catalogue. A person reviews it before anyone else sees it.
              The attribute is a DesignDB column, written Table.Column.
            </InfoTip>
          </div>
          {sent && <div className="mt-1 text-muted">{sent}</div>}
        </div>
      )}
    </div>
  )
}
