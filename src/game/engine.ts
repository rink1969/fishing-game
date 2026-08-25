// ============================================================
// 钓鱼大师 · 第一人称钓鱼游戏引擎（Canvas 2D，单机）
// 状态机: idle → charging → casting → waiting → bite → reeling
//         → leaping → result → idle
// ============================================================

import { FISH, LOCATIONS, LOCATION_BY_ID, BAIT_BY_ID, JUNK_ITEMS, FIGHT_BY_RARITY, type FishDef, type LocationDef, type BaitDef } from './content'

const TIER_EMOJI: Record<number, string> = { 1: '🐟', 2: '🐠', 3: '🐡', 4: '🦈', 5: '👑', 6: '🌟' }
const RARITY_BASE: Record<number, number> = { 1: 1000, 2: 350, 3: 90, 4: 22, 5: 5, 6: 1 }

/** 资源路径统一走相对路径（base 是 './'），兼容 dev / file:// 双击 / GitHub Pages 子路径 */
export function assetUrl(p: string): string {
  const base = import.meta.env.BASE_URL || './'
  return `${base}assets/${p}`
}

const fishImgCache = new Map<string, HTMLImageElement>()
function getFishImg(url: string): HTMLImageElement {
  let el = fishImgCache.get(url)
  if (!el) { el = new Image(); el.src = url; fishImgCache.set(url, el) }
  return el
}

/** 重量展示：不足 1 公斤用克，否则公斤 */
export function formatWeight(kg: number): string {
  if (kg < 1) return `${Math.round(kg * 1000)} g`
  return `${kg.toFixed(kg < 10 ? 2 : 1)} kg`
}
/** 图片真正可用：加载完成且没挂（404 时 complete 也是 true，必须再看 naturalWidth） */
function imgReady(el: HTMLImageElement | null): el is HTMLImageElement {
  return !!el && el.complete && el.naturalWidth > 0
}

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
  rarity: number // 1普通 2少见 3稀有 4史诗 5传说 6神话
  fight: number // 挣扎强度
  color: string
  chance: number // 基础权重
  tier: number
  img?: string
}

export interface CatchResult {
  species: FishSpecies | null
  junkName: string | null
  weight: number // 重量(kg)，junk 为 0
  isJunk: boolean
  value: number // 售价(灵玉)
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

// 鱼种数据已迁移至 ./content.ts（FISH），按地点 + 饵加权抽取。

// JUNK_ITEMS 现从 ./content 导入

const RARITY_LABEL: Record<number, string> = { 1: '普通', 2: '少见', 3: '稀有', 4: '史诗', 5: '传说', 6: '神话' }
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
  private paused = false
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
  private particles: Particle[] = []
  private ripples: Ripple[] = []
  private shadows: Shadow[] = []
  private clouds: Cloud[] = []
  private msg = '' // 中央提示
  private msgT = 0
  private shake = 0

  private ro: ResizeObserver | null = null
  private detachInput: (() => void) | null = null

