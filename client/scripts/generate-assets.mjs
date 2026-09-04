/**
 * Generates pepe-style pixel art sprites for The Spireth game board.
 * Run: node scripts/generate-assets.mjs
 */
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '../public/game')

const BLACK = [0, 0, 0, 255]
const MINT = [184, 224, 176, 255]
const DARK_MINT = [140, 180, 132, 255]
const GREY = [120, 120, 120, 255]
const WHITE = [255, 255, 255, 255]
function createImage(w, h) {
  return { w, h, data: new Uint8Array(w * h * 4) }
}

function setPixel(img, x, y, color) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return
  const i = (y * img.w + x) * 4
  img.data[i] = color[0]
  img.data[i + 1] = color[1]
  img.data[i + 2] = color[2]
  img.data[i + 3] = color[3]
}

function fillRect(img, x, y, w, h, color) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) setPixel(img, px, py, color)
  }
}

function drawPepeFrame(img, ox, oy, direction, frame) {
  const body = MINT
  const shade = DARK_MINT
  const legOffset = frame === 1 ? 2 : frame === 3 ? -2 : 0
  const armSwing = frame === 1 ? 1 : frame === 3 ? -1 : 0

  if (direction === 'down') {
    fillRect(img, ox + 14, oy + 8, 20, 18, body)
    fillRect(img, ox + 12, oy + 6, 24, 6, body)
    fillRect(img, ox + 10, oy + 4, 28, 4, body)
    fillRect(img, ox + 16, oy + 14, 6, 4, WHITE)
    fillRect(img, ox + 26, oy + 14, 6, 4, WHITE)
    fillRect(img, ox + 17, oy + 15, 4, 2, BLACK)
    fillRect(img, ox + 27, oy + 15, 4, 2, BLACK)
    fillRect(img, ox + 18, oy + 24, 12, 2, shade)
    fillRect(img, ox + 14 + legOffset, oy + 32, 8, 10, body)
    fillRect(img, ox + 26 - legOffset, oy + 32, 8, 10, body)
    fillRect(img, ox + 10, oy + 20 + armSwing, 4, 10, body)
    fillRect(img, ox + 34, oy + 20 - armSwing, 4, 10, body)
  } else if (direction === 'up') {
    fillRect(img, ox + 14, oy + 10, 20, 16, body)
    fillRect(img, ox + 12, oy + 6, 24, 8, body)
    fillRect(img, ox + 10, oy + 4, 28, 4, body)
    fillRect(img, ox + 14, oy + 26, 20, 4, shade)
    fillRect(img, ox + 14 + legOffset, oy + 32, 8, 10, body)
    fillRect(img, ox + 26 - legOffset, oy + 32, 8, 10, body)
    fillRect(img, ox + 10, oy + 18 - armSwing, 4, 10, body)
    fillRect(img, ox + 34, oy + 18 + armSwing, 4, 10, body)
  } else if (direction === 'right') {
    fillRect(img, ox + 16, oy + 8, 18, 18, body)
    fillRect(img, ox + 26, oy + 6, 12, 8, body)
    fillRect(img, ox + 30, oy + 8, 8, 6, body)
    fillRect(img, ox + 32, oy + 10, 4, 3, WHITE)
    fillRect(img, ox + 33, oy + 11, 2, 1, BLACK)
    fillRect(img, ox + 18, oy + 24, 10, 2, shade)
    fillRect(img, ox + 20 + legOffset, oy + 32, 8, 10, body)
    fillRect(img, ox + 28 - legOffset, oy + 32, 6, 10, body)
    fillRect(img, ox + 12, oy + 18 + armSwing, 6, 4, body)
    fillRect(img, ox + 30, oy + 22 - armSwing, 8, 4, body)
  } else {
    fillRect(img, ox + 14, oy + 8, 18, 18, body)
    fillRect(img, ox + 10, oy + 6, 12, 8, body)
    fillRect(img, ox + 6, oy + 8, 8, 6, body)
    fillRect(img, ox + 8, oy + 10, 4, 3, WHITE)
    fillRect(img, ox + 9, oy + 11, 2, 1, BLACK)
    fillRect(img, ox + 20, oy + 24, 10, 2, shade)
    fillRect(img, ox + 14 + legOffset, oy + 32, 6, 10, body)
    fillRect(img, ox + 22 - legOffset, oy + 32, 8, 10, body)
    fillRect(img, ox + 8, oy + 22 - armSwing, 8, 4, body)
    fillRect(img, ox + 28, oy + 18 + armSwing, 6, 4, body)
  }
}

