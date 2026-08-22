import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const sizes = [256, 128, 64, 48, 32, 16]
const srcPng = path.resolve('resources/icon.png')
const outIco = path.resolve('resources/icon.ico')
const tmpDir = path.resolve('scratch/tmp-icons')

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true })
}

const images = []
for (const s of sizes) {
  const tmpPng = path.join(tmpDir, `icon_${s}.png`)
  execSync(`sips -z ${s} ${s} "${srcPng}" --out "${tmpPng}"`, { stdio: 'ignore' })
  const buf = fs.readFileSync(tmpPng)
  images.push({ size: s, buf })
}

// Build ICO file
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // Reserved
header.writeUInt16LE(1, 2) // Type: Icon
header.writeUInt16LE(images.length, 4) // Count

let offset = 6 + images.length * 16
const dirEntries = []
const imageBuffers = []

for (const img of images) {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(img.size === 256 ? 0 : img.size, 0) // Width
  entry.writeUInt8(img.size === 256 ? 0 : img.size, 1) // Height
  entry.writeUInt8(0, 2) // Color count
  entry.writeUInt8(0, 3) // Reserved
  entry.writeUInt16LE(1, 4) // Color planes
  entry.writeUInt16LE(32, 6) // Bits per pixel
  entry.writeUInt32LE(img.buf.length, 8) // Image size
  entry.writeUInt32LE(offset, 12) // Image offset

  dirEntries.push(entry)
  imageBuffers.push(img.buf)
  offset += img.buf.length
}

const finalIco = Buffer.concat([header, ...dirEntries, ...imageBuffers])
fs.writeFileSync(outIco, finalIco)
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log(`✅ Generated ${outIco} (${finalIco.length} bytes, ${images.length} resolutions)`)
