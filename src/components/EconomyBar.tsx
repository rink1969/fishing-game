// 元游戏经济 UI：顶栏灵玉/地点/饵 + 钓点、商店、渔篓三个面板。
import { useState } from 'react'
import { LOCATIONS, BAITS, FISH_BY_ID, BAIT_BY_ID } from '../game/content'
import { type EconomyState, baitCount } from '../game/economy'
import { rarityLabel } from '../game/engine'

interface Props {
  economy: EconomyState
  selectedBait: string
  onSelectBait: (id: string) => void
  onBuy: (id: string, qty: number) => void
  onGoto: (id: string) => void
  onSell: () => void
}

type Panel = 'none' | 'loc' | 'shop' | 'bag'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div data-ui className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[85vh] w-[440px] max-w-[92vw] overflow-y-auto rounded-2xl border border-white/15 bg-stone-900/95 p-5 text-stone-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-stone-400 hover:bg-white/10 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function EconomyBar({ economy, selectedBait, onSelectBait, onBuy, onGoto, onSell }: Props) {
  const [panel, setPanel] = useState<Panel>('none')
  const locName = LOCATIONS.find((l) => l.id === economy.locationId)?.name ?? economy.locationId
  const bagValue = economy.bag.reduce((a, c) => a + c.value, 0)
  const ownedBaits = BAITS.filter((b) => baitCount(economy, b.id) > 0)

  return (
    <>
      {/* 顶栏：灵玉 / 地点 / 当前饵 */}
      <div data-ui className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-xl bg-black/40 px-4 py-1.5 text-center text-white backdrop-blur">
        <span className="text-[14px] font-bold">💰 {economy.money}</span>
        <span className="mx-2 text-white/40">|</span>
        <span className="text-[13px]">📍 {locName}</span>
        <span className="mx-2 text-white/40">|</span>
        <span className="text-[13px]">🪱 {BAIT_BY_ID[selectedBait]?.name ?? '—'} ×{baitCount(economy, selectedBait)}</span>
      </div>

      {/* 右侧竖直菜单 */}
      <div data-ui className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-end gap-2">
        {/* 饵选择 */}
        <div className="flex max-w-[190px] flex-wrap justify-end gap-1 rounded-xl bg-black/40 px-2 py-1.5 backdrop-blur">
          {ownedBaits.length === 0 && <span className="px-1 text-[12px] text-red-300">无饵</span>}
          {ownedBaits.map((b) => (
            <button
              key={b.id}
              onClick={() => onSelectBait(b.id)}
              className={`rounded-lg px-2 py-1 text-[12px] font-medium transition ${
                b.id === selectedBait ? 'bg-amber-400 text-stone-900' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {b.name} ×{baitCount(economy, b.id)}
            </button>
          ))}
        </div>
        <button onClick={() => setPanel('loc')} className="w-[120px] rounded-xl bg-white/10 px-3 py-2 text-[13px] text-white backdrop-blur hover:bg-white/20">📍 钓点</button>
        <button onClick={() => setPanel('shop')} className="w-[120px] rounded-xl bg-white/10 px-3 py-2 text-[13px] text-white backdrop-blur hover:bg-white/20">🛒 商店</button>
        <button onClick={() => setPanel('bag')} className="relative w-[120px] rounded-xl bg-white/10 px-3 py-2 text-[13px] text-white backdrop-blur hover:bg-white/20">
          🎒 渔篓{bagValue > 0 && <span className="ml-1 rounded-full bg-amber-400/90 px-1.5 text-[11px] font-bold text-stone-900">+{bagValue}</span>}
        </button>
      </div>

      {panel === 'loc' && (
        <Modal title="📍 钓点" onClose={() => setPanel('none')}>
          <div className="space-y-2">
            {LOCATIONS.map((l) => {
              const unlocked = economy.unlocked.includes(l.id)
              const current = economy.locationId === l.id
              const canAfford = economy.money >= l.unlockCost
              return (
                <div key={l.id} className="rounded-xl bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{l.name}</div>
                    {current ? (
                      <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[12px] text-emerald-300">当前</span>
                    ) : unlocked ? (
                      <button onClick={() => { onGoto(l.id); setPanel('none') }} className="rounded-lg bg-amber-400 px-3 py-1 text-[12px] font-bold text-stone-900 hover:bg-amber-300">前往</button>
                    ) : (
                      <button
                        disabled={!canAfford}
                        onClick={() => { onGoto(l.id); setPanel('none') }}
                        className={`rounded-lg px-3 py-1 text-[12px] font-bold ${canAfford ? 'bg-amber-400 text-stone-900 hover:bg-amber-300' : 'bg-white/10 text-stone-400'}`}
                      >
                        解锁 {l.unlockCost}
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-[12px] leading-snug text-white/70">{l.description}</div>
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {panel === 'shop' && (
        <Modal title="🛒 鱼饵商店" onClose={() => setPanel('none')}>
          <div className="space-y-2">
            {BAITS.map((b) => {
              const afford = economy.money >= b.cost
              const eff: string[] = []
              if (b.effects.rarityMult) eff.push('稀有度加成')
              if (b.effects.tagMult) eff.push('标签偏好')
              if (b.effects.junkMult) eff.push(`杂物×${b.effects.junkMult}`)
              return (
                <div key={b.id} className="rounded-xl bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{b.name} <span className="text-amber-300">· {b.cost} 灵玉</span></div>
                    <button
                      disabled={!afford}
                      onClick={() => onBuy(b.id, 1)}
                      className={`rounded-lg px-3 py-1 text-[12px] font-bold ${afford ? 'bg-amber-400 text-stone-900 hover:bg-amber-300' : 'bg-white/10 text-stone-400'}`}
                    >
                      购买
                    </button>
                  </div>
                  <div className="mt-1 text-[12px] leading-snug text-white/70">{b.description}</div>
                  <div className="mt-1 text-[12px] text-white/60">已拥有 ×{baitCount(economy, b.id)}</div>
                  {eff.length > 0 && <div className="mt-1 text-[11px] text-sky-300/80">效果：{eff.join('、')}</div>}
                </div>
              )
            })}
            <div className="text-[12px] text-white/50">提示：好饵能提高稀有鱼上钩率、减少杂物。</div>
          </div>
        </Modal>
      )}

      {panel === 'bag' && (
        <Modal title="🎒 渔篓" onClose={() => setPanel('none')}>
          {economy.bag.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-white/50">渔篓空空，去钓几竿吧～</div>
          ) : (
            <div className="space-y-2">
              {Object.entries(
                economy.bag.reduce<Record<string, { count: number; value: number }>>((acc, c) => {
                  const key = c.fishId
                  if (!acc[key]) acc[key] = { count: 0, value: 0 }
                  acc[key].count += 1
                  acc[key].value += c.value
                  return acc
                }, {}),
              ).map(([fid, info]) => {
                const f = FISH_BY_ID[fid]
                return (
                  <div key={fid} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <div>
                      <span className="font-semibold" style={{ color: f?.color }}>{f?.name ?? fid}</span>
                      <span className="ml-2 text-[12px] text-white/60">{rarityLabel(f?.tier ?? 1)} ×{info.count}</span>
                    </div>
                    <span className="text-[13px] text-amber-300">+{info.value}</span>
                  </div>
                )
              })}
              <button
                onClick={() => { onSell(); setPanel('none') }}
                className="mt-2 w-full rounded-xl bg-amber-400 py-2.5 font-bold text-stone-900 transition hover:bg-amber-300"
              >
                全部卖出 · 换 {bagValue} 灵玉
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
