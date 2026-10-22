// A browser test of any project: `docker exec psr-cli psr fixture <n>` first, then in Playwright MCP
// browser_run_code_unsafe with filename=tools/browse.pw.js, then navigate to
// the app (Connected https://psr.erikrees.co.uk/, or a local vite) and click Open project folder.
// The folder picker is stubbed with an OPFS folder holding fixtures/current/'s workbooks.
async (page) => {
  const dir = '/data/projects/psr_bridge/data/cli/cli-state/fixtures/current/'
  await page.context().route('**/__fixture/**', r => r.fulfill({ path: dir + decodeURIComponent(r.request().url().split('/__fixture/')[1]) }))
  await page.context().addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const index = await (await fetch('/__fixture/index.json')).json()
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(index.project, { recursive: true }).catch(() => {})
      const d = await root.getDirectoryHandle(index.project, { create: true })
      for (const n of index.files) {
        const w = await (await d.getFileHandle(n, { create: true })).createWritable()
        await w.write(await (await fetch('/__fixture/' + encodeURIComponent(n))).arrayBuffer())
        await w.close()
      }
      return d
    }
  })
  await page.setViewportSize({ width: 1500, height: 950 })
  return 'fixture picker installed; navigate to the app'
}
