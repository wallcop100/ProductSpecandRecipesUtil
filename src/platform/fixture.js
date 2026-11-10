/**
 * fixture.js — dev build only: `?fixture=<name>` opens the workbooks served at ./fx/<name>/
 * in place of a picked folder, so the app can be driven by a browser that has no folder
 * dialog (automated checks). The copy lives in the browser's private storage; no project
 * folder is touched. On every other build this returns null and the picker is used.
 */
const DEV = typeof __APP_CHANNEL__ !== 'undefined' && __APP_CHANNEL__ === 'dev'
const NAMES = ['DesignDB.xlsx', 'ProductSpec.xlsx', 'Recipes.xlsx']

export async function fixtureDirectory(search = window.location.search, dev = DEV) {
  const name = dev ? new URLSearchParams(search).get('fixture') : null
  if (!name || !/^[\w-]+$/.test(name)) return null
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(`fixture-${name}`, { create: true })
  for (const n of NAMES) {
    const res = await fetch(`./fx/${name}/${n}`)
    // a static host answers a missing file with index.html: that workbook is not in this fixture
    if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) continue
    const w = await (await dir.getFileHandle(n, { create: true })).createWritable()
    await w.write(await res.arrayBuffer())
    await w.close()
  }
  return dir
}
