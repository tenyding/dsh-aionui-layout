/**
 * dsh-aionui-layout — seeding behaviour harness (plain node, no deps).
 *
 * Loads the shipped client bundle exactly as the browser module loader does
 * (`window.__ModuleLoader__.load({ id, factory })`), then drives `apply(ctx)`
 * against a fake `ctx.sidebarRight` and asserts the placement sequence.
 *
 * Run: node test/seeding.test.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

/** A localStorage double backed by a Map. */
function storage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    get length() { return map.size },
    key: (index) => [...map.keys()][index] ?? null,
  }
}

/** Load one fresh copy of the bundle and return its exports. */
function loadBundle(localStorage) {
  let captured
  const window = {
    __ModuleLoader__: { load: (mod) => { captured = mod } },
    localStorage,
    setTimeout,
    clearTimeout,
  }
  new Function('window', bundle)(window)
  if (captured === undefined) throw new Error('bundle did not register with __ModuleLoader__')
  if (captured.id !== 'dsh-aionui-layout') throw new Error(`unexpected module id: ${captured.id}`)
  return captured.factory((name) => { throw new Error(`unexpected require("${name}")`) })
}

/** A controller double recording every placement call. */
function controller(opts = {}) {
  const calls = []
  const records = opts.records ? [...opts.records] : [{ id: 'tab1', kind: 'guide', contentId: 'sidebar://guide', title: '开始' }]
  const sessionId = opts.sessionId ?? 'sess-1'
  return {
    calls,
    records,
    mounted: {
      _id: sessionId,
      getSnapshot() { return this._id },
      subscribe() { return () => {} },
    },
    tabsIn: (id) => (id === sessionId ? records : []),
    openTab(kind, options) {
      calls.push(['openTab', kind, options ?? null])
      records.push({ id: `tab${records.length + 1}`, kind, contentId: `sidebar://${kind}`, title: kind })
    },
    split(paneId) {
      calls.push(['split', paneId ?? null])
      // `null` stands for "the room rule refused the split".
      return opts.splitReturns === null ? undefined : (opts.splitReturns ?? 'pane2')
    },
    close(tabId) {
      calls.push(['close', tabId])
    },
    focus(tabId) {
      calls.push(['focus', tabId])
    },
  }
}

/** Run apply() and wait past the plugin's first-attempt delay. */
async function run(localStorage, ctx, waitMs = 300) {
  const exportsObj = loadBundle(localStorage)
  if (!Array.isArray(exportsObj.inject) || !exportsObj.inject.includes('sidebarRight')) {
    throw new Error('inject must declare the sidebarRight service')
  }
  exportsObj.apply(ctx)
  await new Promise((resolve) => setTimeout(resolve, waitMs))
}

const layoutKey = (id) => `dsh.sidebar-right.v1.${id}`
const emptyDoc = (id) => JSON.stringify({ bySession: { [id]: { layout: { nodes: {}, tabs: {}, rootId: 'pane1', floats: [], activePaneId: 'pane1', expanded: false, mode: 'push' }, minted: 1 } } })
const occupiedDoc = (id) => JSON.stringify({ bySession: { [id]: { layout: { tabs: { tab1: { id: 'tab1', kind: 'editor', contentId: 'sidebar://editor', title: '文件' } } }, minted: 1 } } })

