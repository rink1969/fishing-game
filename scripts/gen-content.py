import os, sys, json

ROOT = r"D:\data\luoxingzhen\fishing-game"
ENGINE_DIR = r"D:\data\luoxingzhen\rainholm-fish\server"
SRC = os.path.join(ROOT, "src", "game")
ASSETS = os.path.join(ROOT, "public", "assets")
FISH_PNG_DIR = r"D:\data\luoxingzhen\rainholm-fish\web\assets\fish"
SPOT_DIR = r"D:\data\luoxingzhen\rainholm-fish\web\assets"

sys.path.insert(0, ENGINE_DIR)
import engine as E

TIER = {"common": 1, "uncommon": 2, "rare": 3, "epic": 4, "legendary": 5, "mythic": 6}
RARITY_LABEL = {"common": "常见", "uncommon": "少见", "rare": "稀有", "epic": "史诗",
                "legendary": "传说", "mythic": "神话"}
RARITY_COLOR = {"common": "#9fb2c4", "uncommon": "#7d9b6a", "rare": "#5f7d9c",
                "epic": "#c8843c", "legendary": "#e8b830", "mythic": "#e06c5a"}
FIGHT = {"common": 0.7, "uncommon": 1.0, "rare": 1.25, "epic": 1.5, "legendary": 1.8, "mythic": 1.95}


def has_png(fid):
    return os.path.exists(os.path.join(FISH_PNG_DIR, fid + ".png"))


def spot_bg(lid):
    return "spots/" + lid + ".jpg" if os.path.exists(os.path.join(SPOT_DIR, "spot_" + lid + ".jpg")) else None


# ---- RARITY ----
rarity_ts = "export const RARITY: Record<string, { tier: number; label: string; color: string }> = {\n"
for k in E.RARITY:
    rarity_ts += f'  {k!r}: {{ tier: {TIER[k]}, label: {RARITY_LABEL[k]!r}, color: {RARITY_COLOR[k]!r} }},\n'
rarity_ts += "}\n\n"

# ---- LOCATIONS ----
# 每个钓点一套天空/水面基调色，作为无背景图时的兜底，保证切地点画面一定变化。
LOC_PALETTE = [
    ("#1b2a4a", "#3a5a8c", "#13314a"),  # moonlit_pond 月夜蓝
    ("#bfe3ff", "#7fb8e6", "#2f6f86"),  # reed_river 晨雾青
    ("#ffd9a8", "#ff9e6b", "#c75b3a"),  # mangrove_shoal 暖橙
    ("#2a1f3d", "#5b3a7a", "#241b3a"),  # whispering_mire 紫雾
    ("#0e2a33", "#1f6b73", "#0a3b44"),  # starry_delta 星河青
    ("#1a2230", "#3d4a5e", "#16222e"),  # sunken_ruins 残骸灰蓝
    ("#cfeefe", "#8fd0e8", "#3a7e9e"),  # geyser_falls 瀑流蓝
    ("#e8f4ff", "#bfd8ef", "#5a7fa6"),  # crystal_cave 冰晶白
    ("#3a0d12", "#7a1f1f", "#2a0a0a"),  # abyssal_trench 深渊红
    ("#bcd8ff", "#7fa8e6", "#3a6fae"),  # floating_lake 浮空蓝
    ("#461a0a", "#a8431a", "#5a1f0a"),  # lava_spring 熔岩橙
]
locations_ts = (
    "export interface LocationDef {\n"
    "  id: string\n  name: string\n  description: string\n"
    "  unlockCost: number\n  junkChance: number\n  tagMult: Record<string, number>\n"
    "  skyTop: string\n  skyMid: string\n  water: string\n  bg?: string\n}\n\n"
)
locations_ts += "export const LOCATIONS: LocationDef[] = [\n"
for i, (lid, l) in enumerate(E.LOCATIONS.items()):
    bg = spot_bg(lid)
    sky_top, sky_mid, water = LOC_PALETTE[i % len(LOC_PALETTE)]
    locations_ts += (
        "  {\n"
        f"    id: {lid!r},\n"
        f"    name: {l['name']!r},\n"
        f"    description: {l['description']!r},\n"
        f"    unlockCost: {l['unlock_cost']},\n"
        f"    junkChance: {l['junk_chance_base']},\n"
        f"    tagMult: {json.dumps(l.get('tag_weight_mult', {}), ensure_ascii=False)},\n"
        f"    skyTop: {sky_top!r},\n"
        f"    skyMid: {sky_mid!r},\n"
        f"    water: {water!r},\n"
        + (f"    bg: {bg!r},\n" if bg else "")
        + "  },\n"
    )
