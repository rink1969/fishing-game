// 氛围组宠物「鱼蛋」：右上角圆滚滚橘猫，表情 + 气泡 + 闲聊
import { useEffect, useRef, useState } from 'react'
import type { PetMood } from '../pet/companion'
import { speak } from '../pet/voice'

export interface PetMessage {
  id: number
  text: string
  mood: PetMood
  fromAI?: boolean
}

interface Props {
  message: PetMessage | null
  thinking: boolean
  aiOn: boolean
  voiceOn: boolean
  onOpenSettings: () => void
}

/** 戳一戳的本地反应 */
const POKE_LINES = [
  '喵？别戳我，专心看浮漂！',
  '嘿嘿，好痒～',
  '放心，有鱼咬钩我会喊你的！',
  '戳我也钓不上鱼啦😼',
  '本喵正在帮你盯着水面呢！',
]

function PetFace({ mood }: { mood: PetMood }) {
  // 眼睛
  const eyes =
    mood === 'sleepy' ? (
      <>
        <path d="M30 44 q5 4 10 0" stroke="#4a2c14" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M60 44 q5 4 10 0" stroke="#4a2c14" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </>
    ) : mood === 'shock' ? (
      <>
        <circle cx="35" cy="43" r="6" fill="#fff" stroke="#4a2c14" strokeWidth="2" />
        <circle cx="65" cy="43" r="6" fill="#fff" stroke="#4a2c14" strokeWidth="2" />
        <circle cx="35" cy="43" r="2.5" fill="#4a2c14" />
        <circle cx="65" cy="43" r="2.5" fill="#4a2c14" />
      </>
    ) : mood === 'happy' || mood === 'celebrate' ? (
      <>
        <path d="M29 42 q6 -7 12 0" stroke="#4a2c14" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M59 42 q6 -7 12 0" stroke="#4a2c14" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle className="pet-eye" cx="35" cy="43" r="4" fill="#4a2c14" />
        <circle className="pet-eye" cx="65" cy="43" r="4" fill="#4a2c14" />
      </>
    )
  // 嘴
  const mouth =
    mood === 'celebrate' ? (
      <path d="M42 56 q8 12 16 0 z" fill="#c2522f" stroke="#4a2c14" strokeWidth="2" strokeLinejoin="round" />
    ) : mood === 'shock' ? (
      <circle cx="50" cy="59" r="5" fill="#c2522f" stroke="#4a2c14" strokeWidth="2" />
    ) : mood === 'sad' ? (
      <path d="M43 61 q7 -6 14 0" stroke="#4a2c14" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    ) : (
      <path d="M42 56 q4 5 8 1 q4 4 8 -1" stroke="#4a2c14" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    )

  return (
    <svg viewBox="0 0 100 90" className="h-full w-full">
      {/* 耳朵 */}
      <path d="M22 26 L14 6 L40 16 Z" fill="#f2a24c" stroke="#d9822b" strokeWidth="2" strokeLinejoin="round" />
      <path d="M78 26 L86 6 L60 16 Z" fill="#f2a24c" stroke="#d9822b" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 22 L19 10 L34 16 Z" fill="#f7c489" />
      <path d="M76 22 L81 10 L66 16 Z" fill="#f7c489" />
      {/* 头 */}
      <ellipse cx="50" cy="50" rx="36" ry="32" fill="#f2a24c" stroke="#d9822b" strokeWidth="2.5" />
      {/* 条纹 */}
      <path d="M44 20 q6 5 12 0" stroke="#d9822b" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M40 27 q10 6 20 0" stroke="#d9822b" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* 腮红 */}
      <ellipse cx="26" cy="54" rx="6" ry="3.5" fill="#f78d7a" opacity="0.7" />
      <ellipse cx="74" cy="54" rx="6" ry="3.5" fill="#f78d7a" opacity="0.7" />
      {eyes}
      {/* 鼻子 */}
      <path d="M47 51 h6 l-3 4 z" fill="#e06c5a" />
      {mouth}
      {/* 胡须 */}
      <g stroke="#d9822b" strokeWidth="1.4" strokeLinecap="round" opacity="0.8">
        <path d="M10 48 l-12 -2" />
        <path d="M10 54 l-12 2" />
        <path d="M90 48 l12 -2" />
        <path d="M90 54 l12 2" />
      </g>
    </svg>
  )
}

export default function Pet({ message, thinking, aiOn, voiceOn, onOpenSettings }: Props) {
  const [bubble, setBubble] = useState<PetMessage | null>(null)
  const hideTimer = useRef<number>(0)

  useEffect(() => {
    if (!message) return
    setBubble(message)
    window.clearTimeout(hideTimer.current)
    const stay = message.mood === 'celebrate' ? 6000 : 4500
    hideTimer.current = window.setTimeout(() => setBubble(null), stay)
  }, [message])

  const mood: PetMood = bubble?.mood ?? 'idle'
  const anim =
    mood === 'celebrate' ? 'pet-jump' : mood === 'sleepy' ? 'pet-sway' : mood === 'shock' ? 'pet-tremble' : 'pet-bob'

  const poke = () => {
    const text = POKE_LINES[Math.floor(Math.random() * POKE_LINES.length)]
    setBubble({ id: Date.now(), text, mood: 'happy', fromAI: false })
    if (voiceOn) speak(text, 'cute')
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setBubble(null), 2500)
  }

  return (
    <div data-ui className="pointer-events-auto absolute right-4 top-4 z-20 flex w-[240px] flex-col items-end gap-2">
      {/* 设置 & AI 状态 */}
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium backdrop-blur ${
            aiOn
              ? 'border-[#3d6a5e] bg-[#4e7f73]/85 text-[#fff7d5]'
              : 'border-[#c9a86f]/60 bg-[#173337]/85 text-[#f8efd8]/85'
          }`}
        >
          {aiOn ? '🤖 AI 氛围组' : '📻 本地台词'}
        </span>
        <button
          onClick={onOpenSettings}
          className="tang-chip rounded-full px-2.5 py-1 text-sm transition hover:bg-[#173337]"
          title="设置"
        >
          ⚙️
        </button>
      </div>

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
        className={`relative h-24 w-24 cursor-pointer drop-shadow-lg ${anim}`}
      >
        <PetFace mood={thinking ? 'happy' : mood} />
        {mood === 'sleepy' && <span className="absolute -right-1 top-1 animate-pulse text-lg">💤</span>}
        {mood === 'celebrate' && <span className="absolute -left-2 -top-2 animate-bounce text-xl">🎉</span>}
      </button>
      <div className="text-[11px] font-medium text-white/80 drop-shadow">鱼蛋 · 氛围组</div>
    </div>
  )
}
