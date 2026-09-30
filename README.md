# dsh-aionui-layout

把 **AionUi 那套右侧面板**（`预览` + `文件 / 变更`）重新拼回 DSH 0.1.7+，
而面板内容 **100% 是 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)
自己的 tab** —— 所以 better-sidebar 的新特性一个都不丢，只是把「它该长什么样」
固定成你习惯的那个样子。

这是一个 **纯排版插件**：不重绘任何面板，只在会话的右侧栏布局为空时，用
better-sidebar 自己的 `editor`（合并模式下 = 预览 + 右侧停靠文件树）与 `git`
（文件变动）两个 tab 摆出两格。

```
┌──────────┬───────────────┬────────────────────────────┬──────────────────┐
│ 会话列表 │    对话框      │  文件（预览 + 停靠文件树）   │     文件变动      │
│  (DSH)   │    (DSH)      │  better-sidebar editor     │ better-sidebar git│
└──────────┴───────────────┴────────────────────────────┴──────────────────┘
                             pane 1 · 0.62                pane 2 · 0.38
```

---

## 目录

- [效果与交互](#效果与交互)
- [为什么需要它](#为什么需要它)
- [前置条件](#前置条件)
- [安装](#安装)
- [工作原理](#工作原理)
- [行为规则与边界](#行为规则与边界)
- [测试](#测试)
- [调参](#调参)
- [兜底：给已有布局的会话排版](#兜底给已有布局的会话排版)
- [排障](#排障)
- [回滚](#回滚)
- [已知差异与路线图](#已知差异与路线图)
- [目录结构](#目录结构)
- [开发](#开发)
- [License](#license)

---

## 效果与交互

装上并刷新页面后，**每一个右侧栏布局为空的会话**都会自动变成两格：

| 位置 | 内容 | 来源 |
|---|---|---|
| 左格（默认占 62%） | 路径输入框 + 预览/编辑区 + 右侧可拖拽停靠的**文件树** | better-sidebar `editor` tab（合并模式） |
| 右格（默认占 38%） | **文件变动**：Git 视角（stage / unstage / 提交 / 还原 / 历史 / worktree）+ 本轮文件视角，底部带可拖拽 diff 预览 | better-sidebar `git` tab |

交互上最接近 AionUi 的一点：**在文件树里点一个文件，左侧预览原地切换，文件树不消失**
（合并模式的 `updateTab` 原地换路径）；聊天里 / 工具行里的文件链接会落到**预览格**
（插件在排版时把左格设为活动格，DSH 的 `openResource` 默认落活动格）。

两格宽度可拖，分界线由 DSH 的 dock 提供；`文件变动` 那一格也可以用 DSH 的
「分栏」控件再拆/并，或者直接把 tab 拖到另一格合并。

## 为什么需要它

这不是「新版本退化」，而是三件事叠出来的：

1. **老形态是第三方插件自绘的**：`@linxin666/dsh-client-ui-aionui-panel` 在
   `dsh-web-ui` 全家桶里自绘「Explorer（文件/变更）+ Preview」两列。
2. **该插件已被上游废弃**：npm 上 `0.3.6` 起它的 README 明确写着「已停止支持……
   已不可启用——提供方选择已移除，右侧面板固定为 dsh-better-sidebar」，
   最后一个可用版本是 `0.1.17`（2026-08-16，面向旧 DSH 的运行时包集合，
   其 `client.inject` 依赖的 `@deepseek-ai/dsh-client-runtime` 在 DSH 0.1.7 里
   已经不存在了，所以装回新版 DSH 也激活不了）。
3. **DSH 0.1.7 收回了右列**：右列是宿主的 `ui-sidebar-right`（一格一个 tab，
   最多两格），better-sidebar 只往里注册 tab 类型；同时 better-sidebar 自
   v0.14.0 起把「文件打开方式」默认从「合并」改成「独立」，v0.19.0 又退役了
   自绘右栏（PR #604 / #605）。于是右栏再也不会自动出现「预览 + 文件列表」。

本插件把第 3 步的「自动」补回来，内容仍然全部由你正在用的 better-sidebar 提供。

## 前置条件

| 要求 | 说明 |
|---|---|
| DSH | `0.1.7-rc.1` 及以上（右列必须由宿主的 `ui-sidebar-right` 提供） |
| dsh-better-sidebar | `>= 0.19`（注册原生 tab 类型的版本线；实测 0.21.1） |
| 「文件打开方式」 | **必须设为「合并」** —— 见下 |
| tab 类型 | `editor` 与 `git` 保持启用（`tabsEnabled` 里不要写 `false`） |

「合并」是硬依赖：在「独立」模式下，无路径的 `editor` tab 只是一棵纯文件树，
根本没有预览列可以填。profile 里的写法：

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml
- id: better-sidebar
  name: dsh-better-sidebar
  config:
    editorExplorer: true      # ← 合并：路径输入框 + 预览区 + 停靠文件树同一个 tab
    tabsEnabled:
      editor: true
      git: true
```

图形界面等价路径：**设置 → 侧边卡片 → 「文件」卡片 → 文件打开方式 → 合并**。

## 安装

### 从 GitHub 安装（推荐）

```sh
dsh plugin --profile web add github:tenyding/dsh-aionui-layout
```

`lib/client.js` 是手写的模块系统 bundle 并已提交进仓库，**没有构建步骤**，
所以 `github:` 直接可用。

### 从本地目录安装（开发用）

```sh
git clone git@github.com:tenyding/dsh-aionui-layout.git
dsh plugin --profile web add link:$PWD/dsh-aionui-layout
```

两条命令都会做同一件事：把包写进 profile 的 `package.json` 依赖，
并把包名追加到 `dsh.profile.bundles`（因为本包声明了 `dsh.bundle.patch`，
见 [cordis.patch.yml](cordis.patch.yml)）。

### 手工安装（不用 CLI）

1. `package.json` 的 `dependencies` 加 `"dsh-aionui-layout": "link:/abs/path"`；
2. `dsh.profile.bundles` 末尾加 `"dsh-aionui-layout"`；
3. 在 profile 目录跑一次 `pnpm install`；
4. （可选）把 [cordis.patch.yml](cordis.patch.yml) 里的那一行插进 profile 自己的
   patch 文件。

装完 **刷新页面**；profile 有 `patchReload: live` + HMR 时通常刷新即可，
没有就重启 `dsh web`。

## 工作原理

插件只做一件事：**在会话座席挂载后，如果这个会话的右栏布局是空的，就摆两格。**

```
ctx.sidebarRight.mounted  变化
        │
        ├─ 读 localStorage: dsh.sidebar-right.v1.<sessionId>
        │     ├─ 文档不存在 / tabs 为空  → 继续排版
        │     ├─ 已有 tab                → 什么都不做（用户自己的布局）
        │     └─ 文档存在但读不懂         → 什么都不做（不猜）
        │
        ├─ 探测 ctx.get('sidebarRightTabs').get('editor')
        │     └─ 未注册（better-sidebar 没装/被停用/类型被关）→ 直接放弃
        │
        ├─ openTab('editor', { revealIfOpened: true })      ← 预览 + 文件树，落在原格
        ├─ split()                                          ← 向右拆出第二格
        ├─ openTab('git', { paneId: 新格, revealIfOpened })  ← 文件变动
        ├─ close(所有 kind === 'guide' 的 tab)               ← 清掉空格被播种的「开始页」
        └─ focus(editor 页 tab)                             ← 让后续打开的文件落进预览格
```

用到的都是公开面，没有 monkey patch、没有改 DSH 或 better-sidebar 的代码：

| API | 用途 |
|---|---|
| `ctx.sidebarRight.mounted` | `ObservableSnapshot<SessionId>`，座席上屏时触发 |
| `ctx.sidebarRight.openTab(kind, { paneId, revealIfOpened })` | 放 tab；`openTab` 会顺带展开右栏 |
| `ctx.sidebarRight.split()` | 向右拆一格，返回新格 id（放不下时返回 `undefined`） |
| `ctx.sidebarRight.tabsIn(sessionId)` | 读当前会话的 tab 记录（用来清 guide / 找预览 tab） |
| `ctx.sidebarRight.close(tabId)` / `.focus(tabId)` | 清「开始页」、把活动格钉在预览格 |
| `ctx.get('sidebarRightTabs').get(kind)` | 探测 better-sidebar 的 tab 类型是否注册 |
| `localStorage['dsh.sidebar-right.v1.<sessionId>']` | 判断布局是否为空（DSH 自己的持久化文档） |

## 行为规则与边界

| 规则 | 细节 |
|---|---|
| **只碰空布局** | 只有该会话的持久化布局里**一个 tab 都没有**时才排版；已有布局视为用户的，绝不改动 |
| **better-sidebar 不在就什么都不做** | `editor` 类型未注册时直接跳过，profile 保持原样（不会报错、不会留半个布局） |
| **`git` 关掉就只开一格** | 不拆栏，只把「文件」窗口放进去 |
| **拆不了栏也不报错** | 栏宽不足时 `split()` 返回 `undefined`，只保留预览格 |
| **座席迟到会重试** | 切换会话/面板重建期间 `openTab` 会抛错，最多重试 8 次、每次间隔 250ms，然后安静放弃 |
| **不产生重复 tab** | 页类型 tab（`sidebar://editor`、`sidebar://git`）天然去重，重试不会堆 tab |
| **清掉空格的默认页** | 空面板会被 DSH 播种「开始页」，排版后关掉它；当它是全列唯一 tab 时 DSH 保护它，关闭为空操作 |
| **按会话生效** | 布局存在浏览器 localStorage，换浏览器/清站点数据后，空布局会再次被自动排版 |

## 测试

纯 node、零依赖的行为测试，用假的 `ctx.sidebarRight` 驱动真实 bundle：

```sh
node test/seeding.test.mjs
```

覆盖的 8 个情形（全部通过）：

| # | 情形 | 期望 |
|---|---|---|
| 1 | 新会话（无持久化文档） | 先开 `editor` → 拆一格 → 在新格开 `git` → 清 guide → focus 预览格 |
| 2 | 已有布局 | 一个调用都不发 |
| 3 | 文档存在但 tabs 为空 | 正常排版 |
| 4 | 文档存在但无法解析 | 不动（不猜） |
| 5 | `editor` 类型未注册 | 不动 |
| 6 | `git` 类型被关 | 只开 `editor`，不拆栏 |
| 7 | 首次尝试时座席未绑定 | 抛错 → 重试 → 最终排版成功 |
| 8 | `split()` 返回 `undefined` | 只保留预览格 |

另外，宿主侧可以用 profile 的**副本**验证组合是否成立（不碰真 profile）：

```sh
cp -a ~/.dsh/profiles/web /tmp/dsh-verify/profiles/web
DSH_HOME=/tmp/dsh-verify dsh --profile web --dump-config | grep -A2 aionui-layout
# # == dsh-aionui-layout
# - id: aionui-layout
#   name: dsh-aionui-layout
```

## 调参

都在 [lib/client.js](lib/client.js) 顶部，改完刷新页面即可（宿主直接提供 bundle，
**不需要构建**）：

| 常量 | 默认 | 含义 |
|---|---|---|
| `PREVIEW_SIZE` | `0.62` | 左格占比（仅文档用；实际排版直接拖分隔条） |
| `FIRST_DELAY_MS` | `120` | 座席挂载后首次尝试的等待 |
| `MAX_ATTEMPTS` | `8` | 重试次数上限 |
| `RETRY_DELAY_MS` | `250` | 重试间隔 |

想改**默认布局形状**（比如让「变更」在左、「文件」在右）就调整
`seedLayout()` 里的调用顺序与 `split()` 的用法。

## 兜底：给已有布局的会话排版

插件刻意不碰已有布局。若某个老会话你想立刻变成这个形态，把
[snippet/seed-layout.js](snippet/seed-layout.js) 整段粘进 Web GUI 的
DevTools 控制台回车，**然后立刻刷新页面**（否则内存里的 store 会把布局写回去）。
它只写这一条 localStorage 记录：

```js
localStorage['dsh.sidebar-right.v1.<sessionId>'] = JSON.stringify({
  bySession: { '<sessionId>': { layout: {
    nodes: {
      pane1: { kind: 'pane', id: 'pane1', host: 'dock', tabs: ['tab1'], activeTabId: 'tab1' },
      pane2: { kind: 'pane', id: 'pane2', host: 'dock', tabs: ['tab2'], activeTabId: 'tab2' },
      split1: { kind: 'split', id: 'split1', axis: 'row', children: ['pane1','pane2'], sizes: [0.62, 0.38] },
    },
    tabs: {
      tab1: { id: 'tab1', kind: 'editor', contentId: 'sidebar://editor', title: '文件' },
      tab2: { id: 'tab2', kind: 'git',    contentId: 'sidebar://git',    title: '文件变动' },
    },
    rootId: 'split1', floats: [], activePaneId: 'pane1', expanded: true, mode: 'push',
  }, minted: 2 } },
})
```

## 排障

| 现象 | 处理 |
|---|---|
| 右栏没变化 | 先硬刷新（`Cmd/Ctrl+R`）；仍是原样就重启 `dsh web` |
| 设置 → 插件列表里 `aionui-layout` 有加载错误 | 看该行的错误文本（宿主会报模块加载/执行失败）；本插件失败**不会**影响其它插件行 |
| 右栏出现但只有「文件」一格 | 说明 `git` 类型被关（`tabsEnabled.git: false`）或栏宽不足放不下两格——拖宽右栏后可手动「分栏」 |
| 「文件」一格只有文件树、没有预览区 | `editorExplorer` 没生效（还是「独立」）；检查 profile patch 或设置页，然后刷新 |
| 这个会话不排版 | 它已有布局（插件刻意不动）；用上面的 snippet，或清掉 `dsh.sidebar-right.v1.<sessionId>` 后刷新 |
| 换浏览器/清了站点数据 | 空布局会被自动重排，无需操作 |

## 回滚

```sh
dsh plugin --profile web remove dsh-aionui-layout
```

再把 `editorExplorer: true` 从 profile 的 `cordis.patch.yml` 移掉（可选，
回到 better-sidebar 的默认「独立」）。想让某个会话恢复原样就清掉它的
`dsh.sidebar-right.v1.<sessionId>`，或在右栏里自己关掉 tab。

## 已知差异与路线图

- 「变更」是**独立的第二格**，不是 Explorer 列里的一个 tab：DSH 右栏最多两格，
  且 better-sidebar 的停靠面板只提供文件树一种内容。要做成 AionUi 那种
  「文件 / 变更」同列切 tab，只能在 better-sidebar 内部给停靠面板加 tab 条。
- AionUi 自带的 `url` 预览 tab、预览列内分屏编辑属于那个插件自己的实现；
  对应能力在 better-sidebar 的编辑器/渲染器里（源码/预览切换、保存、
  Mermaid、HTML 沙箱预览等）。
- 空布局自动排版是唯一入口；暂无「每个会话记住我偏好哪种布局」的开关
  （布局本身就是每会话记忆的，插件只在空的时候给一个默认值）。

## 目录结构

```
dsh-aionui-layout/
├── package.json          # dsh.bundle.patch + dsh.client 声明（platform: web）
├── cordis.patch.yml      # bundle patch：插一行 aionui-layout
├── lib/
│   ├── index.js          # 宿主半侧（空 apply，只为成为一条 loader row）
│   └── client.js         # 浏览器半侧：手写模块系统 bundle，排版逻辑
├── snippet/
│   └── seed-layout.js    # 兜底：手工给某个会话写布局文档
├── test/
│   └── seeding.test.mjs  # 纯 node 行为测试（8 情形）
├── LICENSE
└── README.md
```

## 开发

- **改客户端逻辑不用构建**：`lib/client.js` 是宿主直接提供的模块系统 bundle
  （`window.__ModuleLoader__.load({ id, factory })` 形式），改完刷新页面即可。
- **不要**给 package.json 加 `prepare` / `build` 脚本：`github:` 安装方式依赖
  「仓库里已有可用产物、无需构建」。
- 提交前跑一次 `node test/seeding.test.mjs`（退出码非 0 即失败）。
- 兼容性基线：DSH `0.1.7-rc.1+`；better-sidebar `>= 0.19`（原生 tab 类型线）。

## License

[MIT](LICENSE) © 2026 tenyding
