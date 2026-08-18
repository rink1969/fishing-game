// ============================================================
// 钓鱼大师 · 第一人称钓鱼游戏引擎（Canvas 2D，单机）
// 状态机: idle → charging → casting → waiting → bite → reeling
//         → leaping → result → idle
// ============================================================

export type GameState =
  | 'idle'
  | 'charging'
  | 'casting'
  | 'waiting'
  | 'bite'
  | 'reeling'
  | 'leaping'
  | 'result'

export interface FishSpecies {
  id: string
  name: string
  emoji: string
  minW: number
  maxW: number
  rarity: 1 | 2 | 3 | 4 // 1普通 2少见 3稀有 4传说
  fight: number // 挣扎强度
  color: string
  chance: number // 基础权重
}

export interface CatchResult {
  species: FishSpecies | null
  junkName: string | null
  weight: number // kg，junk 为 0
  isJunk: boolean
}

export type EngineEvent =
  | { type: 'cast' }
  | { type: 'nibble' }
  | { type: 'bite' }
  | { type: 'hooked' }
  | { type: 'missed' } // 咬钩没拉到
  | { type: 'escaped' } // 遛鱼时跑掉
  | { type: 'snapped' } // 断线
  | { type: 'caught'; result: CatchResult }
  | { type: 'statechange'; state: GameState }

export const SPECIES: FishSpecies[] = [
  { id: 'crucian', name: '小鲫鱼', emoji: '🐟', minW: 0.1, maxW: 0.7, rarity: 1, fight: 0.65, color: '#9fb2c4', chance: 38 },
  { id: 'carp', name: '大鲤鱼', emoji: '🐠', minW: 0.6, maxW: 2.4, rarity: 1, fight: 1.0, color: '#c8843c', chance: 26 },
  { id: 'grass', name: '草鱼', emoji: '🐡', minW: 1.0, maxW: 4.2, rarity: 2, fight: 1.25, color: '#7d9b6a', chance: 14 },
  { id: 'bass', name: '鲈鱼', emoji: '🦈', minW: 0.8, maxW: 3.0, rarity: 2, fight: 1.35, color: '#5f7d9c', chance: 10 },
  { id: 'catfish', name: '鲶鱼', emoji: '😾', minW: 1.5, maxW: 6.0, rarity: 3, fight: 1.5, color: '#4a4a58', chance: 5 },
  { id: 'koi', name: '锦鲤', emoji: '🎏', minW: 0.5, maxW: 1.8, rarity: 3, fight: 1.1, color: '#e06c5a', chance: 4 },
  { id: 'golden', name: '黄金鲤', emoji: '👑', minW: 2.0, maxW: 5.5, rarity: 4, fight: 1.8, color: '#e8b830', chance: 1.2 },
]

export const JUNK_ITEMS = ['破靴子', '水草团', '小虾米', '易拉罐', '烂渔网']

const RARITY_LABEL: Record<number, string> = { 1: '普通', 2: '少见', 3: '稀有', 4: '传说' }
export function rarityLabel(r: number) {
  return RARITY_LABEL[r] ?? '普通'
}

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number
  size: number; color: string; gravity: number
}
interface Ripple { x: number; y: number; r: number; maxR: number; alpha: number }
interface Shadow { lat: number; d: number; speed: number; size: number; dir: number }
interface Cloud { x: number; y: number; s: number; v: number }

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function rand(a: number, b: number) { return a + Math.random() * (b - a) }

// ---------- 极简合成音效 ----------
class Sfx {
  private ctx: AudioContext | null = null
  muted = false
  private ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AC) this.ctx = new AC()
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }
  private tone(freq: number, dur: number, type: OscillatorType, vol = 0.12, slideTo?: number, delay = 0) {
    if (this.muted) return
    const ctx = this.ensure(); if (!ctx) return
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.type = type; osc.frequency.setValueAtTime(freq, t0)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur)
    g.gain.setValueAtTime(vol, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    osc.connect(g).connect(ctx.destination)
    osc.start(t0); osc.stop(t0 + dur + 0.05)
  }
  private noise(dur: number, vol = 0.15, freq = 800, delay = 0) {
    if (this.muted) return
    const ctx = this.ensure(); if (!ctx) return
    const t0 = ctx.currentTime + delay
    const len = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource(); src.buffer = buf
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq
    const g = ctx.createGain(); g.gain.value = vol
    src.connect(f).connect(g).connect(ctx.destination)
    src.start(t0)
  }
  plop() { this.tone(240, 0.18, 'sine', 0.18, 70); this.noise(0.15, 0.1, 500) }
  splash() { this.noise(0.35, 0.2, 1200) }
  alert() { this.tone(880, 0.09, 'square', 0.09); this.tone(660, 0.12, 'square', 0.09, undefined, 0.1) }
  nibble() { this.tone(520, 0.06, 'sine', 0.06, 420) }
  snap() { this.noise(0.12, 0.25, 3000); this.tone(300, 0.2, 'sawtooth', 0.08, 90) }
  fail() { this.tone(320, 0.25, 'sawtooth', 0.07, 200); this.tone(200, 0.35, 'sawtooth', 0.07, 120, 0.22) }
  fanfare(big: boolean) {
    const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047]
    notes.forEach((n, i) => this.tone(n, 0.16, 'triangle', 0.11, undefined, i * 0.11))
  }
  tick() { this.tone(1200, 0.03, 'sine', 0.03) }
}

