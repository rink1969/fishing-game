# AGENTS.md — 钓鱼大师代码架构指南

给后续维护本项目的 Agent 看的架构地图。改动前请先读对应文件确认现状，本文可能与代码存在轻微漂移。

## 项目定位

纯前端第一人称钓鱼小游戏，无服务端、无游戏框架。React 19 + TypeScript + Vite + Tailwind CSS + Canvas 2D。游戏画面全部画在一个 `<canvas>` 上，UI 覆盖层是普通 React 组件。

## 目录结构

```
fishing-game/
├── index.html                  # Vite 入口
├── package.json                # 依赖极简：运行时只有 react + react-dom
├── tailwind.config.js          # 最小配置（content 路径而已）
├── public/assets/
│   ├── spots/                  # 11 张钓点背景图，文件名带 spot_ 前缀（spot_<locationId>.jpg）
│   ├── fish/                   # 鱼图 PNG，文件名 = 鱼 id（<fishId>.png），无图的鱼引擎画剪影
│   └── pet/                    # 宠物 8 姿态 PNG：wave/skip/celebrate/sleep/shy/tea/read/sweep
├── scripts/
│   ├── gen-content.py          # 内容生成器（见下文「数据流」）
│   ├── make-static.mjs         # build:static 后处理：把 CSS 从 JS 抽出为 dist/assets/app.css，
│   │                           # 并把 index.html 改成经典 <script> 引用（IIFE，双击可跑）
│   └── deploy-pages.mjs        # 手动部署 gh-pages 分支用（日常走 GitHub Actions）
├── .github/workflows/deploy.yml# push main → 构建 → GitHub Pages
└── src/
    ├── main.tsx                # React 挂载
    ├── App.tsx                 # 总装：引擎挂载、UI 面板、存档、宠物事件接线、回家结算弹窗
    ├── index.css               # 只有三行 @tailwind 指令
    ├── tang.css                # 寻霖塘国风皮肤（.tang-* 类，面板/按钮/卡片样式）
    ├── game/
    │   ├── engine.ts           # ★ 核心：Canvas 状态机引擎 + 渲染（约 1000 行）
    │   ├── content.ts          # ★ 自动生成的游戏数据，勿手改（见下文）
    │   ├── economy.ts          # 元游戏经济：灵玉、鱼饵库存、钓点解锁、渔篓买卖
    │   └── bgm.ts              # 背景音乐：单曲循环，自动播放策略兜底（首次手势后开播）
    ├── pet/
    │   ├── companion.ts        # 宠物大脑：台词库 + 大模型接入（OpenAI 兼容 /chat/completions）
    │   ├── voice.ts            # 浏览器 speechSynthesis 语音朗读
    │   └── pet.css             # 宠物气泡与动画样式
    └── components/
        ├── Pet.tsx             # 宠物组件（右下角）：姿态图片轮播、气泡、戳一戳互动
        ├── EconomyBar.tsx      # 右侧菜单（设置/钓点/商店/渔篓/回家）+ 顶部状态条 + 鱼饵库存条
        └── SettingsPanel.tsx   # 设置弹窗：AI 接口配置、测试连接、语音开关
```

## 核心架构

### 游戏引擎（src/game/engine.ts）

- `GameState` 状态机：`idle → charging → casting → waiting → bite → reeling → leaping → result`。
- `FishingEngine` 类持有全部运行时状态，`requestAnimationFrame` 驱动；React 只通过 `EngineEvent` 回调收事件（咬钩、钓获、逃脱、断线等），不直接碰引擎内部。
- 渲染分层：钓点背景图（`imgReady()` 校验 404 兜底）→ 水波/鱼影 → 浮漂/鱼线 → 张力条等 HUD。背景图不可用时回退到 content.ts 里每个钓点的 `skyTop/skyMid/water` 渐变色。
- `assetUrl()` 负责资源路径（兼容 dev / file:// / GitHub Pages 子路径三种部署形态），改资源加载逻辑先看它。