let failures = 0
function check(name, condition, extra) {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${extra === undefined ? '' : ` :: ${JSON.stringify(extra)}`}`)
  }
}

// 1. a session with no stored layout gets the two-column placement.
{
  console.log('case: empty session (no stored layout)')
  const sr = controller()
  const ctx = { sidebarRight: sr, effect: () => {}, get: () => undefined }
  await run(storage(), ctx)
  const kinds = sr.calls.filter(([name]) => name === 'openTab').map(([, kind, options]) => [kind, options])
  check('opens the files window first', kinds[0]?.[0] === 'editor' && kinds[0]?.[1]?.revealIfOpened === true, kinds)
  check('splits once', sr.calls.filter(([name]) => name === 'split').length === 1, sr.calls)
  check('opens changes in the new pane', kinds[1]?.[0] === 'git' && kinds[1]?.[1]?.paneId === 'pane2', kinds)
  check('closes the seeded guide', sr.calls.some(([name, id]) => name === 'close' && id === 'tab1'), sr.calls)
  check('focuses the files window last', sr.calls.filter(([name]) => name === 'focus').length === 1, sr.calls)
  check('placed nothing twice', sr.calls.filter(([name]) => name === 'openTab').length === 2, sr.calls)
}

// 2. a session whose stored layout already has tabs is never touched.
{
  console.log('case: existing layout')
  const sr = controller()
  const ctx = { sidebarRight: sr, effect: () => {}, get: () => undefined }
  await run(storage({ [layoutKey('sess-1')]: occupiedDoc('sess-1') }), ctx)
  check('no placement at all', sr.calls.length === 0, sr.calls)
}

// 3. an empty-but-persisted layout is seeded.
{
  console.log('case: persisted empty layout')
  const sr = controller()
  const ctx = { sidebarRight: sr, effect: () => {}, get: () => undefined }
  await run(storage({ [layoutKey('sess-1')]: emptyDoc('sess-1') }), ctx)
  check('seeds', sr.calls.filter(([name]) => name === 'openTab').length === 2, sr.calls)
}

// 4. an unreadable layout document is left alone.
{
  console.log('case: unreadable layout document')
  const sr = controller()
  const ctx = { sidebarRight: sr, effect: () => {}, get: () => undefined }
  await run(storage({ [layoutKey('sess-1')]: '{not json' }), ctx)
  check('no placement at all', sr.calls.length === 0, sr.calls)
}

// 5. better-sidebar not mounted (editor kind unregistered) → untouched.
{
  console.log('case: editor kind unavailable')
  const sr = controller()
  const ctx = {
    sidebarRight: sr,
    effect: () => {},
    get: (name) => (name === 'sidebarRightTabs' ? { get: () => undefined } : undefined),
  }
  await run(storage(), ctx)
  check('no placement at all', sr.calls.length === 0, sr.calls)
}

// 6. changes kind switched off in the side-card settings → single pane.
{
  console.log('case: changes kind unavailable')
  const sr = controller()
  const ctx = {
    sidebarRight: sr,
    effect: () => {},
    get: (name) => (name === 'sidebarRightTabs' ? { get: (kind) => (kind === 'editor' ? {} : undefined) } : undefined),
  }
  await run(storage(), ctx)
  const names = sr.calls.map(([name]) => name)
  check('opens the files window', names.includes('openTab'), sr.calls)
  check('does not split', !names.includes('split'), sr.calls)
}

// 7. the seat is not bound yet on the first attempt → retried, then seeded.
{
  console.log('case: seat binds late (retry)')
  const sr = controller()
  let bound = false
  const original = sr.openTab.bind(sr)
  sr.openTab = (kind, options) => {
    if (!bound) throw new Error('sidebarRight: no seat is mounted')
    return original(kind, options)
  }
  const ctx = { sidebarRight: sr, effect: () => {}, get: () => undefined }
  const pending = run(storage(), ctx, 900)
  setTimeout(() => { bound = true }, 400)
  await pending
  check('seeded after the retry', sr.calls.filter(([name]) => name === 'openTab').length === 2, sr.calls)
}

// 8. split unavailable (column too narrow) → preview pane only.
{
  console.log('case: split unavailable')
  const sr = controller({ splitReturns: null })
  const ctx = { sidebarRight: sr, effect: () => {}, get: () => undefined }
  await run(storage(), ctx)
  const kinds = sr.calls.filter(([name]) => name === 'openTab').map(([, kind]) => kind)
  check('files window only', kinds.length === 1 && kinds[0] === 'editor', sr.calls)
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
