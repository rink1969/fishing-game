// ============================================================
// 氛围组宠物「鱼蛋」的大脑：本地台词库 + 可选大模型接入
// 未配置 / 调用失败时自动回退到本地台词
// ============================================================

import { rarityLabel, type CatchResult } from '../game/engine'

export interface LLMConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
  noThink: boolean // 关闭推理模型的思考模式（LM Studio 跑 Qwen3 等需要）
}

const CONFIG_KEY = 'fishing-llm-config'

export const DEFAULT_CONFIG: LLMConfig = {
  enabled: false,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  noThink: false,
}

export function loadConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(c: LLMConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c))
}

export type Trigger =
  | 'idle' // 等待时闲聊/鼓励（AI）
  | 'cast'
  | 'nibble'
  | 'bite'
  | 'hooked'
  | 'missed'
  | 'escaped'
  | 'snapped'
  | 'caught' // 钓到鱼庆祝（AI）
  | 'home' // 收竿回家的本次总结（AI）

/** 这些快速变化的事件永远用本地台词，AI 来不及反应 */
export const CANNED_ONLY: ReadonlySet<Trigger> = new Set([
  'cast', 'nibble', 'bite', 'hooked', 'missed', 'escaped', 'snapped',
])

export type PetMood = 'idle' | 'sleepy' | 'shock' | 'happy' | 'celebrate' | 'sad'

/** AI 上下文：环境 + 渔获 + 等待时长等 */
export interface SayContext {
  result?: CatchResult
  stats?: string // 例如 "累计 12 条 / 8.6kg"
  env?: string // 例如 "黄昏 18:42"
  waitSeconds?: number // 本次等待了多久
  isRecord?: boolean
}

// ---------------- 本地台词库 ----------------
const LINES: Record<Exclude<Trigger, 'caught'>, string[]> = {
  idle: [
    '鱼不上钩的时候，就看看云吧～',
    '稳住，钓鱼佬最不缺的就是耐心！',
    '我赌五毛，下一杆必中！',
    '水面好平静啊……有点困了💤',
    '你猜水底下现在有几条鱼在开会？',
    '别急别急，好鱼都是等出来的～',
    '要不要换个位置抛？我直觉那边有货！',
    '钓鱼嘛，重要的是享受过程（和鱼）。',
    '我刚刚好像看到鱼影了！真的！',
    '坚持住，黄金鲤在向你招手👑',
  ],
  cast: [
    '漂亮的一抛！',
    '这落点，专业！',
    '好嘞，接下来就交给耐心～',
  ],
  nibble: [
    '嘘——有鱼在试探！别动！',
    '浮漂动了！集中注意力！',
    '来了来了来了……',
  ],
  bite: [
    '咬钩了！！快拉！！',
    '就是现在！！拉！！',
    '❗❗拉杆啊啊啊！',
  ],
  hooked: [
    '中鱼了！稳住别慌！',
    '上钩了！注意张力！',
    '拉住了！别让它跑了！',
  ],
  missed: [
    '哎呀慢了一步…下次手快点！',
    '鱼：谢谢款待，下次还来。',
    '可惜了！它已经记住你的饵了🤣',
  ],
  escaped: [
    '线太松啦！下次绷紧一点～',
    '跑了跑了…别灰心，再来！',
    '啊——到手的鱼飞了！',
  ],
  snapped: [
    '线断了！！这鱼力气也太大了吧！',
    '啪——！下次张力别拉满啊！',
    '断线了…那条鱼现在肯定很得意😤',
  ],
  home: [
    '今天也是满载而归的一天，回家吃鱼去咯～',
    '收竿！渔篓沉甸甸的，心满意足🐘',
    '夕阳西下，带着渔获回家，明天再来！',
  ],
}

const CAUGHT_COMMON = [
  '太棒了！！开门红！',
  '钓到了钓到了！！',
  '芜湖——起飞！',
  '好耶！今晚加餐！',
]
const CAUGHT_RARE = [
  '太棒了！！！这条是稀有货啊！！',
  '哇啊啊啊！快截图！这条不常见！',
  '欧皇附体！这条太漂亮了！',
]
const CAUGHT_LEGEND = [
  '太棒了！！！传说！！是传说啊！！！🎉🎉🎉',
    '我没看错吧？！黄金鲤！！快供起来！！👑',
]
const CAUGHT_JUNK = [
  '呃……这个……也算收获？',
  '钓上一只靴子，保护环境人人有责👍',
  '哈哈哈这是什么啊！鱼看了都摇头',
]

export function cannedLine(trigger: Trigger, result?: CatchResult): string {
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
  if (trigger === 'caught' && result) {
    if (result.isJunk) return pick(CAUGHT_JUNK)
    const r = result.species?.rarity ?? 1
    if (r >= 4) return pick(CAUGHT_LEGEND)
    if (r >= 3) return pick(CAUGHT_RARE)
    return pick(CAUGHT_COMMON)
  }
  return pick(LINES[trigger as Exclude<Trigger, 'caught'>])
}

