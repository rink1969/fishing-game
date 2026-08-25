// 设置面板：大模型配置 / 音效 / 图鉴 / 存档（寻霖塘国风皮肤）
import { useState } from 'react'
import { testConnection, type LLMConfig } from '../pet/companion'
import { rarityLabel, formatWeight } from '../game/engine'
import { FISH } from '../game/content'

interface Props {
  open: boolean
  config: LLMConfig
  muted: boolean
  voiceOn: boolean
  codex: Record<string, number>
  onClose: () => void
  onSave: (c: LLMConfig) => void
  onMute: (m: boolean) => void
  onVoiceChange: (v: boolean) => void
  onResetSave: () => void
}

const RARITY_STAR: Record<number, string> = { 1: '★', 2: '★★', 3: '★★★', 4: '★★★★', 5: '★★★★★', 6: '★★★★★★' }

export default function SettingsPanel({
  open, config, muted, voiceOn, codex, onClose, onSave, onMute, onVoiceChange, onResetSave,
}: Props) {
  const [draft, setDraft] = useState<LLMConfig>(config)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null)

  if (!open) return null

  const runTest = async () => {
    setTesting(true)
    setTestMsg(null)
    const r = await testConnection(draft)
    if (r.ok && !draft.enabled) setDraft((d) => ({ ...d, enabled: true })) // 测通即启用，省去手动勾开关
    setTestMsg(r.ok ? { ...r, message: `${r.message}（已自动开启 AI 氛围组，记得保存）` } : r)
    setTesting(false)
  }

  return (
    <div data-ui className="tang-veil absolute inset-0 z-30 flex items-center justify-center" onClick={onClose}>
      <div
        className="tang-panel tang-scroll max-h-[85vh] w-[420px] max-w-[92vw] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="tang-title-cream text-xl">⚙️ 设置</h2>
          <button onClick={onClose} className="tang-btn rounded-lg px-2.5 py-1 text-sm">✕</button>
        </div>
        <div className="mb-4 rounded-lg border border-[#c9a86f]/40 bg-[#f0cb73]/10 px-3 py-1.5 text-center text-xs text-[#f0cb73]">
          ⏸ 游戏已暂停，关闭设置后继续
        </div>

        {/* AI 氛围组 */}
        <section className="tang-item-dark mb-5 rounded-xl p-4">
          <label className="mb-3 flex cursor-pointer items-center justify-between">
            <span className="tang-title-cream text-[16px]">🤖 AI 氛围组（连接大模型）</span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              className="h-4 w-4 accent-[#e3b85c]"
            />
          </label>
          <p className="mb-3 text-xs leading-relaxed text-[#f8efd8]/60">
            填入任意 OpenAI 兼容接口（/chat/completions），鱼蛋就会用大模型即兴发挥；
            不启用或调用失败时自动使用本地台词。
          </p>
          <div className="space-y-2.5">
            <label className="block text-xs text-[#f0cb73]/80">
              Base URL
              <input
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="tang-input mt-1 w-full px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-[#f0cb73]/80">
              API Key
              <input
                type="password"
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                placeholder="sk-..."
                className="tang-input mt-1 w-full px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-[#f0cb73]/80">
              模型
              <input
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                placeholder="gpt-4o-mini"
                className="tang-input mt-1 w-full px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="tang-item-dark flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs text-[#f8efd8]/85">
              <span>
                🧠 关闭思考模式
                <span className="mt-0.5 block text-[11px] text-[#f8efd8]/50">
                  本地推理模型（Qwen3 / DeepSeek-R1 等）必须勾选，否则“思考”会吃光输出额度导致回复为空
                </span>
              </span>
              <input
                type="checkbox"
                checked={draft.noThink}
                onChange={(e) => setDraft({ ...draft, noThink: e.target.checked })}
                className="ml-3 h-4 w-4 shrink-0 accent-[#e3b85c]"
              />
            </label>
            <div className="rounded-lg border border-[#4e7f73]/50 bg-[#4e7f73]/15 px-2.5 py-2 text-[11px] leading-relaxed text-[#a8d5c5]">
              💡 LM Studio 填法：Base URL 填 <code className="text-[#d5efe3]">http://localhost:1234/v1</code>，API Key 随便填（如 lm-studio），模型填已加载的模型 ID，并勾选上方「关闭思考模式」。
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={runTest} disabled={testing} className="tang-btn-jade px-3 py-1.5 text-sm">
              {testing ? '测试中…' : '🔌 测试连接'}
            </button>
            <button onClick={() => { onSave(draft) }} className="tang-btn-gold px-3 py-1.5 text-sm">
              💾 保存配置
            </button>
          </div>
          {testMsg && (
            <div className={`mt-2 rounded-lg border px-2.5 py-1.5 text-xs ${
              testMsg.ok
                ? 'border-[#4e7f73]/50 bg-[#4e7f73]/15 text-[#a8d5c5]'
                : 'border-red-800/50 bg-red-950/40 text-red-300'
            }`}>
              {testMsg.ok ? `✅ 连接成功，鱼蛋说：「${testMsg.message}」` : `❌ ${testMsg.message}`}
            </div>
          )}
        </section>

        {/* 音效 & 语音 */}
        <section className="tang-item-dark mb-5 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="tang-title-cream text-[16px]">🔊 音效</span>
            <button
              onClick={() => onMute(!muted)}
              className={`px-3 py-1.5 text-sm ${muted ? 'tang-btn' : 'tang-btn-jade'}`}
            >
              {muted ? '已静音' : '开启中'}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#c9a86f]/25 pt-3">
            <span className="tang-title-cream text-[16px]">
              🗣️ 鱼蛋语音朗读
              <span className="mt-0.5 block font-[system-ui] text-[11px] font-normal tracking-normal text-[#f8efd8]/50">用浏览器自带语音把台词读出来</span>
            </span>
            <button
              onClick={() => onVoiceChange(!voiceOn)}
              className={`shrink-0 px-3 py-1.5 text-sm ${voiceOn ? 'tang-btn-jade' : 'tang-btn'}`}
            >
              {voiceOn ? '开启中' : '已关闭'}
            </button>
          </div>
        </section>

        {/* 图鉴 */}
        <section className="tang-item-dark mb-5 rounded-xl p-4">
          <div className="tang-title-cream mb-2 text-[16px]">📖 鱼类图鉴</div>
          <div className="space-y-1.5">
            {FISH.map((f) => {
              const n = codex[f.id] ?? 0
              return (
                <div key={f.id} className="flex items-center justify-between text-sm text-[#f8efd8]/90">
                  <span className={n > 0 ? '' : 'opacity-40'}>
                    {n > 0 ? f.name : '❓ ？？？'}
                    {n > 0 && (
                      <span className="ml-2 text-[11px] text-[#f8efd8]/55">
                        {formatWeight(f.minW)} ~ {formatWeight(f.maxW)}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-[#f0cb73]/90">
                    {RARITY_STAR[f.tier]} · {rarityLabel(f.tier)}
                    {n > 0 && <span className="ml-2 text-[#f8efd8]/50">×{n}</span>}
                  </span>
                </div>
              )
            })}
            <div className="pt-1 text-xs text-[#f8efd8]/45">🥾 传说湖里还有靴子之类的奇怪东西…</div>
          </div>
        </section>

        <button
          onClick={() => { if (window.confirm('确定清空渔获存档吗？')) onResetSave() }}
          className="w-full rounded-lg border border-red-800/50 bg-red-950/30 py-2 text-sm text-red-300 transition hover:bg-red-950/50"
        >
          🗑️ 清空渔获存档
        </button>
      </div>
    </div>
  )
}
