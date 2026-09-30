/**
 * dsh-aionui-layout — client half.
 *
 * What it does
 * ------------
 * The retired `@linxin666/dsh-client-ui-aionui-panel` drew a two-column right
 * panel of its own (AionUi's Explorer `文件 / 变更` + a Preview column). DSH
 * 0.1.7 owns the right column now and `dsh-better-sidebar` fills it with
 * native tab types, so the same shape is assembled from better-sidebar's own
 * tabs instead of re-implementing any panel:
 *
 *   pane 1 (left, wider)  |  pane 2 (right)  ->  [ 文件变动 ]
 *   `editor` page tab     ->  preview + docked file tree (merged mode)
 *
 * Placement rules this plugin follows, all through the public
 * `ctx.sidebarRight` face:
 *
 * - it only ever seeds a session whose persisted layout carries NO tab
 *   (`dsh.sidebar-right.v1.<sessionId>` in localStorage) — an existing layout
 *   is the user's and is never touched;
 * - it opens nothing when better-sidebar's `editor` kind is not registered
 *   (plugin missing/disabled, tab type switched off in the side-card
 *   settings), so a profile without better-sidebar stays untouched;
 * - it splits only when the `git` kind exists, and keeps the preview pane
 *   active so later file opens (chat links, tool rows) land in the preview
 *   column like AionUi's Preview does;
 * - the guide pages the empty panes were seeded with are closed afterwards.
 *
 * Deployment requirement: dsh-better-sidebar mounted with
 * `editorExplorer: true` (侧边卡片 → 文件 → 文件打开方式 → 合并). Without it a
 * path-less `editor` tab is the standalone file tree, and there is no preview
 * column to fill.
 *
 * The bundle is written by hand in the client module system's factory format
 * (`window.__ModuleLoader__.load`), so it needs no build step.
 */
