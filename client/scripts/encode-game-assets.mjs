#!/usr/bin/env node
import { createWriteStream } from 'fs'
import { mkdir, readdir, readFile, stat } from 'fs/promises'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GAME = join(__dirname, '../public/game')
const B64 = join(GAME, '_b64')

async function walk(dir, acc = []) {
  for (const name of await readdir(dir)) {
    const p = join(dir, name)
    const s = await stat(p)
    if (s.isDirectory()) {
      if (name === '_b64') continue
      await walk(p, acc)
    } else if (name.endsWith('.png')) {
      acc.push(p)
    }
  }
  return acc
}

for (const png of await walk(GAME)) {
  const rel = relative(GAME, png)
  const out = join(B64, `${rel}.b64`)
  await mkdir(dirname(out), { recursive: true })
  const data = await readFile(png)
  const b64 = data.toString('base64')
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(out)
    stream.on('error', reject)
    stream.on('finish', resolve)
    stream.write(b64)
    stream.end()
  })
  console.log('wrote', out)
}
