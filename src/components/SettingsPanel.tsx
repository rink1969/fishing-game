// 设置面板：音效 / 图鉴 / 存档（寻霖塘国风皮肤）
// 注：AI 氛围组接口由 WATT App 注入，设置页不再提供大模型配置入口
import { rarityLabel, formatWeight } from '../game/engine'
import { FISH } from '../game/content'

interface Props {
  open: boolean
  muted: boolean
  voiceOn: boolean
  bgmOn: boolean
  codex: Record<string, number>
  onClose: () => void
  onMute: (m: boolean) => void
  onVoiceChange: (v: boolean) => void
  onBgmChange: (v: boolean) => void
  onResetSave: () => void
}

const RARITY_STAR: Record<number, string> = { 1: '★', 2: '★★', 3: '★★★', 4: '★★★★', 5: '★★★★★', 6: '★★★★★★' }

export default function SettingsPanel({
  open, muted, voiceOn, bgmOn, codex, onClose, onMute, onVoiceChange, onBgmChange, onResetSave,
}: Props) {
  if (!open) return null

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
              🎵 背景音乐
              <span className="mt-0.5 block font-[system-ui] text-[11px] font-normal tracking-normal text-[#f8efd8]/50">炉边小调，循环播放</span>
            </span>
            <button
              onClick={() => onBgmChange(!bgmOn)}
              className={`shrink-0 px-3 py-1.5 text-sm ${bgmOn ? 'tang-btn-jade' : 'tang-btn'}`}
            >
              {bgmOn ? '开启中' : '已关闭'}
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