function drawGrassTile(img, ox, oy, variant) {
  fillRect(img, ox, oy, 48, 48, MINT)
  fillRect(img, ox, oy, 48, 2, DARK_MINT)
  fillRect(img, ox, oy + 46, 48, 2, DARK_MINT)
  fillRect(img, ox, oy, 2, 48, DARK_MINT)
  fillRect(img, ox + 46, oy, 2, 48, DARK_MINT)
  const tufts = variant === 0
    ? [[8, 12], [22, 8], [36, 14], [14, 28], [30, 32], [40, 24]]
    : [[12, 10], [28, 16], [6, 30], [20, 36], [38, 8], [42, 34]]
  for (const [tx, ty] of tufts) {
    setPixel(img, ox + tx, oy + ty, GREY)
    setPixel(img, ox + tx + 1, oy + ty - 1, GREY)
    setPixel(img, ox + tx - 1, oy + ty - 1, GREY)
  }
}

function drawStoneTile(img, ox, oy, variant) {
  fillRect(img, ox, oy, 48, 48, DARK_MINT)
  const spots = variant === 0
    ? [[6, 8], [20, 14], [34, 10], [12, 28], [30, 34], [40, 22]]
    : [[10, 12], [24, 6], [8, 30], [22, 36], [36, 18], [44, 38]]
  for (const [tx, ty] of spots) {
    fillRect(img, ox + tx, oy + ty, 4, 3, GREY)
  }
  fillRect(img, ox, oy, 48, 2, [100, 130, 96, 255])
}

function drawGrassTileset(img) {
  fillRect(img, 0, 0, 48, 48, MINT)
  fillRect(img, 0, 0, 48, 48, [0, 0, 0, 0])
  fillRect(img, 4, 4, 40, 40, MINT)
  fillRect(img, 4, 4, 40, 4, DARK_MINT)
  fillRect(img, 4, 40, 40, 4, DARK_MINT)
  fillRect(img, 4, 4, 4, 40, DARK_MINT)
  fillRect(img, 40, 4, 4, 40, DARK_MINT)
  drawGrassTile(img, 0, 64, 0)
  drawGrassTile(img, 48, 64, 1)
  drawGrassTile(img, 96, 64, 0)
}

function drawHillTileset(img) {
  fillRect(img, 0, 0, 80, 64, DARK_MINT)
  fillRect(img, 4, 4, 72, 56, [120, 155, 112, 255])
  fillRect(img, 4, 4, 72, 6, [90, 120, 84, 255])
  for (let i = 0; i < 20; i++) {
    const px = 6 + (i * 11) % 68
    const py = 10 + (i * 7) % 40
    fillRect(img, px, py, 3, 2, GREY)
  }
  drawGrassTile(img, 0, 64, 0)
  drawGrassTile(img, 48, 64, 1)
  drawGrassTile(img, 96, 64, 0)
}

function drawStoneTileset(img) {
  fillRect(img, 80, 0, 80, 64, [130, 160, 124, 255])
  for (let i = 0; i < 24; i++) {
    const px = 84 + (i * 9) % 72
    const py = 6 + (i * 11) % 52
    fillRect(img, px, py, 4, 3, GREY)
  }
  drawStoneTile(img, 0, 64, 0)
  drawStoneTile(img, 48, 64, 1)
  drawStoneTile(img, 96, 64, 0)
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function writePng(path, img) {
  const { w, h, data } = img
  const rowSize = 1 + w * 4
  const raw = Buffer.alloc(rowSize * h)
  for (let y = 0; y < h; y++) {
    raw[y * rowSize] = 0
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4
      const di = y * rowSize + 1 + x * 4
      raw[di] = data[si]
      raw[di + 1] = data[si + 1]
      raw[di + 2] = data[si + 2]
      raw[di + 3] = data[si + 3]
    }
  }
  const compressed = deflateSync(raw)

  const writeChunk = (type, payload) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(payload.length)
    const typeBuf = Buffer.from(type)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, payload])))
    return Buffer.concat([len, typeBuf, payload, crcBuf])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    writeChunk('IHDR', ihdr),
    writeChunk('IDAT', compressed),
    writeChunk('IEND', Buffer.alloc(0)),
  ])

  return new Promise((resolve, reject) => {
    const stream = createWriteStream(path)
    stream.on('error', reject)
    stream.on('finish', resolve)
    stream.write(png)
    stream.end()
  })
}

async function main() {
  const charsDir = join(OUT, 'characters')
  const tilesDir = join(OUT, 'tiles')
  await mkdir(charsDir, { recursive: true })
  await mkdir(tilesDir, { recursive: true })

  const walk = createImage(192, 192)
  const dirs = ['down', 'up', 'right', 'left']
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      drawPepeFrame(walk, col * 48, row * 48, dirs[row], col)
    }
  }
  await writePng(join(charsDir, 'Basic-Character-Spritesheet.png'), walk)

  const grassTile = createImage(176, 112)
  drawGrassTileset(grassTile)
  await writePng(join(tilesDir, 'Grass_Tile.png'), grassTile)

  const hills = createImage(160, 100)
  drawHillTileset(hills)
  await writePng(join(tilesDir, 'Dark_Grass_Hill_Tiles.png'), hills)

  const stone = createImage(160, 100)
  drawStoneTileset(stone)
  await writePng(join(tilesDir, 'Stone_Ground_Tiles.png'), stone)

  console.log('Generated fallback assets in', OUT)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
