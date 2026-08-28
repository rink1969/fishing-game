# WATT 托管 AI 环境集成 —— 改造计划

- 分支：`watt`（专用，与主分支隔离；正常浏览器环境不兼容，走另一分支）
- 依据：`watt-managed-ai-host-integration.md`
- 制定日期：2026-08-28
- 状态：先评审，确认后再改代码


## 1. 目标

当游戏运行在 WATT App 的嵌入式 WebView（`window.__WATT_HOST__` 已注入）中时：

- 自动从注入信息里拿到 AI 接口配置（`apiKey` / `endpoint` / `model` / `provider`），**无需用户手动配置**。
- 直接启用 AI 氛围组（宠物「鱼蛋」的大模型台词）。
- 严格遵守注入协议的安全要求：**不持久化、不打印、不转发** `apiKey`。

在普通浏览器（无 `__WATT_HOST__`）中，游戏仍可正常运行（本地台词兜底，AI 默认关闭），并给出明确提示。


## 2. 接入协议要点（来自集成文档）

| 项 | 内容 |
| --- | --- |
| 注入对象 | `window.__WATT_HOST__`，形如 `{ ai:{apiKey,endpoint,model,provider}, capabilities:{}, mode:"managed" }` |
| 读取时机 | App 会在业务脚本执行前注入一次，加载完成后**再次注入**；每次派发 `watt:host-ready` 事件 |
| 两条路径 | ① 脚本启动时已存在则直接读；② 监听 `watt:host-ready` 补齐。事件**可能多次**，初始化逻辑必须可重复执行 |
| 字段映射 | `ai.apiKey` -> 我们的 apiKey；`ai.endpoint` -> 我们的 baseUrl；`ai.model` -> model；`ai.provider` -> provider |
| 安全 | 不写 localStorage/sessionStorage/IndexedDB/Cookie；不打印到 console/埋点/界面；不进 URL/hash/跨窗口消息；卸载时清理持有配置的定时器/监听器 |
| 当前无 | `capabilities` 为空；无 `version` 字段；不写 localStorage |


## 3. 现状分析（已有代码）

AI 配置高度集中，改造面小：

- `src/pet/companion.ts`：
  - `LLMConfig` 接口：`{enabled, baseUrl, apiKey, model, noThink}`
  - `loadConfig()/saveConfig()` 读写 `localStorage.fishing-llm-config`（`CONFIG_KEY`）
  - `callLLM()`：`${baseUrl}/chat/completions`，用 `apiKey`/`model` 发请求（**无需改动**）
  - `companionSay()`：快速事件走本地台词，慢事件走 AI，失败自动兜底
- `src/App.tsx`：用 `loadConfig()` 作初始状态，持 `[config, setConfig]`，传给 `SettingsPanel` 和 `petSpeak/handleHome`
- `src/components/SettingsPanel.tsx`：AI 配置的可编辑 UI + 测试连接 + 保存

**映射天然兼容**：Watt 的 `endpoint` 即「AI 服务基础地址」，我们恰好是拼 `/chat/completions`，无需改请求路径。


## 4. 设计方案

### 4.1 新建 `src/wattHost.ts`（站点级托管接入，与宠物大脑解耦）

```ts
export type WattManagedAiHost = {
  ai: { apiKey: string; endpoint: string; model: string; provider: string }
  capabilities: Record<string, never>
  mode: "managed"
}
declare global { interface Window { __WATT_HOST__?: WattManagedAiHost } }

import { loadConfig, type LLMConfig } from "./pet/companion"

function readWattHostHost(): WattManagedAiHost | null {
  const host = window.__WATT_HOST__
  if (host?.mode === "managed" && host.ai?.apiKey != null && host.ai?.endpoint != null) return host
  return null
}

/** 把注入配置映射为我们的 LLMConfig（托管模式：强制启用） */
export function wattHostToConfig(host: WattManagedAiHost): LLMConfig | null {
  const { ai } = host
  if (!ai?.apiKey && !ai?.endpoint) return null
  return {
    enabled: true,
    baseUrl: ai.endpoint,
    apiKey: ai.apiKey,
    model: ai.model,
    // 与原 LLMConfig 字段完全一致，无需改 companion.ts
    noThink: false,
  }
}

/** 首次读取 + 监听 watt:host-ready；返回清理函数。单次监听、可重复执行。 */
export function initWattHost(onReady: (cfg: LLMConfig) => void): () => void {
  const sync = () => {
    const h = readWattHostHost()
    if (h) {
      const c = wattHostToConfig(h)
      if (c) onReady(c)
    }
  }
  sync()
  const handler = () => sync()
  window.addEventListener("watt:host-ready", handler)
  return () => window.removeEventListener("watt:host-ready", handler)
}
```

要点：
- 监听器**只加一次**（挂载时调用一次），重复事件不会堆积监听器。
- 不创建任何持久客户端，`fetch` 在 `companionSay` 里按需发起 -> 重复事件天然幂等。
- 绝不写 localStorage。


### 4.2 `src/pet/companion.ts` —— 不动

