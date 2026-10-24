// Every suggestion a test bed's project shows, position by position, for a sanity read. Run on the open
// project (tools/browse.pw.js, ?bed=<n>, Open Project). It works in slices of about a minute: run it
// again until it returns done: true; the result is every position with what it suggested.
async (page) => {
  const ctx = page.context()
  const s = ctx.__sweep = ctx.__sweep || { refs: null, i: 0, out: [] }
  if (!s.refs) {
    // the rail shows once a position is open: open the first in the tree
    if (!(await page.locator('[data-testid="position-rail"]').count())) {
      await page.getByText(/^(empty|\d+ rows?)$/).first().click()
      await page.locator('[data-testid="position-rail"]').waitFor()
    }
    // open every family in the rail, then list its positions
    await page.evaluate(() => document.querySelectorAll('[data-testid="position-rail"] [role="button"].text-uppercase').forEach(h => {
      if (!h.parentElement.querySelector('[data-testid^="rail-"]')) h.click()
    }))
    await page.waitForTimeout(500)
    s.refs = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="rail-"]')]
      .map(e => e.dataset.testid.slice(5)).filter(r => !r.startsWith('diff-')))
  }
  const until = Date.now() + 60_000
  while (s.i < s.refs.length && Date.now() < until) {
    const ref = s.refs[s.i++]
    await page.locator(`[data-testid="rail-${ref}"]`).click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(700)
    const got = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('[data-testid^="suggestion-"]')]
        .map(e => `${e.dataset.testid.slice(11)}${e.dataset.source ? `(${e.dataset.source})` : ''}: ${e.innerText.replace(/\s+/g, ' ').replace(/ more_horiz| close/g, '').trim()}`)
      const cards = [...document.querySelectorAll('.companion-card, .companion-dot')]
        .filter(e => !e.closest('[data-testid="recipe-suggestions"]'))
        .map(e => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 300)).filter(Boolean)
      return { lines, cards: [...new Set(cards)] }
    })
    s.out.push({ ref, ...got })
  }
  return { done: s.i >= s.refs.length, at: s.i, of: s.refs.length, ...(s.i >= s.refs.length ? { positions: s.out } : {}) }
}
