// What the test bed did (tools/browse.pw.js): the writes the app sent, and the live companion's answers
// that the bed has no saved copy of, for saving as fixtures/<bed>/api/<name>.json. Clears the writes.
async (page) => {
  const bed = page.context().__bed
  if (!bed) return 'no test bed: run tools/browse.pw.js first'
  const out = { bed: bed.name, writes: bed.writes, misses: bed.misses, seen: bed.seen }
  bed.writes = []
  return out
}