### 游戏数据（src/game/content.ts）— 自动生成，勿手改

数据源自兄弟项目 `rainholm-fish/server/engine.py`，由 `scripts/gen-content.py` 生成：

- `LOCATIONS`（11 个钓点：解锁价、杂物率、鱼群标签权重、背景图、兜底渐变色）
- `BAITS`（鱼饵：价格、稀有度/标签/杂物率修正）
- `FISH`（56 种表层鱼：稀有度、重量区间、价值、分布钓点、标签、图片）
- `FIGHT_BY_RARITY`（各稀有度遛鱼强度系数）、`JUNK_ITEMS`

要调整鱼/钓点/鱼饵数值，**改 `gen-content.py` 或其上游数据源后重新运行 `python scripts/gen-content.py`**（脚本还会同步拷贝鱼图和背景图到 public/assets）。直接改 content.ts 的改动会在下次生成时丢失。

### 经济系统（src/game/economy.ts）

纯函数风格：所有操作接收 `EconomyState` 返回新状态（`buyBait` / `gotoLocation` / `consumeBait` / `addCatch` / `sellAll`）。App.tsx 持有状态并在每次变更后 `saveEconomy()`。

### 宠物（src/pet/ + src/components/Pet.tsx）

- 事件驱动：App.tsx 把引擎事件映射为 `Trigger`（`idle/cast/nibble/bite/hooked/missed/escaped/snapped/caught/home`），调用 `companionSay()`。
- **双轨台词**：`CANNED_ONLY` 集合里的快速事件（咬钩、遛鱼中等）永远用本地台词库 `cannedLine()`，零延迟；慢节奏事件（等待闲聊、钓获庆祝、回家总结）在配置了 AI 时走大模型，失败自动回退本地台词。加新事件时先想清楚它属于哪一轨。
- 大模型提示词原则：简短（防打断）、有梗、不要报时间、不要老提空军。改提示词在 companion.ts 的 `companionSay()` 内。
- `voice.ts` 用 `speechSynthesis` 朗读，「鱼蛋」人设高音调；`stopSpeaking()` 在新台词到来时打断旧的。

## localStorage 存档键

| 键 | 内容 | 回家重开时 |
|---|---|---|
| `fishing-economy` | 灵玉/鱼饵/渔篓/当前钓点 | 重置，但**保留已解锁钓点** |
| `fishing-save` | 图鉴、纪录等元进度 | 清除 |
| `fishing-llm-config` | AI 接口配置 + 氛围组开关 | **保留**（用户明确要求） |
| `fishing-voice-on` | 语音朗读开关（默认关） | 清除，回到默认值 |
| `fishing-bgm-on` | 背景音乐开关（默认开） | 清除，回到默认值 |

「重新开始」的实现是 `localStorage.clear()` 后只回写 AI 配置和已解锁钓点（见 App.tsx `restartGame`）；改保留清单需经过用户确认。

## 构建与验证

```bash
npm run dev           # 开发
npm run build:static  # tsc -b && vite build && node scripts/make-static.mjs
npm run lint          # eslint，提交前必须全绿
```

- tsc 是严格模式；构建产物 `dist/` = index.html + assets/app.js + assets/app.css + assets 资源，双击即玩。
- 浏览器预览验证：用 kimi-webbridge（127.0.0.1:10086）+ dist 目录下临时 `python -m http.server <新端口>`。**注意 app.js 文件名固定，浏览器缓存很顽固，每次验证换新端口**；验证完必须 kill 服务器并 close_session。
- Git 提交惯例：`git -c core.safecrlf=false commit`（避免 Windows 换行告警噪音）。

## 编码约定

- 全中文注释与 UI 文案；commit message 用 emoji 前缀 + 中文。
- UI 样式优先用 tang.css 里的 `.tang-*` 类保持国风一致性，零散布局用 Tailwind。
- 不要重新引入组件库脚手架（shadcn 等已于 2026-08 大扫除移除）。
