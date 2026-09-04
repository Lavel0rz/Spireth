#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, acc)
    else if (entry.name.endsWith('.b64')) acc.push(p)
  }
  return acc
}

const root = path.join('client', 'public', 'game', '_b64')
if (!fs.existsSync(root)) {
  console.error('No _b64 directory at', root)
  process.exit(1)
}

for (const file of walk(root)) {
  const rel = path.relative(root, file).replace(/\.b64$/, '')
  const out = path.join('client', 'public', 'game', rel)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64'))
  console.log('wrote', out)
}