// ---------- 天空配色（按一天中的时刻插值） ----------
interface SkyStop { t: number; top: string; mid: string; water: string; dark: number }
const SKY: SkyStop[] = [
  { t: 0.0, top: '#0b1030', mid: '#1c2450', water: '#101c33', dark: 1 },
  { t: 0.2, top: '#0b1030', mid: '#1c2450', water: '#101c33', dark: 1 },
  { t: 0.27, top: '#3a4a8a', mid: '#e88a5a', water: '#2c3a55', dark: 0.45 },
  { t: 0.35, top: '#5ea8e0', mid: '#bfe3f5', water: '#2e6f8f', dark: 0 },
  { t: 0.5, top: '#3f96e0', mid: '#aadcF2', water: '#2b7a9c', dark: 0 },
  { t: 0.66, top: '#4a86d8', mid: '#c8e0ee', water: '#2c6e90', dark: 0.05 },
  { t: 0.76, top: '#5a4a9a', mid: '#f59a52', water: '#3a3560', dark: 0.5 },
  { t: 0.84, top: '#141a3c', mid: '#303a6a', water: '#142036', dark: 0.95 },
  { t: 1.0, top: '#0b1030', mid: '#1c2450', water: '#101c33', dark: 1 },
]
function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(',')})`
}
function skyAt(dayT: number): SkyStop & { topC: string; midC: string; waterC: string } {
  let i = 0
  while (i < SKY.length - 2 && dayT > SKY[i + 1].t) i++
  const a = SKY[i], b = SKY[i + 1]
  const t = clamp((dayT - a.t) / (b.t - a.t || 1), 0, 1)
  return {
    ...a,
    topC: hexLerp(a.top, b.top, t),
    midC: hexLerp(a.mid, b.mid, t),
    waterC: hexLerp(a.water, b.water, t),
    dark: lerp(a.dark, b.dark, t),
  }
}

export class FishingEngine {
  onEvent: (e: EngineEvent) => void = () => {}
  state: GameState = 'idle'

  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private W = 0; private H = 0; private dpr = 1
  private horizonY = 0
  private raf = 0
  private lastTs = 0
  private running = false
  private time = 0
  private stateT = 0

  private pressed = false
  private sfx = new Sfx()

  // 抛竿
  private charge = 0
  private castT = 0
  private castFrom = { x: 0, y: 0 }
  private castTarget = { d: 0.5, lat: 0 }

  // 浮漂（伪3D：d=距离 0近1远，lat=横向 -1..1）
  private bob = { d: 0.5, lat: 0, dip: 0, out: false }

  // 等待
  private nextBiteIn = 5
  private nibbleAt = -1
  private nibbled = false

  // 咬钩 / 遛鱼
  private biteLeft = 0
  private current: CatchResult | null = null
  private tension = 0.35
  private slackT = 0
  private reelProgress = 0
  private fishStamina = 1
  private surging = false
  private surgeT = 1.5
  private surgeLeft = 0
  private fishLatTarget = 0

  // 起鱼动画
  private leapT = 0

  // 环境
  private dayT = 0.32 // 一天的时刻 0..1，开局上午
  private particles: Particle[] = []
  private ripples: Ripple[] = []
  private shadows: Shadow[] = []
  private clouds: Cloud[] = []
  private msg = '' // 中央提示
  private msgT = 0
  private shake = 0

  private ro: ResizeObserver | null = null
  private detachInput: (() => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.ctx = ctx
    for (let i = 0; i < 5; i++) {
      this.clouds.push({ x: Math.random(), y: rand(0.04, 0.2), s: rand(0.5, 1.3), v: rand(0.004, 0.012) })
    }
    this.resize()
    this.attachInput()
  }

  // ---------------- 生命周期 ----------------
  start() {
    if (this.running) return
    this.running = true
    this.lastTs = performance.now()
    const loop = (ts: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000)
      this.lastTs = ts
      this.update(dt)
      this.draw()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(this.canvas.parentElement ?? document.body)
  }
  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.ro?.disconnect()
    this.detachInput?.()
  }
  setMuted(m: boolean) { this.sfx.muted = m }
  getState() { return this.state }
  getStateTime() { return this.stateT }
  /** 当前游戏内环境信息（供 AI 生成有梗台词） */
  getEnv() {
    const mins = Math.floor(this.dayT * 24 * 60)
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    const h = mins / 60
    const phase =
      h < 5 ? '凌晨' : h < 8 ? '清晨' : h < 11 ? '上午' : h < 13 ? '正午' : h < 17 ? '下午' : h < 19.5 ? '黄昏' : '夜晚'
    return { clock: `${hh}:${mm}`, phase }
  }

  // ---------------- 输入 ----------------
  private attachInput() {
    const down = (e: Event) => {
      if (e instanceof KeyboardEvent && e.code !== 'Space') return
      if ((e.target as HTMLElement | null)?.closest('[data-ui]')) return
      e.preventDefault()
      this.press()
    }
    const up = (e: Event) => {
      if (e instanceof KeyboardEvent && e.code !== 'Space') return
      this.release()
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('keyup', up)
    this.detachInput = () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keyup', up)
    }
  }

  press() {
    if (this.pressed) return
    this.pressed = true
    switch (this.state) {
      case 'idle':
        this.setState('charging')
        this.charge = 0
        break
      case 'waiting':
      case 'bite':
        this.tryHook()
        break
      default:
        break
    }
  }

  release() {
    this.pressed = false
    if (this.state === 'charging') this.doCast()
  }

  dismissResult() {
    if (this.state === 'result') {
      this.bob.out = false
      this.setState('idle')
    }
  }

  private setState(s: GameState) {
    this.state = s
    this.stateT = 0
    this.onEvent({ type: 'statechange', state: s })
  }

  private showMsg(text: string, ttl = 1.8) {
    this.msg = text
    this.msgT = ttl
  }

  // ---------------- 玩法逻辑 ----------------
  private doCast() {
    const power = this.charge
    this.castTarget = {
      d: clamp(0.25 + power * 0.7, 0.2, 0.95),
      lat: rand(-0.5, 0.5),
    }
    const tip = this.rodTip()
    this.castFrom = { x: tip.x, y: tip.y }
    this.castT = 0
    this.setState('casting')
    this.onEvent({ type: 'cast' })
  }

  private rollCatch(): CatchResult {
    // 黄昏和夜晚稀有鱼概率提升
    const nightBonus = 1 + skyAt(this.dayT).dark * 3
    if (Math.random() < 0.1) {
      return { species: null, junkName: JUNK_ITEMS[Math.floor(Math.random() * JUNK_ITEMS.length)], weight: 0, isJunk: true }
    }
    const pool = SPECIES.map((s) => ({
      s,
      w: s.chance * (s.rarity >= 3 ? nightBonus : 1),
    }))
    const total = pool.reduce((a, b) => a + b.w, 0)
    let r = Math.random() * total
    let sp = pool[0].s
    for (const p of pool) { r -= p.w; if (r <= 0) { sp = p.s; break } }
    const skew = sp.rarity >= 3 ? Math.random() * Math.random() : Math.random() ** 2
    const weight = Math.round((sp.minW + (sp.maxW - sp.minW) * skew) * 100) / 100
    return { species: sp, junkName: null, weight, isJunk: false }
  }

  private tryHook() {
    if (this.state !== 'bite') {
      // 提前拉杆：惊扰鱼群，重新计时
      if (this.state === 'waiting') {
        this.showMsg('太早了！鱼被吓跑了…')
        this.nextBiteIn = rand(13, 20)
        this.nibbled = false
        this.nibbleAt = this.nextBiteIn > 2 ? this.nextBiteIn - rand(0.8, 1.4) : -1
        this.sfx.nibble()
      }
      return
    }
    // 中鱼！
    this.setState('reeling')
    const c = this.current
    const fight = c?.species?.fight ?? 0.8
    this.tension = 0.4
    this.slackT = 0
    this.reelProgress = 0
    this.fishStamina = c?.isJunk ? 0.4 : 0.7 + fight * 0.3
    this.surging = false
    this.surgeT = rand(1.2, 2.4)
    this.shake = 6
    this.sfx.splash()
    this.onEvent({ type: 'hooked' })
  }

  private update(dt: number) {
    this.time += dt
    this.stateT += dt
    // 游戏内一天 = 4 分钟
    this.dayT = (this.dayT + dt / 240) % 1
    if (this.msgT > 0) this.msgT -= dt
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 20)

    // 云
    for (const c of this.clouds) {
      c.x += c.v * dt
      if (c.x > 1.2) c.x = -0.2
    }

    // 粒子与涟漪
    this.particles = this.particles.filter((p) => {
      p.life += dt
      p.vy += p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      return p.life < p.maxLife
    })
    this.ripples = this.ripples.filter((r) => {
      r.r += dt * 30
      r.alpha = 1 - r.r / r.maxR
      return r.alpha > 0
    })

    // 浮漂屏幕坐标
    const bp = this.bobScreen()

    switch (this.state) {
      case 'charging': {
        this.charge = clamp(this.charge + dt / 1.15, 0, 1)
        break
      }
      case 'casting': {
        this.castT += dt / 0.7
        if (this.castT >= 1) {
          this.bob.d = this.castTarget.d
          this.bob.lat = this.castTarget.lat
          this.bob.out = true
          this.spawnSplash(bp.x, bp.y, 14, 0.7)
          this.ripples.push({ x: bp.x, y: bp.y, r: 4, maxR: 60 * bp.scale, alpha: 1 })
          this.sfx.plop()
          this.nextBiteIn = rand(14, 24)
          this.nibbled = false
          this.nibbleAt = this.nextBiteIn > 2.5 ? this.nextBiteIn - rand(0.9, 1.6) : -1
          this.setState('waiting')
        }
        break
      }
      case 'waiting': {
        // 浮漂随波浪起伏
        this.bob.dip = Math.sin(this.time * 2.2) * 2 * bp.scale
        // 鱼影
        if (Math.random() < dt * 0.25 && this.shadows.length < 2) {
          this.shadows.push({
            lat: rand(-0.8, 0.8),
            d: clamp(this.bob.d + rand(-0.15, 0.15), 0.2, 0.9),
            speed: rand(0.05, 0.15),
            size: rand(0.6, 1.4),
            dir: Math.random() < 0.5 ? -1 : 1,
          })
        }
        for (const s of this.shadows) s.lat += s.speed * s.dir * dt
        this.shadows = this.shadows.filter((s) => Math.abs(s.lat) < 1.2)

        // 试探（nibble）
        if (!this.nibbled && this.nibbleAt > 0 && this.stateT > this.nextBiteIn - this.nibbleAt) {
          this.nibbled = true
          this.bob.dip = 6 * bp.scale
          this.sfx.nibble()
          this.onEvent({ type: 'nibble' })
        }
        if (this.nibbled) {
          this.bob.dip = Math.sin(this.time * 14) * 3.5 * bp.scale
        }
        if (this.stateT >= this.nextBiteIn) {
          this.current = this.rollCatch()
          const rarity = this.current.species?.rarity ?? 1
          this.biteLeft = clamp(1.15 - rarity * 0.1, 0.6, 1.1)
          this.setState('bite')
          this.sfx.alert()
          this.shake = 4
          this.onEvent({ type: 'bite' })
        }
        break
      }
      case 'bite': {
        this.bob.dip = 10 * bp.scale + Math.sin(this.time * 22) * 3 * bp.scale
        if (Math.random() < dt * 8) this.ripples.push({ x: bp.x, y: bp.y, r: 3, maxR: 40 * bp.scale, alpha: 1 })
        this.biteLeft -= dt
        if (this.biteLeft <= 0) {
          this.showMsg('鱼跑了…饵被吃掉了')
          this.sfx.fail()
          this.bob.dip = 0
          this.onEvent({ type: 'missed' })
          this.nextBiteIn = rand(13, 20)
          this.nibbled = false
          this.nibbleAt = this.nextBiteIn > 2.5 ? this.nextBiteIn - rand(0.9, 1.6) : -1
          this.setState('waiting')
          this.stateT = this.nextBiteIn * 0.3 // 已经等了一会儿
        }
        break
      }
      case 'reeling': {
        const c = this.current
        const fight = c?.species?.fight ?? 0.8
        const isJunk = c?.isJunk ?? false

        // 鱼的挣扎：周期性猛冲（鱼越累，冲得越稀）
        if (!this.surging) {
          this.surgeT -= dt
          if (this.surgeT <= 0 && !isJunk) {
            this.surging = true
            this.surgeLeft = rand(0.6, 1.1)
            this.fishLatTarget = clamp(this.bob.lat + rand(-0.9, 0.9), -0.9, 0.9)
            this.showMsg('鱼在猛冲！快松手！', 1.0)
          }
        } else {
          this.surgeLeft -= dt
          this.tension += dt * 0.32 * fight
          this.bob.lat = lerp(this.bob.lat, this.fishLatTarget, dt * 3)
          if (Math.random() < dt * 6) this.spawnSplash(bp.x, bp.y, 3, 0.4)
          if (this.surgeLeft <= 0) {
            this.surging = false
            // 体力满时 1.5~2.7 秒一冲，体力耗尽后 3.4~5.9 秒才冲一次
            this.surgeT = rand(2.2, 3.8) * (1.7 - this.fishStamina)
          }
        }

        // 玩家收线
        if (this.pressed) {
          this.tension += dt * (0.42 + fight * 0.18)
          if (this.tension > 0.22 && this.tension < 0.85) {
            const eff = 1 - (this.surging ? 0.7 : 0) - this.fishStamina * 0.2
            this.reelProgress += dt * 0.24 * Math.max(0.25, eff)
            this.fishStamina = Math.max(0.15, this.fishStamina - dt * 0.06)
            if (Math.random() < dt * 5) this.sfx.tick()
          }
        } else {
          this.tension -= dt * 0.95
        }
        // 鱼随时间也会慢慢疲劳（保证遛鱼时长有上限）
        this.fishStamina = Math.max(0.15, this.fishStamina - dt * 0.015)
        this.tension = clamp(this.tension, 0, 1.15)

        // 断线
        if (this.tension >= 1) {
          this.sfx.snap()
          this.spawnSplash(bp.x, bp.y, 8, 0.5)
          this.showMsg('线断了！！', 2)
          this.bob.out = false
          this.onEvent({ type: 'snapped' })
          this.setState('idle')
          break
        }
        // 太松跑鱼
        if (this.tension < 0.06) {
          this.slackT += dt
          if (this.slackT > 2.0) {
            this.sfx.fail()
            this.showMsg('线太松，鱼脱钩了…', 2)
            this.onEvent({ type: 'escaped' })
            this.bob.out = false
            this.setState('idle')
            break
          }
        } else {
          this.slackT = Math.max(0, this.slackT - dt * 2)
        }
        // 松手只掉张力、不倒扣进度（进度只进不退）
        // 鱼在水面附近扑腾
        if (this.reelProgress > 0.75 && Math.random() < dt * 4) {
          this.spawnSplash(bp.x, bp.y, 4, 0.5)
        }
        if (this.reelProgress >= 1) {
          this.setState('leaping')
          this.leapT = 0
          this.sfx.splash()
          this.spawnSplash(bp.x, bp.y, 20, 1)
        }
        // 浮漂随收线靠近
        this.bob.d = lerp(this.castTarget.d, 0.08, this.reelProgress)
        this.bob.dip = Math.sin(this.time * 6) * 3 * bp.scale
        break
      }
      case 'leaping': {
        this.leapT += dt / 1.3
        if (this.leapT >= 1) {
          const c = this.current
          if (c) {
            this.sfx.fanfare(!c.isJunk && (c.species?.rarity ?? 0) >= 3)
            this.onEvent({ type: 'caught', result: c })
          }
          this.setState('result')
        }
        break
      }
      case 'result':
        break
      default:
        break
    }
  }

  // ---------------- 坐标映射 ----------------
  private bobScreen() {
    const d = this.bob.d
    const y = lerp(this.H * 0.9, this.horizonY + 10, 1 - (1 - d) ** 1.6)
    const x = this.W * 0.5 + this.bob.lat * lerp(this.W * 0.32, this.W * 0.07, d)
    const scale = lerp(1.6, 0.45, d)
    return { x, y, scale }
  }

  private rodTip() {
    // 竿尾在右下，竿尖指向湖心；出线后竿尖被拉向浮漂并随张力弯曲
    const baseX = this.W * 0.88
    const idleX = this.W * 0.58
    const idleY = this.H * 0.3
    if (!this.bob.out && this.state !== 'casting') return { x: idleX, y: idleY, baseX }
    const bp = this.bobScreen()
    const t = this.state === 'reeling' ? this.tension : 0.25
    const k = this.state === 'casting' ? 0.1 : 0.22 + t * 0.2
    return {
      x: lerp(idleX, bp.x, k),
      y: lerp(idleY, bp.y, 0.1 + t * 0.22),
      baseX,
    }
  }

  // ---------------- 特效 ----------------
  private spawnSplash(x: number, y: number, n: number, power: number) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y,
        vx: rand(-90, 90) * power,
        vy: rand(-200, -40) * power,
        life: 0,
        maxLife: rand(0.4, 0.9),
        size: rand(1.5, 4),
        color: 'rgba(230,245,255,0.9)',
        gravity: 500,
      })
    }
  }

  // ---------------- 渲染 ----------------
  private resize() {
    const parent = this.canvas.parentElement
    const w = parent?.clientWidth ?? window.innerWidth
    const h = parent?.clientHeight ?? window.innerHeight
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.W = w
    this.H = h
    this.canvas.width = Math.floor(w * this.dpr)
    this.canvas.height = Math.floor(h * this.dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.horizonY = h * 0.44
  }

  private draw() {
    const { ctx, W, H } = this
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    if (this.shake > 0) {
      ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake))
    }
    const sky = skyAt(this.dayT)

    // 天空
    const g = ctx.createLinearGradient(0, 0, 0, this.horizonY)
    g.addColorStop(0, sky.topC)
    g.addColorStop(1, sky.midC)
    ctx.fillStyle = g
    ctx.fillRect(-10, -10, W + 20, this.horizonY + 12)

    // 星星
    if (sky.dark > 0.4) {
      ctx.save()
      ctx.globalAlpha = (sky.dark - 0.4) * 1.4
      ctx.fillStyle = '#ffffff'
      for (let i = 0; i < 60; i++) {
        const sx = ((i * 137.5) % 100) / 100 * W
        const sy = ((i * 89.3) % 100) / 100 * this.horizonY * 0.8
        const tw = 0.5 + 0.5 * Math.sin(this.time * 2 + i)
        ctx.globalAlpha = (sky.dark - 0.4) * 1.4 * tw
        ctx.fillRect(sx, sy, 2, 2)
      }
      ctx.restore()
    }

    // 太阳 / 月亮沿弧线
    const sunA = Math.PI * (1 - this.dayT) // 0.25→清晨左 …
    const sunX = W * 0.5 + Math.cos(sunA) * W * 0.42
    const sunY = this.horizonY - Math.sin(sunA) * H * 0.34
    if (sky.dark < 0.7) {
      const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 60)
      sg.addColorStop(0, 'rgba(255,240,180,0.95)')
      sg.addColorStop(1, 'rgba(255,240,180,0)')
      ctx.fillStyle = sg
      ctx.fillRect(sunX - 60, sunY - 60, 120, 120)
      ctx.fillStyle = '#ffdf8a'
      ctx.beginPath(); ctx.arc(sunX, sunY, 18, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.fillStyle = '#e8ecf5'
      ctx.beginPath(); ctx.arc(W * 0.78, H * 0.12, 16, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = sky.topC
      ctx.beginPath(); ctx.arc(W * 0.78 - 7, H * 0.12 - 4, 13, 0, Math.PI * 2); ctx.fill()
    }

    // 云
    ctx.save()
    ctx.globalAlpha = 0.75 - sky.dark * 0.5
    ctx.fillStyle = sky.dark > 0.5 ? '#3a4470' : '#ffffff'
    for (const c of this.clouds) {
      const cx = c.x * W
      const cy = c.y * H
      const s = c.s
      ctx.beginPath()
      ctx.ellipse(cx, cy, 46 * s, 13 * s, 0, 0, Math.PI * 2)
      ctx.ellipse(cx - 30 * s, cy + 5 * s, 26 * s, 9 * s, 0, 0, Math.PI * 2)
      ctx.ellipse(cx + 32 * s, cy + 4 * s, 28 * s, 10 * s, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // 远山/树林剪影
    ctx.fillStyle = hexLerp('#2e5d43', '#0c1428', sky.dark)
    ctx.beginPath()
    ctx.moveTo(-10, this.horizonY + 2)
    for (let x = -10; x <= W + 10; x += 24) {
      const y = this.horizonY - 14 - Math.sin(x * 0.011 + 2) * 16 - Math.sin(x * 0.031) * 8
      ctx.lineTo(x, y)
    }
    ctx.lineTo(W + 10, this.horizonY + 2)
    ctx.closePath()
    ctx.fill()

    // 水面
    const wg = ctx.createLinearGradient(0, this.horizonY, 0, H)
    wg.addColorStop(0, sky.waterC)
    wg.addColorStop(1, hexLerp('#0d2836', '#060d18', sky.dark))
    ctx.fillStyle = wg
    ctx.fillRect(-10, this.horizonY, W + 20, H - this.horizonY + 10)

    // 波光
    ctx.save()
    for (let i = 0; i < 26; i++) {
      const depth = i / 26
      const y = lerp(this.horizonY + 6, H * 0.97, depth ** 1.4)
      const amp = lerp(2, 9, depth)
      const segW = lerp(14, 90, depth)
      ctx.globalAlpha = lerp(0.05, 0.16, depth) * (1 - sky.dark * 0.6)
      ctx.strokeStyle = '#cfeaf5'
      ctx.lineWidth = lerp(1, 2.5, depth)
      ctx.beginPath()
      for (let x = -20; x < W + 20; x += segW * 2.4) {
        const ox = Math.sin(this.time * 1.4 + i * 1.7 + x * 0.01) * amp
        ctx.moveTo(x + ox, y + Math.sin(this.time * 2 + x * 0.02 + i) * amp * 0.4)
        ctx.lineTo(x + segW + ox, y + Math.sin(this.time * 2 + (x + segW) * 0.02 + i) * amp * 0.4)
      }
      ctx.stroke()
    }
    ctx.restore()

    // 鱼影
    for (const s of this.shadows) {
      const p = this.shadowScreen(s)
      ctx.save()
      ctx.globalAlpha = 0.28
      ctx.fillStyle = '#0a2030'
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, 26 * p.scale * s.size, 8 * p.scale * s.size, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // 涟漪
    for (const r of this.ripples) {
      ctx.save()
      ctx.globalAlpha = r.alpha * 0.5
      ctx.strokeStyle = '#dff2fa'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.32, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    // 抛竿飞行中的浮漂 / 水中的浮漂
    if (this.state === 'casting') {
      const bp = this.bobScreen()
      const t = this.castT
      const target = this.castTarget
      const endX = W * 0.5 + target.lat * lerp(W * 0.32, W * 0.07, target.d)
      const endY = lerp(H * 0.9, this.horizonY + 10, 1 - (1 - target.d) ** 1.6)
      const x = lerp(this.castFrom.x, endX, t)
      const y = lerp(this.castFrom.y, endY, t) - Math.sin(t * Math.PI) * H * 0.22
      this.drawBobber(x, y, lerp(1.4, lerp(1.6, 0.45, target.d), t), 0)
      this.drawLine(this.rodTip(), { x, y }, 0.4)
      void bp
    } else if (this.bob.out && this.state !== 'leaping' && this.state !== 'result') {
      const bp = this.bobScreen()
      const tip = this.rodTip()
      const slack = this.state === 'reeling' ? 1 - this.tension : 0.55
      this.drawLine(tip, { x: bp.x, y: bp.y + this.bob.dip }, slack)
      this.drawBobber(bp.x, bp.y + this.bob.dip, bp.scale, this.state === 'bite' ? 1 : 0)
    }

    // 鱼竿（第一人称，从右下角伸入）
    this.drawRod()

    // 起鱼动画
    if (this.state === 'leaping' && this.current) {
      this.drawLeap()
    }

    // 粒子
    for (const p of this.particles) {
      ctx.save()
      ctx.globalAlpha = 1 - p.life / p.maxLife
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // HUD
    this.drawHUD()
  }

  private shadowScreen(s: Shadow) {
    const y = lerp(this.H * 0.9, this.horizonY + 10, 1 - (1 - s.d) ** 1.6)
    const x = this.W * 0.5 + s.lat * lerp(this.W * 0.32, this.W * 0.07, s.d)
    const scale = lerp(1.6, 0.45, s.d)
    return { x, y, scale }
  }

  private drawBobber(x: number, y: number, s: number, plunged: number) {
    const { ctx } = this
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    // 水中倒影
    ctx.globalAlpha = 0.25
    ctx.fillStyle = '#06222e'
    ctx.beginPath(); ctx.ellipse(0, 4, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    // 漂身
    ctx.fillStyle = '#e33f2f'
    ctx.beginPath(); ctx.arc(0, -2 - plunged * -2, 5, Math.PI, 0); ctx.fill()
    ctx.fillStyle = '#f5f0e6'
    ctx.beginPath(); ctx.arc(0, -2, 5, 0, Math.PI); ctx.fill()
    // 漂尾
    ctx.strokeStyle = '#e33f2f'
    ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, -13 - plunged * 4); ctx.stroke()
    ctx.restore()
  }

  private drawLine(tip: { x: number; y: number }, end: { x: number; y: number }, slack: number) {
    const { ctx } = this
    const midX = (tip.x + end.x) / 2
    const midY = (tip.y + end.y) / 2 + slack * 60
    ctx.save()
    ctx.strokeStyle = 'rgba(240,248,255,0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.quadraticCurveTo(midX, midY, end.x, end.y)
    ctx.stroke()
    ctx.restore()
  }

  private drawRod() {
    const { ctx, H } = this
    const tip = this.rodTip()
    const baseX = tip.baseX
    const baseY = H * 1.04
    // 握把
    ctx.save()
    ctx.lineCap = 'round'
    const midX = lerp(baseX, tip.x, 0.45)
    const midY = lerp(baseY, tip.y, 0.45) + 14
    ctx.strokeStyle = '#5a3a22'
    ctx.lineWidth = 11
    ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(midX, midY); ctx.stroke()
    ctx.strokeStyle = '#8a5a30'
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(tip.x, tip.y); ctx.stroke()
    // 渔轮
    ctx.fillStyle = '#333c48'
    ctx.beginPath(); ctx.arc(baseX - 14, baseY - 34, 12, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#c0c8d4'
    ctx.beginPath(); ctx.arc(baseX - 14, baseY - 34, 6, 0, Math.PI * 2); ctx.fill()
    // 收线时渔轮转
    if (this.state === 'reeling' && this.pressed) {
      ctx.strokeStyle = '#e8eef5'
      ctx.lineWidth = 2
      const a = this.time * 20
      ctx.beginPath()
      ctx.moveTo(baseX - 14, baseY - 34)
      ctx.lineTo(baseX - 14 + Math.cos(a) * 14, baseY - 34 + Math.sin(a) * 14)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawLeap() {
    const { ctx, W, H } = this
    const c = this.current
    if (!c) return
    const bp = this.bobScreen()
    const t = this.leapT
    const startX = bp.x
    const startY = bp.y
    const endX = W * 0.42
    const endY = H * 0.55
    const x = lerp(startX, endX, t)
    const y = lerp(startY, endY, t) - Math.sin(t * Math.PI) * H * 0.3
    const s = lerp(bp.scale, 3.2, t) * (1 - t * 0.25)
    const rot = Math.sin(t * Math.PI * 2) * 0.6
    if (c.isJunk) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.font = `${Math.round(40 * s)}px serif`
      ctx.textAlign = 'center'
      const emoji = c.junkName === '破靴子' ? '🥾' : c.junkName === '易拉罐' ? '🥫' : c.junkName === '小虾米' ? '🦐' : '🌿'
      ctx.fillText(emoji, 0, 0)
      ctx.restore()
    } else if (c.species) {
      this.drawFish(x, y, s, rot, c.species.color)
    }
    if (Math.random() < 0.3) this.spawnSplash(x, y + 20 * s, 1, 0.3)
  }

  private drawFish(x: number, y: number, s: number, rot: number, color: string) {
    const { ctx } = this
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot + Math.sin(this.time * 18) * 0.12)
    ctx.scale(s, s)
    // 身体
    ctx.fillStyle = color
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2); ctx.fill()
    // 尾巴
    ctx.beginPath()
    ctx.moveTo(-20, 0)
    ctx.lineTo(-32, -9)
    ctx.lineTo(-32, 9)
    ctx.closePath()
    ctx.fill()
    // 肚皮
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.beginPath(); ctx.ellipse(2, 4, 15, 5, 0, 0, Math.PI * 2); ctx.fill()
    // 眼睛
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(13, -3, 3.2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#14202c'
    ctx.beginPath(); ctx.arc(14, -3, 1.6, 0, Math.PI * 2); ctx.fill()
    // 鳃
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(8, 0, 6, -1.2, 1.2); ctx.stroke()
    ctx.restore()
  }

  // ---------------- HUD ----------------
  private drawHUD() {
    const { ctx, W, H } = this
    ctx.save()
    ctx.textAlign = 'center'

    // 时钟（游戏内时间）
    const mins = Math.floor(this.dayT * 24 * 60)
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.textAlign = 'left'
    const duskNote = skyAt(this.dayT).dark > 0.4 ? ' · 夜晚稀有鱼活跃' : ''
    ctx.fillText(`🕐 ${hh}:${mm}${duskNote}`, 16, H - 16)

    ctx.textAlign = 'center'
    // 底部操作提示
    ctx.font = '500 15px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    const hints: Partial<Record<GameState, string>> = {
      idle: '长按 鼠标/空格 蓄力，松开抛竿',
      waiting: this.nibbled ? '……好像有动静？' : '等待鱼儿上钩…',
      reeling: '按住收线 · 张力进红区就松手！',
    }
    const hint = hints[this.state]
    if (hint && this.state !== 'charging') {
      ctx.fillText(hint, W / 2, H - 22)
    }

    // 蓄力条
    if (this.state === 'charging') {
      const bw = 220
      const x = W / 2 - bw / 2
      const y = H - 60
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fillRect(x - 2, y - 2, bw + 4, 16)
      const grad = ctx.createLinearGradient(x, 0, x + bw, 0)
      grad.addColorStop(0, '#6fd66f')
      grad.addColorStop(1, '#f5b83d')
      ctx.fillStyle = grad
      ctx.fillRect(x, y, bw * this.charge, 12)
      ctx.fillStyle = '#fff'
      ctx.font = '600 13px system-ui, sans-serif'
      ctx.fillText('松开抛竿！', W / 2, y - 8)
    }

    // 咬钩警告
    if (this.state === 'bite') {
      const flash = Math.sin(this.time * 18) > 0 ? 1 : 0.75
      ctx.save()
      ctx.globalAlpha = flash
      ctx.font = '800 34px system-ui, sans-serif'
      ctx.fillStyle = '#ff4d3d'
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'
      ctx.lineWidth = 5
      ctx.strokeText('❗ 咬钩了！快拉杆！', W / 2, H * 0.3)
      ctx.fillText('❗ 咬钩了！快拉杆！', W / 2, H * 0.3)
      ctx.restore()
    }

    // 遛鱼仪表
    if (this.state === 'reeling') {
      const bw = Math.min(420, W * 0.5)
      const x = W / 2 - bw / 2
      const y = H - 70
      // 张力条
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(x - 3, y - 3, bw + 6, 22)
      // 安全区
      ctx.fillStyle = 'rgba(110,214,110,0.35)'
      ctx.fillRect(x + bw * 0.22, y, bw * (0.85 - 0.22), 16)
      // 危险区
      ctx.fillStyle = 'rgba(255,80,60,0.35)'
      ctx.fillRect(x + bw * 0.85, y, bw * 0.15, 16)
      // 指针
      const tx = x + bw * clamp(this.tension, 0, 1)
      ctx.fillStyle = this.tension > 0.85 ? '#ff5040' : this.tension < 0.22 ? '#f5d13d' : '#ffffff'
      ctx.fillRect(tx - 3, y - 4, 6, 24)
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.textAlign = 'left'
      ctx.fillText('张力', x, y - 8)
      // 收线进度
      const py = y - 26
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(x - 3, py - 3, bw + 6, 12)
      ctx.fillStyle = '#5ac8fa'
      ctx.fillRect(x, py, bw * this.reelProgress, 6)
      ctx.textAlign = 'center'
    }

    // 中央消息
    if (this.msgT > 0 && this.msg) {
      ctx.save()
      ctx.globalAlpha = clamp(this.msgT, 0, 1)
      ctx.font = '700 24px system-ui, sans-serif'
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.lineWidth = 5
      ctx.strokeText(this.msg, W / 2, H * 0.36)
      ctx.fillStyle = '#ffe9a8'
      ctx.fillText(this.msg, W / 2, H * 0.36)
      ctx.restore()
    }

    ctx.restore()
  }
}
