// 浏览器自带语音引擎（Web Speech API）朗读鱼蛋台词
let zhVoice: SpeechSynthesisVoice | null = null

function pickVoice() {
  if (!('speechSynthesis' in window)) return
  const voices = window.speechSynthesis.getVoices()
  // 优先中文女声，其次任意中文语音
  zhVoice =
    voices.find((v) => v.lang.startsWith('zh') && /xiaoxiao|xiaoyi|female|huihui|yaoyao|ting/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith('zh')) ??
    null
}

if ('speechSynthesis' in window) {
  pickVoice()
  window.speechSynthesis.onvoiceschanged = pickVoice
}

/** 去掉 emoji 和符号，免得语音引擎把表情名字念出来 */
function stripForSpeech(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/[❗❓★☆]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function speak(text: string, mood: 'cute' | 'excited' | 'sad' = 'cute') {
  if (!('speechSynthesis' in window)) return
  const clean = stripForSpeech(text)
  if (!clean) return
  window.speechSynthesis.cancel() // 新台词打断旧的，避免排队积压
  const u = new SpeechSynthesisUtterance(clean)
  if (zhVoice) u.voice = zhVoice
  u.lang = 'zh-CN'
  // 小象人设：音调偏高、语速略快；兴奋时更高更快，难过时低下来
  u.pitch = mood === 'excited' ? 1.7 : mood === 'sad' ? 1.1 : 1.45
  u.rate = mood === 'excited' ? 1.25 : mood === 'sad' ? 0.95 : 1.1
  u.volume = 1
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