既然设置页不再提供 AI 配置入口，`LLMConfig` 接口**无需**加 `managed` / `provider` 字段。`callLLM`（请求路径）、`companionSay`（快速事件本地台词、慢事件 AI、失败自动兜底）逻辑全部保持原样。托管配置只是以 `LLMConfig` 形态进入 `companionSay`，接口契约不变。


### 4.3 改 `src/App.tsx`

1. 初始状态优先取托管配置：
```ts
import { initWattHost, wattHostToConfig, readWattHostHost } from "./wattHost"
const [config, setConfig] = useState<LLMConfig>(
  () => wattHostToConfig(readWattHostHost()) ?? loadConfig()
)
```
2. 挂载时初始化 Host（首次读取 + 监听），卸载清理：
```ts
useEffect(() => initWattHost((cfg) => setConfig(cfg)), [])
```
覆盖「启动时已存在」与「加载后再注入」两条路径；事件多次触发时只是反复 `setConfig`，无副作用。
3. 设置页不再保存 AI 配置，`handleSaveConfig` 函数及其 `saveConfig` 调用**移除**（`saveConfig` 的 import 若变为无用也一并删除）。托管配置只在 React state 内流转，从源头不落地 localStorage。4. `restartGame` 原样保留即可：托管模式下 `fishing-llm-config` 本无写入，读出来也是空，不影响。


### 4.4 改 `src/components/SettingsPanel.tsx` —— 删除整个 AI / 大模型配置区块

- 删除「🤖 AI 氛围组（连接大模型）」整个 `section`（含 Base URL / API Key / 模型 / 关闭思考模式 / 测试连接 / 保存配置 / 测试结果提示）。
- 删除不再需要的 prop：`config`、`onSave`；删除 `import { testConnection }`；删除 `draft` / `testing` / `testMsg` 状态与 `runTest` 函数。
- 设置页保留：音效、背景音乐、语音朗读、鱼类图鉴、清空渔获存档。
- 理由：本分支仅面向嵌入式浏览器，AI 配置恒由注入提供，用户无需（也不应）手动配置。


### 4.5 普通浏览器降级（`watt` 分支也保留，满足协议 §5/验收）

无 Host 时走 `loadConfig()`（默认 `enabled:false`），游戏可正常游玩（本地台词），AI 仍可手动配置。顶部给一个**轻微、可关闭**的提示条：「本页面需在 WATT App 中打开以启用托管 AI；当前为普通浏览器，可继续游戏。」。不做无限等待。

> 可选增强（不阻塞主流程）：加一个开发用查询参数 `?__watt_dev=1`，在 dev 环境下往 `window` 注入一段伪造的 `__WATT_HOST__` 用于本地冒烟验证托管路径。真实托管环境由测试人员用 App 验证，此开关可随时删除。


## 5. 安全合规对照（协议 §6）

| 要求 | 实现 |
| --- | --- |
| 不持久化 apiKey | 设置页已删除 AI 配置入口，`saveConfig` 全程不可达；托管配置只活在 React state，从源头不落地 localStorage |
| 不打印 apiKey | 全程无 `console.log(apiKey)`；设置页已无 AI 区块，界面无处可显示密钥 |
| 不转发到非 WATT endpoint | 仅把 `endpoint` 作为 `baseUrl` 传给 `callLLM`，不转发他处 |
| 不放进 URL/hash/跨窗口 | 不经由 `location`/`postMessage` |
| 卸载清理 | `initWattHost` 返回 `removeEventListener`，`useEffect` cleanup 调用 |


## 6. 验收清单（对应协议 §8）

- [ ] WATT App 中打开页面可读取完整 `window.__WATT_HOST__.ai`。
- [ ] 首次读取 + `watt:host-ready` 两条路径都能完成初始化。
- [ ] 重复收到 `watt:host-ready` 不重复创建监听器/任务/请求。
- [ ] 普通浏览器无 Host 时显示明确提示，且游戏可正常运行。
- [ ] AI 请求使用注入的 `endpoint`/`apiKey`/`model`。
- [ ] `fishing-llm-config` 不会被写入托管配置。
- [ ] 刷新页面可重新完成 Host 初始化。


## 7. 验证步骤（改完代码后）

1. `npm run lint` — 必须全绿（基线已绿）。
2. `npm run build:static` — tsc 严格模式通过，产出 `dist/`。
3. `npm run dev` 在普通浏览器打开 — 确认无 Host 时游戏正常运行、AI 默认关闭、设置面板可用（回归检查）。
4. 本地冒烟（若加 `?__watt_dev=1`）— 验证托管路径能读到注入配置并启用 AI。
5. 交测试人员在 WATT App 真实环境验证 §8 全部项。


## 8. 改动文件清单

- 新增：`src/wattHost.ts`（托管接入：读取 __WATT_HOST__、映射 LLMConfig、监听 watt:host-ready）
- 修改：`src/App.tsx`（初始状态优先取托管配置；挂载时 initWattHost；移除 AI 配置保存入口 handleSaveConfig/saveConfig）
- 修改：`src/components/SettingsPanel.tsx`（删除整个 AI / 大模型配置区块及其 prop、状态、runTest）
- 不改：`src/pet/companion.ts`（请求与兜底逻辑保持原样）
- （可选）`src/wattHost.ts`：`?__watt_dev=1` 开发注入

不依赖新库；零运行时依赖增加。