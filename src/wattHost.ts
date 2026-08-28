// ============================================================
// WATT App 托管 AI 接入：读取 App 注入的 window.__WATT_HOST__，
// 映射为本地的 LLMConfig。仅在本（watt）分支使用。
// 安全：绝不持久化 apiKey，仅监听一次，卸载时清理监听器。
// ============================================================

import { loadConfig, type LLMConfig } from './pet/companion'

/** 注入协议定义的 Host 结构（来自 watt-managed-ai-host-integration.md） */
export type WattManagedAiHost = {
  ai: { apiKey: string; endpoint: string; model: string; provider: string }
  capabilities: Record<string, never>
  mode: 'managed'
}

declare global {
  interface Window {
    __WATT_HOST__?: WattManagedAiHost
  }
}

/** 读取并校验注入的 Host；非法/缺失返回 null（普通浏览器即此结果） */
export function readWattHostHost(): WattManagedAiHost | null {
  const host = window.__WATT_HOST__
  if (host?.mode === 'managed' && host.ai?.apiKey != null && host.ai?.endpoint != null) return host
  return null
}

/** 把注入配置映射为我们的 LLMConfig（托管模式：强制启用 AI）；null/非法返回 null */
export function wattHostToConfig(host: WattManagedAiHost | null): LLMConfig | null {
  const { ai } = host ?? {}
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

/**
 * 首次同步读取 + 监听 watt:host-ready。
 * 覆盖「启动时已存在」与「加载后再注入」两条路径；事件可能多次派发，
 * 本函数只加一个监听器，调用方需保证 onReady 幂等（仅更新 state 即可）。
 * 返回清理函数：从 window 移除监听器。
 */
export function initWattHost(onReady: (cfg: LLMConfig) => void): () => void {
  const sync = () => {
    const h = readWattHostHost()
    if (h) {
      const c = wattHostToConfig(h)
      if (c) onReady(c)
    }
  }
  sync() // 首次同步（可能为 null，等后续事件补齐）
  const handler = () => sync()
  window.addEventListener('watt:host-ready', handler)
  return () => window.removeEventListener('watt:host-ready', handler)
}

/** 便捷：当前是否处于托管环境 */
export function isManagedHost(): boolean {
  return readWattHostHost() !== null
}

/** 默认配置：有 Host 用托管配置，否则回退用户已保存的（普通浏览器） */
export function loadInitialConfig(): LLMConfig {
  return wattHostToConfig(readWattHostHost()!) ?? loadConfig()
}
