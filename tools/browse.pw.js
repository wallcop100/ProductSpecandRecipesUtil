// A browser test on a test bed: `psr fixture <n>` once (it keeps fixtures/<n>/), then in Playwright MCP
// browser_run_code_unsafe with filename=tools/browse.pw.js, navigate to the app with ?bed=<n> (Connected
// https://psr.erikrees.co.uk/, or a served dist/) and click Open project folder. The folder picker is
// stubbed with an OPFS folder holding the bed's workbooks.
//
// The companion is the bed's too: a read answered by fixtures/<n>/api/<path>.json if it exists (edit one to
// stage a case), else by the live companion; a write (contribution, outcome, report…) is kept here, never
// sent, so a test can't teach the real one. tools/bed-dump.pw.js returns the writes and the live answers
// worth saving into api/.
async (page) => {
  const dir = '/data/projects/psr_bridge/data/cli/cli-state/fixtures/'
  const live = 'https://psr.erikrees.co.uk'
  const ctx = page.context()
  const bed = ctx.__bed = ctx.__bed || { name: '', seen: {}, writes: [], misses: [] }
  // the reads sent as POST: they carry a list of codes, or prove the DesignDB is held
  const readPost = /^(products\/sweep|products\/jobs|recipes\/kits|projects\/[^/]+\/proof)$/
  await ctx.route('**/__fixture/**', r => {
    const rest = decodeURIComponent(r.request().url().split('/__fixture/')[1])
    bed.name = rest.split('/')[0]
    return r.fulfill({ path: dir + rest })
  })
  await ctx.route('**/api/**', async r => {
    const req = r.request()
    const path = new URL(req.url()).pathname.split('/api/')[1]
    if (req.method() !== 'GET' && !readPost.test(path)) {
      let body = req.postData()
      try { body = JSON.parse(body) } catch { /* kept as text */ }
      bed.writes.push({ at: new Date().toISOString(), method: req.method(), path, body })
      const json = path === 'contributions' ? { id: 'bed', queued: false, status: 'applied' }
        : path === 'reports' ? { id: 0, code: 'BED000', received: true }
        : /outcomes$/.test(path) ? { stored: Array.isArray(body?.outcomes) ? body.outcomes.length : 0 } : { ok: true }
      return r.fulfill({ json })
    }
    const name = path.replace(/\//g, '_')
    // capabilities are asked before the folder is opened: the bed is still in the page's address
    bed.name ||= new URL(req.headers().referer || 'http://x/').searchParams.get('bed') || ''
    if (bed.name && !/proof$/.test(path)) {
      try { return await r.fulfill({ path: `${dir}${bed.name}/api/${name}.json`, contentType: 'application/json' }) } catch { /* not saved: ask the live one */ }
    }
    const res = await r.fetch({ url: live + '/api/' + path + new URL(req.url()).search })
    const text = await res.text()
    if (res.ok()) bed.seen[name] = text
    else bed.misses.push(`${res.status()} ${req.method()} ${path}`)
    return r.fulfill({ status: res.status(), headers: res.headers(), body: text })
  })
  await ctx.addInitScript(() => {
    const q = new URLSearchParams(location.search).get('bed')
    if (q) sessionStorage.setItem('psr-bed', q)
    window.showDirectoryPicker = async () => {
      const b = sessionStorage.getItem('psr-bed') || ''
      if (!b) throw new Error('no test bed: navigate with ?bed=<project>')
      const index = await (await fetch(`/__fixture/${b}/index.json`)).json()
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(index.project, { recursive: true }).catch(() => {})
      const d = await root.getDirectoryHandle(index.project, { create: true })
      for (const n of index.files) {
        const w = await (await d.getFileHandle(n, { create: true })).createWritable()
        await w.write(await (await fetch(`/__fixture/${b}/` + encodeURIComponent(n))).arrayBuffer())
        await w.close()
      }
      return d
    }
  })
  await page.setViewportSize({ width: 1500, height: 950 })
  return 'test bed installed; navigate to the app with ?bed=<project>'
}