locations_ts += "]\n\nexport const LOCATION_BY_ID: Record<string, LocationDef> = Object.fromEntries(LOCATIONS.map(l => [l.id, l]))\n\n"

# ---- BAITS ----
baits_ts = (
    "export interface BaitEffects {\n"
    "  rarityMult?: Record<string, number>\n  tagMult?: Record<string, number>\n  junkMult?: number\n}\n"
    "export interface BaitDef {\n  id: string\n  name: string\n  cost: number\n  description: string\n  effects: BaitEffects\n}\n\n"
)
baits_ts += "export const BAITS: BaitDef[] = [\n"


def norm_eff(eff):
    if not eff:
        return {}
    keymap = {"rarity_weight_mult": "rarityMult", "tag_weight_mult": "tagMult", "junk_chance_mult": "junkMult"}
    return {keymap.get(k, k): v for k, v in eff.items()}


for bid, b in E.BAITS.items():
    eff = norm_eff(b.get("effects", {}) or {})
    baits_ts += (
        "  {\n"
        f"    id: {bid!r},\n"
        f"    name: {b['name']!r},\n"
        f"    cost: {b['cost']},\n"
        f"    description: {b['description']!r},\n"
        f"    effects: {json.dumps(eff, ensure_ascii=False)},\n"
        + "  },\n"
    )
baits_ts += "]\n\nexport const BAIT_BY_ID: Record<string, BaitDef> = Object.fromEntries(BAITS.map(b => [b.id, b]))\n\n"

# ---- FISH (surface only) ----
fish_ts = (
    "export interface FishDef {\n"
    "  id: string\n  name: string\n  rarity: string\n  tier: number\n  color: string\n"
    "  minW: number\n  maxW: number\n  unit: string\n  value: number\n"
    "  locations: string[]\n  tags: string[]\n  img?: string\n}\n\n"
)
fish_ts += "export const FISH: FishDef[] = [\n"
for fid, f in E.FISH.items():
    if f.get("dive"):
        continue
    img = ("fish/" + fid + ".png") if has_png(fid) else None
    r = f["rarity"]
    fish_ts += (
        "  {\n"
        f"    id: {fid!r},\n"
        f"    name: {f['name']!r},\n"
        f"    rarity: {r!r},\n"
        f"    tier: {TIER[r]},\n"
        f"    color: {RARITY_COLOR[r]!r},\n"
        f"    minW: {f['size_min']},\n"
        f"    maxW: {f['size_max']},\n"
        f"    unit: {f.get('size_unit', 'cm')!r},\n"
        f"    value: {f['base_value']},\n"
        f"    locations: {json.dumps(f.get('locations', []), ensure_ascii=False)},\n"
        f"    tags: {json.dumps(f.get('tags', []), ensure_ascii=False)},\n"
        + (f"    img: {img!r},\n" if img else "")
        + "  },\n"
    )
fish_ts += "]\n\nexport const FISH_BY_ID: Record<string, FishDef> = Object.fromEntries(FISH.map(f => [f.id, f]))\n"
fish_ts += "\nexport const FIGHT_BY_RARITY: Record<string, number> = " + json.dumps(FIGHT, ensure_ascii=False) + "\n"
fish_ts += "\nexport const JUNK_ITEMS = ['破靴子', '水草团', '小虾米', '易拉罐', '烂渔网']\n"

out = os.path.join(SRC, "content.ts")
with open(out, "w", encoding="utf-8") as fh:
    fh.write("// AUTO-GENERATED from rainholm-fish/server/engine.py (surface fish / locations / baits only).\n"
             "// Regenerate with: python scripts/gen-content.py\n\n"
             + rarity_ts + locations_ts + baits_ts + fish_ts)

# also copy assets
os.makedirs(os.path.join(ASSETS, "fish"), exist_ok=True)
os.makedirs(os.path.join(ASSETS, "spots"), exist_ok=True)
import shutil
copied = 0
for fn in os.listdir(FISH_PNG_DIR):
    if fn.endswith(".png"):
        shutil.copy2(os.path.join(FISH_PNG_DIR, fn), os.path.join(ASSETS, "fish", fn))
        copied += 1
spots = 0
for fn in os.listdir(SPOT_DIR):
    if fn.startswith("spot_") and fn.endswith(".jpg"):
        shutil.copy2(os.path.join(SPOT_DIR, fn), os.path.join(ASSETS, "spots", fn))
        spots += 1

print("content.ts ->", out)
print("FISH surface:", sum(1 for f in E.FISH.values() if not f.get("dive")))
print("LOCATIONS:", len(E.LOCATIONS), "BAITS:", len(E.BAITS))
print("copied fish png:", copied, "spot jpg:", spots)