  // 经济层（由 App 注入）：当前地点 / 饵 / 抛竿闸门 / 地点背景
  private locationId = 'moonlit_pond'
  private baitId = 'basic_worm'
  beforeCast: () => boolean = () => true
  private bgImg: HTMLImageElement | null = null

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
  private preloadFish() {
    for (const f of FISH) {
      if (f.img) getFishImg(assetUrl(f.img))
    }
    for (const l of LOCATIONS) {
      if (l.bg) getFishImg(assetUrl(l.bg))
    }
  }
  start() {
    if (this.running) return
    this.running = true
    this.preloadFish()
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
  /** 暂停/恢复（设置面板打开时用）：冻结状态机并屏蔽输入，画面保持最后一帧 */
  setPaused(p: boolean) { this.paused = p }
  setLocation(id: string) {
    this.locationId = id
    const loc = LOCATION_BY_ID[id]
    this.bgImg = loc?.bg ? getFishImg(assetUrl(loc.bg)) : null
  }
  setBait(id: string) { this.baitId = id }
  getState() { return this.state }
  getStateTime() { return this.stateT }
  /** 当前游戏内环境信息（供 AI 生成有梗台词）：固定场景，报当前钓点 */
  getEnv() {
    const name = LOCATION_BY_ID[this.locationId]?.name ?? ''
    return { clock: '', phase: name ? `在钓点「${name}」` : '' }
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
      if ((e.target as HTMLElement | null)?.closest('[data-ui]')) return
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
    if (this.paused) return
    if (this.pressed) return
    if (this.state === 'idle' && !this.beforeCast()) return
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
    if (this.paused) return
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

  private effWeight(f: FishDef, loc: LocationDef | undefined, bait: BaitDef | undefined): number {
    let w = RARITY_BASE[f.tier]
    for (const tag of f.tags) {
      w *= loc?.tagMult?.[tag] ?? 1
      w *= bait?.effects?.tagMult?.[tag] ?? 1
    }
    w *= bait?.effects?.rarityMult?.[f.rarity] ?? 1
    return w
  }

  private rollCatch(): CatchResult {
    const loc = LOCATION_BY_ID[this.locationId]
    const bait = BAIT_BY_ID[this.baitId]
    const junkChance = (loc?.junkChance ?? 0.1) * (bait?.effects?.junkMult ?? 1)
    if (Math.random() < junkChance) {
      return { species: null, junkName: JUNK_ITEMS[Math.floor(Math.random() * JUNK_ITEMS.length)], weight: 0, isJunk: true, value: 0 }
    }
    const pool = FISH.filter((f) => f.locations.includes('all') || f.locations.includes(this.locationId))
    if (pool.length === 0) {
      return { species: null, junkName: '水草团', weight: 0, isJunk: true, value: 0 }
    }
    const weights = pool.map((f) => this.effWeight(f, loc, bait))
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    let sp = pool[0]
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]
      if (r <= 0) { sp = pool[i]; break }
    }
    const skew = sp.tier >= 3 ? Math.random() * Math.random() : Math.random() ** 2
    const size = Math.round((sp.minW + (sp.maxW - sp.minW) * skew) * 1000) / 1000
    return {
      species: {
        id: sp.id,
        name: sp.name,
        emoji: TIER_EMOJI[sp.tier] ?? '🐟',
        minW: sp.minW,
        maxW: sp.maxW,
        rarity: sp.tier,
        fight: FIGHT_BY_RARITY[sp.rarity] ?? 0.8,
        color: sp.color,
        chance: 1,
        tier: sp.tier,
        img: sp.img,
      },
      junkName: null,
      weight: size,
      isJunk: false,
      value: sp.value,
    }
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
    if (this.paused) return
    this.time += dt
    this.stateT += dt
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
    const locDef = LOCATION_BY_ID[this.locationId]
    // 直接以当前钓点解析背景图（不缓存一次性状态，每帧检查 complete，与鱼图一致）
    if (locDef?.bg) {
      const want = getFishImg(assetUrl(locDef.bg))
      if (want !== this.bgImg) this.bgImg = want
    } else {
      this.bgImg = null
    }
    const bgEl = this.bgImg
    const useBg = imgReady(bgEl)
    if (useBg) {
      // 固定场景：直接用钓点背景图，不做任何压暗
      ctx.drawImage(bgEl, 0, 0, W, H)
    } else {
      // 无背景图的钓点：整屏单一固定渐变兜底（不划分天空/水面）
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, locDef?.skyTop ?? '#1b2a4a')
      g.addColorStop(1, locDef?.water ?? '#13314a')
      ctx.fillStyle = g
      ctx.fillRect(-10, -10, W + 20, H + 20)
    } // end !useBg

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
      const url = c.species.img ? assetUrl(c.species.img) : null
      const el = url ? getFishImg(url) : null
      if (el && imgReady(el)) {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.scale(s, s)
        ctx.drawImage(el, -22, -11, 44, 22)
        ctx.restore()
      } else {
        this.drawFish(x, y, s, rot, c.species.color)
      }
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

    // 底部操作提示
    ctx.font = '500 15px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(248,239,216,0.92)'
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
      grad.addColorStop(0, '#6aa191')
      grad.addColorStop(1, '#e9c46a')
      ctx.fillStyle = grad
      ctx.fillRect(x, y, bw * this.charge, 12)
      ctx.fillStyle = '#f8efd8'
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
      ctx.fillStyle = 'rgba(106,161,145,0.42)'
      ctx.fillRect(x + bw * 0.22, y, bw * (0.85 - 0.22), 16)
      // 危险区
      ctx.fillStyle = 'rgba(192,91,77,0.45)'
      ctx.fillRect(x + bw * 0.85, y, bw * 0.15, 16)
      // 指针
      const tx = x + bw * clamp(this.tension, 0, 1)
      ctx.fillStyle = this.tension > 0.85 ? '#e05a4a' : this.tension < 0.22 ? '#e9c46a' : '#f8efd8'
      ctx.fillRect(tx - 3, y - 4, 6, 24)
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(248,239,216,0.85)'
      ctx.textAlign = 'left'
      ctx.fillText('张力', x, y - 8)
      // 收线进度
      const py = y - 26
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(x - 3, py - 3, bw + 6, 12)
      ctx.fillStyle = '#e9c46a'
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
