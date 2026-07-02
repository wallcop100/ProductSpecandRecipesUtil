import React from 'react'

const W = 400, H = 82
const BAR_X = 20, BAR_W = 360, BAR_Y = 18, BAR_H = 36
const CAP_W = 14

/**
 * SVG schematic for a LIN wrapper assembly.
 *
 * Props:
 *   archetype   — archetype object from linArchetypes.js
 *   slotValues  — { [role]: { etRef, dimQtyMultiplier?, quantity? } }
 *   length      — preview length in metres (tape-in-profile / encapsulated)
 *   fixtureCount — fixture count (fixed-length only)
 */
export default function LinWrapperDiagram({ archetype, slotValues = {}, length = 1, fixtureCount = 1 }) {
  if (!archetype) return null

  if (archetype.isFixedLength) {
    const N = Math.max(1, Math.round(fixtureCount) || 1)
    const gap = 3
    const blockW = Math.max(6, Math.floor((BAR_W - gap * (N - 1)) / N))
    const totalW = blockW * N + gap * (N - 1)
    const startX = BAR_X + (BAR_W - totalW) / 2

    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: H }}>
        {Array.from({ length: N }).map((_, i) => (
          <rect key={i}
            x={startX + i * (blockW + gap)} y={BAR_Y}
            width={blockW} height={BAR_H}
            rx={3} fill="#4a7fc1" stroke="#2b5fa8" strokeWidth={1}
          />
        ))}
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="#666">
          {N} × {slotValues.FIXTURE?.etRef || 'fixture'}
        </text>
      </svg>
    )
  }

  const clipRate = slotValues.CLIP?.dimQtyMultiplier ?? 0
  const clipCount = clipRate > 0 ? Math.ceil(clipRate * length) : 0
  const innerX = BAR_X + CAP_W
  const innerW = BAR_W - CAP_W * 2

  const summaryParts = [
    slotValues.PROF && `${length}m profile`,
    slotValues.TAPE && `${length}m tape`,
    slotValues.DIFF && `${length}m diffuser`,
    clipCount > 0 && `${clipCount} clips`,
    slotValues.CAP && '2 caps',
  ].filter(Boolean)

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: H }}>
      {/* Profile / extrusion body */}
      {slotValues.PROF && (
        <rect x={innerX} y={BAR_Y} width={innerW} height={BAR_H} rx={2} fill="#8fa8c0" />
      )}
      {/* LED tape strip */}
      {slotValues.TAPE && (
        <rect x={innerX + 2} y={BAR_Y + (BAR_H - 10) / 2} width={innerW - 4} height={10} rx={1} fill="#f5a623" />
      )}
      {/* Diffuser overlay */}
      {slotValues.DIFF && (
        <rect x={innerX} y={BAR_Y} width={innerW} height={BAR_H} rx={2} fill="#7ec8f5" opacity={0.38} />
      )}
      {/* End caps */}
      {slotValues.CAP && (
        <>
          <rect x={BAR_X} y={BAR_Y} width={CAP_W} height={BAR_H} rx={2} fill="#3a587c" />
          <rect x={BAR_X + BAR_W - CAP_W} y={BAR_Y} width={CAP_W} height={BAR_H} rx={2} fill="#3a587c" />
        </>
      )}
      {/* Clip ticks below bar */}
      {clipCount > 0 && Array.from({ length: clipCount }).map((_, i) => {
        const x = innerX + innerW * (i + 0.5) / clipCount
        return (
          <line key={i} x1={x} y1={BAR_Y + BAR_H + 1} x2={x} y2={BAR_Y + BAR_H + 10}
            stroke="#555" strokeWidth={1.5} />
        )
      })}
      {/* Count summary */}
      {summaryParts.length > 0 && (
        <text x={W / 2} y={H - 2} textAnchor="middle" fontSize={9} fill="#777">
          {summaryParts.join(' · ')}
        </text>
      )}
    </svg>
  )
}
