import { test, expect, vi } from 'vitest'
import React, { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// Reports #52/#53: a suggestion popup/chip must not follow you to another position.
vi.mock('../../src/components/RecipeSuggestions', () => ({
  default: ({ posRef }) => { const [open, setOpen] = useState(false); return <button onClick={() => setOpen(true)}>{open ? `open ${posRef}` : 'closed'}</button> },
}))

test('RecipeSuggestions state resets when the position changes', async () => {
  const { default: PositionRecipeEditor } = await import('../../src/components/PositionRecipeEditor.jsx')
  const { rerender } = render(<PositionRecipeEditor posRef="C01r" />)
  fireEvent.click(screen.getByText('closed'))
  expect(screen.getByText('open C01r')).toBeTruthy()
  rerender(<PositionRecipeEditor posRef="C05r" />)
  expect(screen.getByText('closed')).toBeTruthy()
})
