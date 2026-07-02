/**
 * LIN wrapper archetype definitions.
 * Each archetype lists ordered steps; each step maps to a component role.
 *
 * Step fields:
 *   role            — key used in slotValues / template ingredients
 *   label           — human label shown in wizard
 *   token           — uppercased ET-ref substring used to filter datalist suggestions
 *   dimQtyMultiplier — if set, this value is auto-applied (dim-scaled component)
 *   quantity        — if set, this fixed quantity is auto-applied (e.g. 2 for caps)
 *   isClip          — true → user enters clips/m rate; stored in Dim_QuantityMultiplier + IsInteger='Y'
 *   isFixture       — true → user enters fixture count (fixed-length archetype)
 *   optional        — true → step may be skipped
 */
export const LIN_ARCHETYPES = [
  {
    key: 'tape_in_profile',
    label: 'Tape-in-profile',
    description: 'Cut-to-length LED tape mounted inside an aluminium extrusion.',
    steps: [
      { role: 'PROF', label: 'Profile / extrusion',    token: 'PROF', dimQtyMultiplier: 1 },
      { role: 'TAPE', label: 'LED tape',                token: 'TAPE', dimQtyMultiplier: 1 },
      { role: 'DIFF', label: 'Diffuser',                token: 'DIFF', dimQtyMultiplier: 1, optional: true },
      { role: 'CLIP', label: 'Mounting clips (per m)',  token: 'CLIP', isClip: true },
      { role: 'CAP',  label: 'End caps',                token: 'CAP',  quantity: 2 },
    ],
  },
  {
    key: 'encapsulated',
    label: 'Encapsulated',
    description: 'Cut-to-length tape sealed in a silicone or resin body; clips or profile mount.',
    steps: [
      { role: 'TAPE', label: 'LED tape / strip',        token: 'TAPE', dimQtyMultiplier: 1 },
      { role: 'CLIP', label: 'Mounting clips (per m)',  token: 'CLIP', isClip: true },
    ],
  },
  {
    key: 'fixed_length',
    label: 'Fixed-length',
    description: 'Pre-built luminaire in standard lengths; a fixture count drives the order quantity.',
    isFixedLength: true,
    steps: [
      { role: 'FIXTURE', label: 'Fixture',              token: 'LIN',  isFixture: true },
    ],
  },
]
