/**
 * dsh-aionui-layout — manual seeding snippet (fallback / repair tool).
 *
 * WHY: the plugin only seeds a session whose persisted right-Sidebar layout
 * carries no tab. A conversation that already has a layout (because you opened
 * something in it before installing the plugin) is deliberately left alone —
 * paste this into the Web GUI's DevTools console to give that conversation the
 * AionUi-style two-column panel anyway.
 *
 * HOW:
 *   1. open the conversation you want to reshape;
 *   2. paste this whole file into the console and press Enter;
 *   3. RELOAD the page immediately (the live store would otherwise write its
 *      own layout back over this one on its next commit).
 *
 * The document written below is the exact shape DSH validates on read:
 * one row split, two docked panes — left = the files window (preview + docked
 * file tree in 合并 mode), right = 文件变动.
 *
 * Everything is contained in this IIFE; nothing else on the page is touched.
 */
;(() => {
  const LAYOUT_KEY_PREFIX = 'dsh.sidebar-right.v1.'
  const sizes = [0.62, 0.38]

  /** The session to reshape: an explicit argument, else the GUI's current one. */
  const sessionId = (() => {
    if (typeof globalThis.__aionuiSessionId === 'string') return globalThis.__aionuiSessionId
    try {
      const current = JSON.parse(localStorage.getItem('dsh.sessions.current') ?? 'null')
      return current && typeof current.sessionId === 'string' ? current.sessionId : undefined
    } catch {
      return undefined
    }
  })()

  if (sessionId === undefined) {
    console.error('[aionui-layout] no session id: open a conversation first, or set globalThis.__aionuiSessionId = "session-…"')
    return
  }

  const doc = {
    bySession: {
      [sessionId]: {
        layout: {
          nodes: {
            pane1: { kind: 'pane', id: 'pane1', host: 'dock', tabs: ['tab1'], activeTabId: 'tab1' },
            pane2: { kind: 'pane', id: 'pane2', host: 'dock', tabs: ['tab2'], activeTabId: 'tab2' },
            split1: { kind: 'split', id: 'split1', axis: 'row', children: ['pane1', 'pane2'], sizes },
          },
          tabs: {
            tab1: { id: 'tab1', kind: 'editor', contentId: 'sidebar://editor', title: '文件' },
            tab2: { id: 'tab2', kind: 'git', contentId: 'sidebar://git', title: '文件变动' },
          },
          rootId: 'split1',
          floats: [],
          activePaneId: 'pane1',
          expanded: true,
          mode: 'push',
        },
        minted: 2,
      },
    },
  }

  localStorage.setItem(LAYOUT_KEY_PREFIX + sessionId, JSON.stringify(doc))
  console.log(`[aionui-layout] layout written for ${sessionId} — reload the page now (Cmd/Ctrl+R).`)
})()
