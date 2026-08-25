// 元游戏经济层：灵玉、鱼饵库存、地点解锁、渔篓。状态存 localStorage。
import { BAIT_BY_ID, LOCATION_BY_ID } from './content'

export interface CatchInstance {
  instanceId: string
  fishId: string
  size: number
  value: number
}

export interface EconomyState {
  money: number
  bait: Record<string, number>
  locationId: string
  unlocked: string[]
  bag: CatchInstance[]
  nextInst: number
  lastReliefDate: string
}

const KEY = 'fishing-economy'
export const ECONOMY_KEY = KEY

export const STARTER: EconomyState = {
  money: 200,
  bait: { basic_worm: 5 },
  locationId: 'moonlit_pond',
  unlocked: ['moonlit_pond', 'reed_river'],
  bag: [],
  nextInst: 1,
  lastReliefDate: '',
}

export function loadEconomy(): EconomyState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...STARTER, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { ...STARTER }
}

export function saveEconomy(s: EconomyState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export function baitCount(s: EconomyState, baitId: string): number {
  return s.bait[baitId] ?? 0
}

export function totalBait(s: EconomyState): number {
  return Object.values(s.bait).reduce((a, b) => a + b, 0)
}

export function hasBait(s: EconomyState, baitId: string): boolean {
  return baitCount(s, baitId) > 0
}

/** 买饵：扣钱、加库存。返回新状态与结果信息。 */
export function buyBait(s: EconomyState, baitId: string, qty: number): { state: EconomyState; ok: boolean; msg: string } {
  const bait = BAIT_BY_ID[baitId]
  if (!bait) return { state: s, ok: false, msg: '没有这种鱼饵' }
  qty = Math.max(1, qty)
  const cost = bait.cost * qty
  if (s.money < cost) return { state: s, ok: false, msg: `灵玉不够，需 ${cost}` }
  const next: EconomyState = {
    ...s,
    money: s.money - cost,
    bait: { ...s.bait, [baitId]: baitCount(s, baitId) + qty },
  }
  return { state: next, ok: true, msg: `买了 ${bait.name}×${qty}，花 ${cost} 灵玉` }
}

/** 解锁/前往地点：未解锁则扣 unlockCost，已解锁免费切换。 */
export function gotoLocation(s: EconomyState, locId: string): { state: EconomyState; ok: boolean; msg: string } {
  const loc = LOCATION_BY_ID[locId]
  if (!loc) return { state: s, ok: false, msg: '没有这个钓点' }
  if (s.unlocked.includes(locId)) {
    return { state: { ...s, locationId: locId }, ok: true, msg: `来到 ${loc.name}` }
  }
  if (s.money < loc.unlockCost) {
    return { state: s, ok: false, msg: `解锁需 ${loc.unlockCost} 灵玉，你只有 ${s.money}` }
  }
  return {
    state: { ...s, money: s.money - loc.unlockCost, unlocked: [...s.unlocked, locId], locationId: locId },
    ok: true,
    msg: `解锁并来到 ${loc.name}`,
  }
}

/** 消耗 1 个指定饵（调用前确认有货）。 */
export function consumeBait(s: EconomyState, baitId: string): EconomyState {
  const n = baitCount(s, baitId)
  if (n <= 0) return s
  return { ...s, bait: { ...s.bait, [baitId]: n - 1 } }
}

/** 钓获入袋。 */
export function addCatch(s: EconomyState, fishId: string, size: number, value: number): EconomyState {
  const inst: CatchInstance = {
    instanceId: `c_${s.nextInst}`,
    fishId,
    size: Math.round(size * 100) / 100,
    value,
  }
  return { ...s, bag: [...s.bag, inst], nextInst: s.nextInst + 1 }
}

/** 卖鱼：全部进账，清空渔篓。 */
export function sellAll(s: EconomyState): { state: EconomyState; gained: number } {
  const gained = s.bag.reduce((a, c) => a + c.value, 0)
  return { state: { ...s, money: s.money + gained, bag: [] }, gained }
}

/** 破产救济：灵玉低于最便宜饵价且没有任何饵时，给一次小额（每日一次）。 */
export function cheapestBaitCost(): number {
  return Math.min(...Object.values(BAIT_BY_ID).map((b) => b.cost))
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function reliefIfBroke(s: EconomyState): { state: EconomyState; granted: number } {
  if (totalBait(s) > 0 || s.money >= cheapestBaitCost()) return { state: s, granted: 0 }
  if (s.lastReliefDate === todayStr()) return { state: s, granted: 0 }
  return { state: { ...s, money: s.money + 50, lastReliefDate: todayStr() }, granted: 50 }
}
