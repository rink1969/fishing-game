import { useCallback, useEffect, useRef, useState } from 'react'
import { FishingEngine, rarityLabel, assetUrl, formatWeight, type CatchResult, type EngineEvent } from './game/engine'
import { loadEconomy, saveEconomy, buyBait, gotoLocation, sellAll, addCatch, consumeBait, baitCount, type EconomyState } from './game/economy'
import { BAITS } from './game/content'
import EconomyBar from './components/EconomyBar'
import { companionSay, loadConfig, saveConfig, CANNED_ONLY, type LLMConfig, type PetMood, type Trigger } from './pet/companion'
import Pet, { type PetMessage } from './components/Pet'
import SettingsPanel from './components/SettingsPanel'
import { speak, stopSpeaking } from './pet/voice'
import './pet/pet.css'
import './tang.css'

interface SaveData {
  count: number
  totalWeight: number
  best: { name: string; weight: number } | null
  codex: Record<string, number>
}

const SAVE_KEY = 'fishing-save'
const emptySave: SaveData = { count: 0, totalWeight: 0, best: null, codex: {} }

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) return { ...emptySave, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...emptySave }
}

const TRIGGER_MOOD: Record<Trigger, PetMood> = {
  idle: 'idle',
  cast: 'happy',
  nibble: 'shock',
  bite: 'shock',
  hooked: 'happy',
  missed: 'sad',
  escaped: 'sad',
  snapped: 'shock',
  caught: 'celebrate',
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<FishingEngine | null>(null)
  const [save, setSave] = useState<SaveData>(loadSave)
  const saveRef = useRef(save)
  saveRef.current = save
  const [config, setConfig] = useState<LLMConfig>(loadConfig)
  const configRef = useRef(config)
  configRef.current = config
  const [petMsg, setPetMsg] = useState<PetMessage | null>(null)
  const [thinking, setThinking] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsOpenRef = useRef(settingsOpen)
  settingsOpenRef.current = settingsOpen
  const [muted, setMuted] = useState(false)
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('fishing-voice-on') !== '0')
  const voiceOnRef = useRef(voiceOn)
  voiceOnRef.current = voiceOn
  const [lastCatch, setLastCatch] = useState<{ result: CatchResult; isRecord: boolean } | null>(null)
  const msgId = useRef(0)
  const saySeq = useRef(0)

  // ---------------- 经济层 ----------------
  const [economy, setEconomy] = useState<EconomyState>(loadEconomy)
  const economyRef = useRef(economy)
  economyRef.current = economy
  const [selectedBait, setSelectedBait] = useState<string>(
    () => BAITS.find((b) => (economy.bait[b.id] ?? 0) > 0)?.id ?? BAITS[0].id,
  )
  const baitRef = useRef(selectedBait)
  baitRef.current = selectedBait
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => { if (toast) { const t = window.setTimeout(() => setToast(null), 2600); return () => window.clearTimeout(t) } }, [toast])
  useEffect(() => { saveEconomy(economy) }, [economy])
  useEffect(() => { engineRef.current?.setLocation(economy.locationId) }, [economy.locationId])
  useEffect(() => { engineRef.current?.setBait(selectedBait) }, [selectedBait])
  // 当前饵用光时自动切到另一种有货的饵
  useEffect(() => {
    if (baitCount(economy, selectedBait) <= 0) {
      const next = BAITS.find((b) => (economy.bait[b.id] ?? 0) > 0)
      if (next) setSelectedBait(next.id)
    }
  }, [economy, selectedBait])

  const handleBuy = (id: string, qty: number) => {
    const { state, msg } = buyBait(economy, id, qty)
    setEconomy(state)
    setToast(msg)
  }
  const handleGoto = (id: string) => {
    const { state, msg } = gotoLocation(economy, id)
    setEconomy(state)
    setToast(msg)
  }
  const handleSell = () => {
    const { state, gained } = sellAll(economy)
    setEconomy(state)
    setToast(gained > 0 ? `卖出渔获，+${gained} 灵玉` : '渔篓里没有可卖的鱼')
  }

  const speakLine = (text: string, mood: PetMood) => {
    if (!voiceOnRef.current) return
    speak(text, mood === 'celebrate' || mood === 'shock' ? 'excited' : mood === 'sad' ? 'sad' : 'cute')
  }

  const getEnvString = () => {
    // 只传时段（清晨/黄昏/夜晚…），不传具体时刻，避免模型报时间
    return engineRef.current?.getEnv()?.phase
  }

  const petSpeak = useCallback(async (trigger: Trigger, result?: CatchResult, isRecord?: boolean) => {
    const mood = TRIGGER_MOOD[trigger]
    // 快速变化的事件永远用本地台词（AI 来不及反应）
    if (CANNED_ONLY.has(trigger) || !configRef.current.enabled) {
      const r = await companionSay(trigger, configRef.current, { result })
      msgId.current += 1
      setPetMsg({ id: msgId.current, text: r.text, mood, fromAI: r.fromAI })
      speakLine(r.text, mood)
      return
    }
    // AI 模式（等待闲聊 / 钓获庆祝）：带上环境和鱼情上下文
    const seq = ++saySeq.current
    setThinking(true)
    const sv = saveRef.current
    const engine = engineRef.current
    const r = await companionSay(trigger, configRef.current, {
      result,
      stats: `${sv.count} 条 / 总重 ${formatWeight(sv.totalWeight)}${sv.best ? `，最重 ${sv.best.name} ${formatWeight(sv.best.weight)}` : ''}`,
      env: getEnvString(),
      waitSeconds: engine?.getState() === 'waiting' ? engine.getStateTime() : undefined,
      isRecord,
    })
    if (seq !== saySeq.current) return
    setThinking(false)
    msgId.current += 1
    setPetMsg({ id: msgId.current, text: r.text, mood, fromAI: r.fromAI })
    speakLine(r.text, mood)
    if (r.error) setAiError(r.error)
  }, [])

  // AI 错误提示自动消失
  useEffect(() => {
    if (!aiError) return
    const t = window.setTimeout(() => setAiError(null), 7000)
    return () => window.clearTimeout(t)
  }, [aiError])

  // ---------------- 游戏引擎 ----------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new FishingEngine(canvas)
    engineRef.current = engine
    engine.setLocation(economyRef.current.locationId)
    engine.setBait(baitRef.current)
    engine.beforeCast = () => {
      if (baitCount(economyRef.current, baitRef.current) <= 0) {
        setToast('没有鱼饵了，去 🛒 商店买一些吧')
        return false
      }
      return true
    }

    engine.onEvent = (e: EngineEvent) => {
      switch (e.type) {
        case 'cast':
          if (Math.random() < 0.5) void petSpeak('cast')
          setEconomy((e) => consumeBait(e, baitRef.current))
          break
        case 'nibble':
          void petSpeak('nibble')
          break
        case 'bite':
          void petSpeak('bite')
          break
        case 'hooked':
          void petSpeak('hooked')
          break
        case 'missed':
          void petSpeak('missed')
          break
        case 'escaped':
          void petSpeak('escaped')
          break
        case 'snapped':
          void petSpeak('snapped')
          break
        case 'caught': {
          const r = e.result
          setSave((prev) => {
            const next: SaveData = {
              count: r.isJunk ? prev.count : prev.count + 1,
              totalWeight: r.isJunk ? prev.totalWeight : Math.round((prev.totalWeight + r.weight) * 1000) / 1000,
              best:
                !r.isJunk && (!prev.best || r.weight > prev.best.weight)
                  ? { name: r.species!.name, weight: r.weight }
                  : prev.best,
              codex:
                !r.isJunk && r.species
                  ? { ...prev.codex, [r.species.id]: (prev.codex[r.species.id] ?? 0) + 1 }
                  : prev.codex,
            }
            localStorage.setItem(SAVE_KEY, JSON.stringify(next))
            return next
          })
          const isRecord =
            !r.isJunk &&
            saveRef.current.count > 0 &&
            (!saveRef.current.best || r.weight > saveRef.current.best.weight)
          setLastCatch({ result: r, isRecord })
          if (!r.isJunk && r.species) {
            setEconomy((e) => addCatch(e, r.species!.id, r.weight, r.value))
          }
          void petSpeak('caught', r, isRecord)
          break
        }
        default:
          break
      }
    }
    engine.start()
    return () => {
      engine.stop()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    engineRef.current?.setMuted(muted)
  }, [muted])

  // 打开设置时暂停整个游戏：冻结引擎、停止朗读
  useEffect(() => {
    engineRef.current?.setPaused(settingsOpen)
    if (settingsOpen) stopSpeaking()
  }, [settingsOpen])

  // ---------------- 等待时的闲聊（每 22~40 秒） ----------------
  useEffect(() => {
    let timer = 0
    let next = 22 + Math.random() * 18
    const iv = window.setInterval(() => {
      if (settingsOpenRef.current) return // 设置打开时游戏暂停，不闲聊
      timer += 1
      if (timer < next) return
      const st = engineRef.current?.getState()
      if (st === 'waiting' || st === 'idle') {
        void petSpeak('idle')
        timer = 0
        next = 22 + Math.random() * 18
      } else {
        timer = next - 4 // 状态不对就稍后再看
      }
    }, 1000)
    return () => window.clearInterval(iv)
  }, [petSpeak])

  const handleSaveConfig = (c: LLMConfig) => {
    saveConfig(c)
    setConfig(c)
  }

  const resetSave = () => {
    localStorage.removeItem(SAVE_KEY)
    setSave({ ...emptySave })
  }

  const toggleVoice = (v: boolean) => {
    setVoiceOn(v)
    localStorage.setItem('fishing-voice-on', v ? '1' : '0')
    if (!v) stopSpeaking()
  }

  const dismissCatch = () => {
    setLastCatch(null)
    engineRef.current?.dismissResult()
  }

  const c = lastCatch?.result

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b1030] select-none">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* 左上：渔获统计 */}
      <div data-ui className="tang-panel absolute left-4 top-4 z-20 px-4 py-2.5">
        <div className="tang-title-cream text-[17px]">🎣 钓鱼大师</div>
        <div className="mt-1 space-y-0.5 text-[13px] text-[#f8efd8]/85">
          <div>渔获：<b className="text-[#f0cb73]">{save.count}</b> 条 · 总重 <b className="text-[#f0cb73]">{formatWeight(save.totalWeight)}</b></div>
          {save.best && (
            <div>最重的：{save.best.name} <b className="text-[#f0cb73]">{formatWeight(save.best.weight)}</b></div>
          )}
        </div>
      </div>

      {/* 右上：宠物氛围组 */}
      <Pet
        message={petMsg}
        thinking={thinking}
        aiOn={config.enabled && !!config.apiKey}
        voiceOn={voiceOn}
        onOpenSettings={() => { setSettingsOpen(true) }}
      />

      {/* AI 调用失败提示 */}
      {aiError && (
        <div data-ui className="absolute right-4 top-[190px] z-20 w-[240px] rounded-xl border border-red-300/40 bg-red-950/85 px-3 py-2 text-[12px] leading-snug text-red-200 backdrop-blur">
          ⚠️ AI 调用失败，本条用了本地台词：
          <div className="mt-1 break-all text-red-300/80">{aiError}</div>
          <div className="mt-1 text-white/60">点右上角 ⚙️ 检查配置或测试连接</div>
        </div>
      )}

      {/* 渔获卡片 */}
      {lastCatch && c && (
        <div data-ui className="tang-veil absolute inset-0 z-30 flex items-center justify-center" onClick={dismissCatch}>
          <div
            className="catch-card tang-parchment w-[320px] p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {c.isJunk ? (
              <>
                <div className="text-5xl">{c.junkName === '破靴子' ? '🥾' : c.junkName === '易拉罐' ? '🥫' : c.junkName === '小虾米' ? '🦐' : '🌿'}</div>
                <div className="tang-title mt-3 text-xl">钓上了……{c.junkName}？</div>
                <div className="mt-1 text-sm text-[#786c4b]">保护环境，人人有责 😅</div>
              </>
            ) : (
              <>
                <div className="tang-label">渔 获</div>
                <div className="mx-auto flex h-24 w-24 items-center justify-center">
                  {c.species!.img ? (
                    <img src={assetUrl(c.species!.img)} alt={c.species!.name} className="h-20 w-20 object-contain drop-shadow" />
                  ) : (
                    <span className="text-5xl">{c.species!.emoji}</span>
                  )}
                </div>
                <div className="tang-title mt-1 text-3xl">
                  {c.species!.name}
                </div>
                <div className="mt-1.5">
                  <span className="tang-chip-gold px-2.5 py-0.5 text-[12px]">
                    {'★'.repeat(c.species!.rarity)} {rarityLabel(c.species!.rarity)}
                  </span>
                </div>
                <div className="tang-title mt-2 text-4xl text-[#9b7133]">{formatWeight(c.weight)}</div>
                <div className="mt-1 text-sm text-[#786c4b]">价值 {c.value} 灵玉 · 可在 🎒 渔篓卖出</div>
                {lastCatch.isRecord && (
                  <div className="mt-2 inline-block rounded-full border border-[#a97f3d] bg-[#f3d489]/60 px-3 py-0.5 text-sm font-bold text-[#8a5a18]">
                    🏆 新纪录！
                  </div>
                )}
              </>
            )}
            <button
              onClick={dismissCatch}
              className="tang-btn-gold mt-5 w-full py-2.5 text-[15px]"
            >
              继续钓鱼 🎣
            </button>
          </div>
        </div>
      )}

      {/* 设置 */}
      <SettingsPanel
        open={settingsOpen}
        config={config}
        muted={muted}
        voiceOn={voiceOn}
        codex={save.codex}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveConfig}
        onMute={setMuted}
        onVoiceChange={toggleVoice}
        onResetSave={resetSave}
      />

      <EconomyBar
        economy={economy}
        selectedBait={selectedBait}
        onSelectBait={setSelectedBait}
        onBuy={handleBuy}
        onGoto={handleGoto}
        onSell={handleSell}
      />

      {toast && (
        <div data-ui className="tang-chip absolute bottom-20 left-1/2 z-40 -translate-x-1/2 px-4 py-2 text-[13px] text-[#f0cb73] shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
