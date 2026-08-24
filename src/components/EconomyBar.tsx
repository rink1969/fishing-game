// 元游戏经济 UI：顶栏灵玉/地点/饵 + 钓点、商店、渔篓三个面板。（寻霖塘国风皮肤）
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
    <div data-ui className="tang-veil absolute inset-0 z-30 flex items-center justify-center" onClick={onClose}>
      <div
        className="tang-panel tang-scroll max-h-[85vh] w-[440px] max-w-[92vw] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="tang-title-cream text-xl">{title}</h2>
          <button onClick={onClose} className="tang-btn rounded-lg px-2.5 py-1 text-sm">✕</button>
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
      <div data-ui className="tang-pill absolute left-1/2 top-3 z-20 -translate-x-1/2 px-5 py-1.5 text-center">
        <span className="text-[14px] font-bold text-[#f0cb73]">💰 {economy.money}</span>
        <span className="mx-2.5 text-[#c9a86f]/50">|</span>
        <span className="text-[13px]">📍 {locName}</span>
        <span className="mx-2.5 text-[#c9a86f]/50">|</span>
        <span className="text-[13px]">🪱 {BAIT_BY_ID[selectedBait]?.name ?? '—'} ×{baitCount(economy, selectedBait)}</span>
      </div>

      {/* 右侧竖直菜单 */}
      <div data-ui className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-end gap-2">
        {/* 饵选择 */}
        <div className="tang-panel flex max-w-[190px] flex-wrap justify-end gap-1 !rounded-xl px-2 py-1.5">
          {ownedBaits.length === 0 && <span className="px-1 text-[12px] text-red-300">无饵</span>}
          {ownedBaits.map((b) => (
            <button
              key={b.id}
              onClick={() => onSelectBait(b.id)}
              className={`rounded-lg px-2 py-1 text-[12px] font-medium transition ${
                b.id === selectedBait
                  ? 'tang-btn-gold'
                  : 'border border-[#c9a86f]/40 bg-[#f8efd8]/8 text-[#f8efd8]/85 hover:bg-[#f8efd8]/15'
              }`}
            >
              {b.name} ×{baitCount(economy, b.id)}
            </button>
          ))}
        </div>
        <button onClick={() => setPanel('loc')} className="tang-btn w-[120px] px-3 py-2 text-[13px]">📍 钓点</button>
        <button onClick={() => setPanel('shop')} className="tang-btn w-[120px] px-3 py-2 text-[13px]">🛒 商店</button>
        <button onClick={() => setPanel('bag')} className="tang-btn relative w-[120px] px-3 py-2 text-[13px]">
          🎒 渔篓{bagValue > 0 && <span className="tang-chip-gold ml-1 px-1.5 text-[11px]">+{bagValue}</span>}
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
                <div key={l.id} className="tang-item-dark p-3">
                  <div className="flex items-center justify-between">
                    <div className="tang-title-cream text-[16px]">{l.name}</div>
                    {current ? (
                      <span className="rounded-full border border-[#4e7f73] bg-[#4e7f73]/25 px-2 py-0.5 text-[12px] text-[#a8d5c5]">当前</span>
                    ) : unlocked ? (
                      <button onClick={() => { onGoto(l.id); setPanel('none') }} className="tang-btn-gold px-3 py-1 text-[12px]">前往</button>
                    ) : (
                      <button
                        disabled={!canAfford}
                        onClick={() => { onGoto(l.id); setPanel('none') }}
                        className={`px-3 py-1 text-[12px] ${canAfford ? 'tang-btn-gold' : 'tang-btn'}`}
                      >
                        解锁 {l.unlockCost}
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-[12px] leading-snug text-[#f8efd8]/65">{l.description}</div>
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
                <div key={b.id} className="tang-item-dark p-3">
                  <div className="flex items-center justify-between">
                    <div className="tang-title-cream text-[16px]">{b.name} <span className="text-[#f0cb73]">· {b.cost} 灵玉</span></div>
                    <button
                      disabled={!afford}
                      onClick={() => onBuy(b.id, 1)}
                      className={`px-3 py-1 text-[12px] ${afford ? 'tang-btn-gold' : 'tang-btn'}`}
                    >
                      购买
                    </button>
                  </div>
                  <div className="mt-1 text-[12px] leading-snug text-[#f8efd8]/65">{b.description}</div>
                  <div className="mt-1 text-[12px] text-[#f8efd8]/55">已拥有 ×{baitCount(economy, b.id)}</div>
                  {eff.length > 0 && <div className="mt-1 text-[11px] text-[#a8d5c5]/80">效果：{eff.join('、')}</div>}
                </div>
              )
            })}
            <div className="text-[12px] text-[#f8efd8]/45">提示：好饵能提高稀有鱼上钩率、减少杂物。</div>
          </div>
        </Modal>
      )}

      {panel === 'bag' && (
        <Modal title="🎒 渔篓" onClose={() => setPanel('none')}>
          {economy.bag.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-[#f8efd8]/45">渔篓空空，去钓几竿吧～</div>
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
                  <div key={fid} className="tang-item-dark flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="font-semibold text-[#f8efd8]">{f?.name ?? fid}</span>
                      <span className="ml-2 text-[12px] text-[#f8efd8]/55">{rarityLabel(f?.tier ?? 1)} ×{info.count}</span>
                    </div>
                    <span className="text-[13px] text-[#f0cb73]">+{info.value}</span>
                  </div>
                )
              })}
              <button
                onClick={() => { onSell(); setPanel('none') }}
                className="tang-btn-gold mt-2 w-full py-2.5"
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
