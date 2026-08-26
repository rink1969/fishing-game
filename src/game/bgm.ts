// 背景音乐：单曲循环。默认开启，开关存 localStorage。
// 浏览器自动播放策略要求先有一次用户交互，首次 play 被拒时挂一次性手势监听兜底。
import { assetUrl } from './engine'

const KEY = 'fishing-bgm-on'
const VOLUME = 0.35

let audio: HTMLAudioElement | null = null

function ensure(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(assetUrl('bgm/A_Kettle_on_the_Hearth.mp3'))
    audio.loop = true
    audio.volume = VOLUME
  }
  return audio
}

export function bgmOn(): boolean {
  return localStorage.getItem(KEY) !== '0' // 默认开
}

/** 游戏启动时调用一次；开关关闭时不做任何事。 */
export function startBgm() {
  if (!bgmOn()) return
  const a = ensure()
  void a.play().catch(() => {
    const kick = () => void a.play().catch(() => {})
    window.addEventListener('pointerdown', kick, { once: true })
    window.addEventListener('keydown', kick, { once: true })
  })
}

export function setBgm(on: boolean) {
  localStorage.setItem(KEY, on ? '1' : '0')
  const a = ensure()
  if (on) void a.play().catch(() => {}) // 来自设置页点击，必有用户手势
  else a.pause()
}
