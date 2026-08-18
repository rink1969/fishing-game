// 静态化后处理：把 Vite IIFE 构建中内联进 JS 的 CSS 抽离成单独文件，
// 并把 index.html 的 <script type="module"> 改成经典脚本（file:// 双击可开）。
// 用法：npm run build && node scripts/make-static.mjs
import fs from 'node:fs'

const jsPath = 'dist/assets/app.js'
const cssPath = 'dist/assets/app.css'
const htmlPath = 'dist/index.html'

let js = fs.readFileSync(jsPath, 'utf8')
const marker = '.textContent=`'
const cssChunks = []

// Vite 对每个 CSS import 生成一处 style 注入，逐一抽离
for (;;) {
  const si = js.indexOf(marker)
  if (si === -1) break
  const contentStart = si + marker.length
  // 找第一个“非转义”的反引号作为模板串结尾
  let end = -1
  let scan = contentStart
  for (;;) {
    const j = js.indexOf('`', scan)
    if (j === -1) throw new Error('内联 CSS 模板串未闭合')
    let bs = 0
    let k = j - 1
    while (k >= 0 && js[k] === '\\') { bs++; k-- }
    if (bs % 2 === 0) { end = j; break }
    scan = j + 1
  }
  const raw = js.slice(contentStart, end)
  cssChunks.push(raw.replace(/\\`/g, '`').replace(/\\\$\{/g, '${}').replace(/\\\\/g, '\\'))
  // 保留注入结构，只清空内容（appendChild 一个空 style 无害）
  js = js.slice(0, si) + '.textContent=""' + js.slice(end + 1)
}

if (cssChunks.length === 0) throw new Error('没有在 JS 里找到内联 CSS')
fs.writeFileSync(cssPath, cssChunks.join('\n'), 'utf8')
fs.writeFileSync(jsPath, js, 'utf8')

// index.html：module 脚本 → 经典脚本 + 引入 css
let html = fs.readFileSync(htmlPath, 'utf8')
html = html.replace(
  /<script type="module" crossorigin src="(\.\/assets\/app\.js)"><\/script>/,
  '<link rel="stylesheet" href="./assets/app.css" />\n    <script defer src="$1"></script>',
)
fs.writeFileSync(htmlPath, html, 'utf8')

console.log(`✅ 抽离 CSS ${cssChunks.length} 段 → ${cssPath}（${(fs.statSync(cssPath).size / 1024).toFixed(1)} kB）`)
console.log('✅ index.html 已改为经典脚本引用')