window.__ModuleLoader__.load({
	id: 'dsh-aionui-layout',
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

		/** Where DSH persists one session's right-Sidebar layout (browser storage). */
		const LAYOUT_KEY_PREFIX = 'dsh.sidebar-right.v1.'
		/** better-sidebar's files window: preview + docked tree in merged mode. */
		const PREVIEW_KIND = 'editor'
		/** The page address better-sidebar records its files window under. */
		const PREVIEW_PAGE_ADDRESS = `sidebar://${PREVIEW_KIND}`
		/** better-sidebar's unified changes tab (git status + this turn's files). */
		const CHANGES_KIND = 'git'
		/** The kit's guide page kind, seeded into an empty pane by the settle rule. */
		const GUIDE_KIND = 'guide'
		/** Left pane's share of the column; the changes pane takes the rest. */
		const PREVIEW_SIZE = 0.62
		/** Grace period for the seat to publish its binding before the first attempt. */
		const FIRST_DELAY_MS = 120
		/** Retry budget while the seat/store is still settling. */
		const MAX_ATTEMPTS = 8
		const RETRY_DELAY_MS = 250

		/** Required service: the right column's navigation controller. */
		const inject = ['sidebarRight']

		/**
		 * Read how many tabs one session's persisted layout holds.
		 * @param sessionId - the session whose layout document to read.
		 * @returns the tab count; `undefined` when the document exists but cannot
		 *   be understood (the caller then leaves the layout alone).
		 */
		function persistedTabCount(sessionId) {
			try {
				const raw = window.localStorage.getItem(LAYOUT_KEY_PREFIX + sessionId)
				if (raw === null) return 0
				const parsed = JSON.parse(raw)
				const session = parsed && parsed.bySession ? parsed.bySession[sessionId] : undefined
				const layout = session ? session.layout : undefined
				const tabs = layout ? layout.tabs : undefined
				if (tabs === null || typeof tabs !== 'object') return undefined
				return Object.keys(tabs).length
			} catch (error) {
				console.warn('[dsh-aionui-layout] unreadable sidebar layout, left alone:', error)
				return undefined
			}
		}

		/**
		 * The native tab-kind registry, when it is reachable.
		 * @param ctx - client root context.
		 * @returns the registry, or `undefined` on a host that does not publish it.
		 */
		function kindRegistry(ctx) {
			try {
				const registry = ctx.get('sidebarRightTabs')
				return registry !== undefined && typeof registry.get === 'function' ? registry : undefined
			} catch (error) {
				return undefined
			}
		}

		/**
		 * Whether one better-sidebar tab kind is registered (and therefore enabled).
		 * A registry that cannot be read is treated as "everything is available",
		 * because `openTab` itself refuses an unregistered kind and the attempt
		 * then fails safely.
		 * @param ctx - client root context.
		 * @param kind - the tab kind to probe.
		 * @returns true when the kind may be opened.
		 */
		function kindAvailable(ctx, kind) {
			const registry = kindRegistry(ctx)
			if (registry === undefined) return true
			try {
				return registry.get(kind) !== undefined
			} catch (error) {
				return true
			}
		}

		/**
		 * Close the guide pages left behind by the panes' empty-state seeding.
		 * A guide standing as the only docked tab is protected by the column
		 * itself; `close` then records nothing and this is a no-op.
		 * @param controller - the right column's controller.
		 * @param sessionId - the session being seeded.
		 * @returns nothing.
		 */
		function pruneGuides(controller, sessionId) {
			let records
			try {
				records = typeof controller.tabsIn === 'function' ? controller.tabsIn(sessionId) : undefined
			} catch (error) {
				return
			}
			if (!Array.isArray(records)) return
			for (const tab of records) {
				if (tab === null || typeof tab !== 'object' || tab.kind !== GUIDE_KIND) continue
				try {
					controller.close(tab.id)
				} catch (error) {
					/* A protected guide or an already-closed tab: nothing to do. */
				}
			}
		}

		/**
		 * Keep the files window focused so later opens land in the preview pane.
		 * @param controller - the right column's controller.
		 * @param sessionId - the session being seeded.
		 * @returns nothing.
		 */
		function focusPreview(controller, sessionId) {
			let records
			try {
				records = typeof controller.tabsIn === 'function' ? controller.tabsIn(sessionId) : undefined
			} catch (error) {
				return
			}
			if (!Array.isArray(records)) return
			const page = records.find((tab) => tab !== null && typeof tab === 'object' && tab.kind === PREVIEW_KIND && tab.contentId === PREVIEW_PAGE_ADDRESS)
			const anyPreview = page ?? records.find((tab) => tab !== null && typeof tab === 'object' && tab.kind === PREVIEW_KIND)
			if (anyPreview === undefined) return
			try {
				controller.focus(anyPreview.id)
			} catch (error) {
				/* Focus is cosmetic: the layout is already committed. */
			}
		}

		/**
		 * Place the two-column layout in one session.
		 * @param ctx - client root context.
		 * @param controller - the right column's controller.
		 * @param sessionId - the session whose empty layout is being seeded.
		 * @returns true when the attempt settled (seeded or deliberately skipped),
		 *   false when the seat/store was not ready yet and a retry is warranted.
		 */
		function seedLayout(ctx, controller, sessionId) {
			const tabCount = persistedTabCount(sessionId)
			// An existing layout belongs to the user; an unreadable one is not ours to guess.
			if (tabCount === undefined || tabCount > 0) return true
			if (!kindAvailable(ctx, PREVIEW_KIND)) return true

			controller.openTab(PREVIEW_KIND, { revealIfOpened: true })

			let changesPane
			if (kindAvailable(ctx, CHANGES_KIND)) {
				try {
					changesPane = controller.split()
				} catch (error) {
					console.warn('[dsh-aionui-layout] could not split the column:', error)
				}
				if (typeof changesPane === 'string') {
					try {
						controller.openTab(CHANGES_KIND, { paneId: changesPane, revealIfOpened: true })
					} catch (error) {
						console.warn('[dsh-aionui-layout] could not open the changes tab:', error)
					}
				}
			}

			pruneGuides(controller, sessionId)
			focusPreview(controller, sessionId)
			return true
		}

		/**
		 * Client plugin body.
		 * @param ctx - client root context carrying `sidebarRight`.
		 */
		function apply(ctx) {
			/** Sessions already settled (seeded or deliberately skipped). */
			const settled = new Set()
			/** Retry counters, per session. */
			const attempts = new Map()
			/** Pending timers, per session. */
			const timers = new Map()

			/**
			 * One attempt for one session, with retry bookkeeping.
			 * @param sessionId - the session to seed.
			 * @returns nothing.
			 */
			function attempt(sessionId) {
				if (settled.has(sessionId)) return
				let done = false
				try {
					done = seedLayout(ctx, ctx.sidebarRight, sessionId)
				} catch (error) {
					// The controller throws while no seat is bound (session switched
					// mid-flight, panel replaced): retry instead of giving up.
					console.warn('[dsh-aionui-layout] seeding attempt failed:', error)
					done = false
				}
				if (done) {
					settled.add(sessionId)
					return
				}
				const used = (attempts.get(sessionId) ?? 0) + 1
				attempts.set(sessionId, used)
				if (used < MAX_ATTEMPTS) schedule(sessionId, RETRY_DELAY_MS)
			}

			/**
			 * Queue one attempt for one session, replacing any pending one.
			 * @param sessionId - the session to seed.
			 * @param delay - milliseconds to wait before the attempt.
			 * @returns nothing.
			 */
			function schedule(sessionId, delay) {
				const pending = timers.get(sessionId)
				if (pending !== undefined) window.clearTimeout(pending)
				timers.set(sessionId, window.setTimeout(() => {
					timers.delete(sessionId)
					attempt(sessionId)
				}, delay))
			}

			/** Seed the session whose seat is on screen right now, if any. */
			function sync() {
				const sessionId = ctx.sidebarRight.mounted.getSnapshot()
				if (typeof sessionId !== 'string' || sessionId === '') return
				if (settled.has(sessionId)) return
				schedule(sessionId, FIRST_DELAY_MS)
			}

			const unsubscribe = ctx.sidebarRight.mounted.subscribe(sync)
			sync()

			ctx.effect(() => () => {
				unsubscribe()
				for (const timer of timers.values()) window.clearTimeout(timer)
				timers.clear()
			}, 'dsh-aionui-layout: seeding')
		}

		exports.apply = apply
		exports.inject = inject
		return module.exports
	},
})
