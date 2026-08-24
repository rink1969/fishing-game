// 设置面板：大模型配置 / 音效 / 图鉴 / 存档
import { useState } from 'react'
import { testConnection, type LLMConfig } from '../pet/companion'
import { rarityLabel } from '../game/engine'
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
    setTestMsg(r)
    setTesting(false)
  }

  return (
    <div data-ui className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[85vh] w-[420px] max-w-[92vw] overflow-y-auto rounded-2xl border border-white/15 bg-stone-900/95 p-5 text-stone-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">⚙️ 设置</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-stone-400 hover:bg-white/10 hover:text-white">✕</button>
        </div>
        <div className="mb-4 rounded-lg bg-amber-400/10 px-3 py-1.5 text-center text-xs text-amber-300/90">
          ⏸ 游戏已暂停，关闭设置后继续
        </div>

        {/* AI 氛围组 */}
        <section className="mb-5 rounded-xl bg-white/5 p-4">
          <label className="mb-3 flex cursor-pointer items-center justify-between">
            <span className="font-semibold">🤖 AI 氛围组（连接大模型）</span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              className="h-4 w-4 accent-amber-400"
            />
          </label>
          <p className="mb-3 text-xs leading-relaxed text-stone-400">
            填入任意 OpenAI 兼容接口（/chat/completions），鱼蛋就会用大模型即兴发挥；
            不启用或调用失败时自动使用本地台词。
          </p>
          <div className="space-y-2.5">
            <label className="block text-xs text-stone-400">
              Base URL
              <input
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-sm text-white outline-none focus:border-amber-300"
              />
            </label>
            <label className="block text-xs text-stone-400">
              API Key
              <input
                type="password"
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                placeholder="sk-..."
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-sm text-white outline-none focus:border-amber-300"
              />
            </label>
            <label className="block text-xs text-stone-400">
              模型
              <input
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                placeholder="gpt-4o-mini"
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-sm text-white outline-none focus:border-amber-300"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between rounded-lg bg-white/5 px-2.5 py-2 text-xs text-stone-300">
              <span>
                🧠 关闭思考模式
                <span className="mt-0.5 block text-[11px] text-stone-500">
                  本地推理模型（Qwen3 / DeepSeek-R1 等）必须勾选，否则“思考”会吃光输出额度导致回复为空
                </span>
              </span>
              <input
                type="checkbox"
                checked={draft.noThink}
                onChange={(e) => setDraft({ ...draft, noThink: e.target.checked })}
                className="ml-3 h-4 w-4 shrink-0 accent-amber-400"
              />
            </label>
            <div className="rounded-lg bg-sky-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-sky-300/90">
              💡 LM Studio 填法：Base URL 填 <code className="text-sky-200">http://localhost:1234/v1</code>，API Key 随便填（如 lm-studio），模型填已加载的模型 ID，并勾选上方「关闭思考模式」。
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={runTest}
              disabled={testing}
              className="rounded-lg bg-sky-500/80 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-400 disabled:opacity-50"
            >
              {testing ? '测试中…' : '🔌 测试连接'}
            </button>
            <button
              onClick={() => { onSave(draft) }}
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-stone-900 transition hover:bg-amber-300"
            >
              💾 保存配置
            </button>
          </div>
          {testMsg && (
            <div className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs ${testMsg.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
              {testMsg.ok ? `✅ 连接成功，鱼蛋说：「${testMsg.message}」` : `❌ ${testMsg.message}`}
            </div>
          )}
        </section>

        {/* 音效 & 语音 */}
        <section className="mb-5 rounded-xl bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold">🔊 音效</span>
            <button
              onClick={() => onMute(!muted)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                muted ? 'bg-white/10 text-stone-300 hover:bg-white/20' : 'bg-emerald-500/80 text-white hover:bg-emerald-400'
              }`}
            >
              {muted ? '已静音' : '开启中'}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
            <span className="font-semibold">
              🗣️ 鱼蛋语音朗读
              <span className="mt-0.5 block text-[11px] font-normal text-stone-500">用浏览器自带语音把台词读出来</span>
            </span>
            <button
              onClick={() => onVoiceChange(!voiceOn)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                voiceOn ? 'bg-emerald-500/80 text-white hover:bg-emerald-400' : 'bg-white/10 text-stone-300 hover:bg-white/20'
              }`}
            >
              {voiceOn ? '开启中' : '已关闭'}
            </button>
          </div>
        </section>

        {/* 图鉴 */}
        <section className="mb-5 rounded-xl bg-white/5 p-4">
          <div className="mb-2 font-semibold">📖 鱼类图鉴</div>
          <div className="space-y-1.5">
            {FISH.map((f) => {
              const n = codex[f.id] ?? 0
              return (
                <div key={f.id} className="flex items-center justify-between text-sm">
                  <span className={n > 0 ? '' : 'opacity-40'}>
                    {n > 0 ? f.name : '❓ ？？？'}
                  </span>
                  <span className="text-xs text-amber-300/90">
                    {RARITY_STAR[f.tier]} · {rarityLabel(f.tier)}
                    {n > 0 && <span className="ml-2 text-stone-400">×{n}</span>}
                  </span>
                </div>
              )
            })}
            <div className="pt-1 text-xs text-stone-500">🥾 传说湖里还有靴子之类的奇怪东西…</div>
          </div>
        </section>

        <button
          onClick={() => { if (window.confirm('确定清空渔获存档吗？')) onResetSave() }}
          className="w-full rounded-lg bg-red-500/15 py-2 text-sm text-red-300 transition hover:bg-red-500/25"
        >
          🗑️ 清空渔获存档
        </button>
      </div>
    </div>
  )
}
