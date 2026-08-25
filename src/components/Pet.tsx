// 氛围组宠物「鱼蛋」：右上角圆滚滚小象，姿态图 + 气泡 + 闲聊
import { useEffect, useRef, useState } from 'react'
import type { PetMood } from '../pet/companion'
import { speak } from '../pet/voice'
import { assetUrl } from '../game/engine'

export interface PetMessage {
  id: number
  text: string
  mood: PetMood
  fromAI?: boolean
}

interface Props {
  message: PetMessage | null
  thinking: boolean
  voiceOn: boolean
}

/** 戳一戳的本地反应 */
const POKE_LINES = [
  '噗？别戳我，专心看浮漂！',
  '嘿嘿，好痒～',
  '放心，有鱼咬钩我会喊你的！',
  '戳我也钓不上鱼啦🐘',
  '本象正在帮你盯着水面呢！',
]

/** 心情 → 姿态图 */
const MOOD_IMG: Record<PetMood, string> = {
  idle: 'pet/wave.png',
  happy: 'pet/skip.png',
  celebrate: 'pet/celebrate.png',
  sleepy: 'pet/sleep.png',
  shock: 'pet/shy.png',
  sad: 'pet/tea.png',
}

/** 思考中（等 AI 回复）的姿态 */
const THINKING_IMG = 'pet/read.png'

/** 平时没事做轮播的悠闲姿态 */
const IDLE_POSES = ['pet/wave.png', 'pet/tea.png', 'pet/read.png', 'pet/sweep.png']
const IDLE_ROTATE_MS = 9000

export default function Pet({ message, thinking, voiceOn }: Props) {
  const [bubble, setBubble] = useState<PetMessage | null>(null)
  const [idleIdx, setIdleIdx] = useState(0)
  const hideTimer = useRef<number>(0)

  useEffect(() => {
    if (!message) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 气泡是有生命周期的本地状态，跟随 message prop 重置
    setBubble(message)
    window.clearTimeout(hideTimer.current)
    const stay = message.mood === 'celebrate' ? 6000 : 4500
    hideTimer.current = window.setTimeout(() => setBubble(null), stay)
  }, [message])

  // 无气泡时轮播悠闲姿态，让小象看起来更鲜活
  useEffect(() => {
    const t = window.setInterval(() => setIdleIdx((i) => (i + 1) % IDLE_POSES.length), IDLE_ROTATE_MS)
    return () => window.clearInterval(t)
  }, [])

  const mood: PetMood = bubble?.mood ?? 'idle'
  const anim =
    mood === 'celebrate' ? 'pet-jump' : mood === 'sleepy' ? 'pet-sway' : mood === 'shock' ? 'pet-tremble' : 'pet-bob'

  const img = thinking ? THINKING_IMG : bubble ? MOOD_IMG[mood] : IDLE_POSES[idleIdx]

  const poke = () => {
    const text = POKE_LINES[Math.floor(Math.random() * POKE_LINES.length)]
    setBubble({ id: Date.now(), text, mood: 'happy', fromAI: false })
    if (voiceOn) speak(text, 'cute')
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setBubble(null), 2500)
  }

  return (
    <div data-ui className="pointer-events-auto absolute bottom-4 right-4 z-20 flex w-[240px] flex-col items-end gap-2">
      {/* 气泡（宣纸质感） */}
      {(bubble || thinking) && (
        <div className="pet-bubble tang-parchment relative max-w-full !rounded-2xl !rounded-tr-sm !border-2 px-3 py-2 text-[13px] leading-snug">
          {thinking ? (
            <span className="pet-dots text-[#786c4b]">鱼蛋思考中</span>
          ) : (
            <>
              {bubble?.text}
              {bubble && (
                <span
                  className="ml-1.5 align-middle text-[10px] opacity-60"
                  title={bubble.fromAI ? '由大模型生成' : '本地台词（未启用 AI 或调用失败）'}
                >
                  {bubble.fromAI ? '🤖AI' : '📻'}
                </span>
              )}
            </>
          )}
          <div className="absolute -right-[5px] top-3 h-3 w-3 rotate-45 border-r-2 border-t-2 border-[#8a6a45] bg-[#f1e4c8]" />
        </div>
      )}

      {/* 宠物本体 */}
      <button
        onClick={poke}
        title="戳我一下～"
        className={`relative flex h-28 w-28 cursor-pointer items-center justify-center drop-shadow-lg ${anim}`}
      >
        <img
          src={assetUrl(img)}
          alt="鱼蛋"
          draggable={false}
          className="max-h-full max-w-full object-contain transition-opacity duration-300"
        />
        {mood === 'sleepy' && <span className="absolute -right-1 top-1 animate-pulse text-lg">💤</span>}
        {mood === 'celebrate' && <span className="absolute -left-2 -top-2 animate-bounce text-xl">🎉</span>}
      </button>
    </div>
  )
}
