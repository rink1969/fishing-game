// 把 dist/ 发布到 gh-pages 分支（GitHub Pages 用）
// 用法：npm run deploy
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const DIST = path.resolve('dist')
const TMP = path.resolve('.deploy-tmp')
const REMOTE = 'git@github.com:rink1969/fishing-game.git'

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('❌ dist/ 不存在，先跑 npm run build:static')
  process.exit(1)
}

fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
fs.cpSync(DIST, TMP, { recursive: true })

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })

run('git init -b gh-pages', TMP)
run('git add -A', TMP)
run(`git -c user.name=deploy -c user.email=deploy@local commit -m "deploy: ${new Date().toISOString()}"`, TMP)
run(`git remote add origin ${REMOTE}`, TMP)
run('git push -f origin gh-pages', TMP)

fs.rmSync(TMP, { recursive: true, force: true })
console.log('✅ 已推送到 gh-pages 分支')
console.log('👉 首次部署请到仓库 Settings → Pages → Source 选 "Deploy from a branch" → gh-pages / (root)')
console.log('🌐 地址：https://rink1969.github.io/fishing-game/')