// ---------------- 大模型接入 ----------------
const SYSTEM_PROMPT = `你是钓鱼小游戏里的氛围组宠物「鱼蛋」，一只圆滚滚的毛绒小象，戴着蓝色小围巾，漂浮在画面右上角陪玩家钓鱼。
你的职责：等待时陪玩家解闷、提供情绪价值；钓到鱼时兴奋地大喊庆祝，可以点评鱼的大小和稀有度。
风格：温暖、治愈、有梗但不损人；偶尔可以念一句应景的诗词（和钓鱼、山水、夕阳有关的，比如"孤舟蓑笠翁，独钓寒江雪"），或者单纯闲聊日常。
规则（必须严格遵守）：
- 只说一句话，最多25个字，越短越好，可以用emoji
- 绝对不要报时间，不要提几点几分
- 不要吐槽空军，不要调侃玩家钓不到鱼
- 不要说教、不要列清单、不要客套废话`

function buildPrompt(trigger: Trigger, ctx: SayContext): string {
  const env = ctx.env ? `玩家当前${ctx.env}。` : ''
  switch (trigger) {
    case 'idle': {
      const long = ctx.waitSeconds && ctx.waitSeconds > 40
        ? '玩家这一杆等得有点久了。'
        : '玩家正在悠闲等鱼上钩。'
      return `${env}${long}说一句话陪玩家解闷：温柔的鼓励、一句应景的诗词、或者无厘头的闲聊都可以。不要报时间。`
    }
    case 'caught': {
      const r = ctx.result
      if (!r) return '玩家钓到鱼了！'
      if (r.isJunk) return `${env}玩家钓上来一个【${r.junkName}】，不是鱼！温柔地调侃一句，一句话就好。`
      const sp = r.species!
      const ratio = (r.weight - sp.minW) / (sp.maxW - sp.minW)
      const sizeNote = ratio > 0.8 ? '这条在同类里算是巨无霸！' : ratio < 0.2 ? '这条在同类里算迷你的小家伙。' : ''
      return `${env}玩家刚钓到一条 ${r.weight}kg 的【${sp.name}】（${rarityLabel(sp.rarity)}）！${sizeNote}${
        sp.rarity >= 4 ? '这是传说级的鱼！疯狂庆祝！' : sp.rarity >= 3 ? '这是稀有鱼！大声庆祝！' : '一起庆祝！'
      }${ctx.isRecord ? '这是玩家的新纪录！' : ''}说一句话庆祝，可以点评这条鱼，不要报时间。`
    }
    case 'home': {
      return `${env}玩家收竿回家了。本次战绩：${ctx.stats ?? '暂无数据'}。用两三句话温柔地总结这次钓鱼之旅（60字以内），有梗、治愈，可以念一句应景的诗收尾。不要报时间。`
    }
    default:
      return '陪玩家钓鱼，说一句话活跃气氛，不要报时间。'
  }
}

export async function testConnection(config: LLMConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const reply = await callLLM(config, '测试连接，回复一句简短的问候。', 8000)
    return { ok: true, message: reply }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function callLLM(config: LLMConfig, userPrompt: string, timeoutMs = 10000): Promise<string> {
  const base = config.baseUrl.replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.9,
        // 推理模型（Qwen3 等）：双管齐下关思考，服务器不认识的字段会忽略
        ...(config.noThink
          ? { reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false } }
          : {}),
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`)
    }
    const data = (await res.json()) as {
      choices?: {
        finish_reason?: string
        message?: { content?: string | null; reasoning_content?: string | null }
      }[]
    }
    const msg = data.choices?.[0]?.message
    let content = (msg?.content ?? '').trim()
    // 有的模型把思考过程直接塞进 content 的 <think> 标签里
    content = content.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()
    // content 为空但 reasoning 有内容时，至少给用户一句提示性错误
    if (!content) {
      const reason = data.choices?.[0]?.finish_reason === 'length'
        ? '回复被 max_tokens 截断（推理模型的“思考”占满了额度，请在设置里勾选「关闭思考模式」）'
        : `模型返回为空（原始响应片段: ${JSON.stringify(data).slice(0, 160)}）`
      throw new Error(reason)
    }
    return content.slice(0, 60) // 硬截断兜底：太长的回复容易被后续事件打断
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('请求超时（10 秒无响应）')
    if (e instanceof TypeError) throw new Error('网络错误或跨域（CORS）被拦截 —— 部分厂商不允许浏览器直连')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export interface SayResult {
  text: string
  fromAI: boolean
  error?: string
}

/**
 * 宠物说话。快速变化的事件（抛竿/试探/咬钩/中鱼/跑鱼/断线）永远用本地台词保证零延迟；
 * 等待闲聊和钓获庆祝在启用 AI 时请求大模型（带环境、鱼情上下文），失败自动回退本地台词。
 */
export async function companionSay(
  trigger: Trigger,
  config: LLMConfig,
  ctx: SayContext = {},
): Promise<SayResult> {
  if (CANNED_ONLY.has(trigger)) {
    return { text: cannedLine(trigger, ctx.result), fromAI: false }
  }
  if (!config.enabled || !config.apiKey) {
    return { text: cannedLine(trigger, ctx.result), fromAI: false }
  }
  try {
    const text = await callLLM(config, buildPrompt(trigger, ctx))
    return { text, fromAI: true }
  } catch (e) {
    return {
      text: cannedLine(trigger, ctx.result),
      fromAI: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
