/**
 * Validates required env vars before running a command.
 * Loads .env manually, checks vars, then execs the actual command.
 */
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const envPath = path.join(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq)
    const val = trimmed.slice(eq + 1)
    if (!process.env[key]) process.env[key] = val
  }
}

const args = process.argv.slice(2)
const isBuild = args.some(a => a.includes('build'))

const requiredNonEmpty = isBuild ? [] : ['PORT']
const requiredDefined = ['BASE_PATH']
const missingNonEmpty = requiredNonEmpty.filter(k => !process.env[k])
const missingDefined = requiredDefined.filter(k => process.env[k] === undefined)
const missing = [...missingNonEmpty, ...missingDefined]

if (missing.length > 0) {
  console.error(`\n❌ Missing required env vars: ${missing.join(', ')}`)
  console.error('   Set them in your environment or copy .env.example to .env\n')
  process.exit(1)
}

try {
  execSync(args.join(' '), { stdio: 'inherit', env: process.env })
} catch (e) {
  process.exit(e.status || 1)
}
