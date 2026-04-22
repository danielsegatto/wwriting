// Run once: node scripts/gen-icons.mjs
// Generates PNG icons for the PWA manifest from public/favicon.svg.
// Sharp + librsvg (bundled with sharp) handle SVG rasterization.
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const svgPath = resolve(root, 'public/favicon.svg')
const svgBuffer = readFileSync(svgPath)

const BG = { r: 9, g: 9, b: 11, alpha: 1 } // zinc-950 #09090b

async function generate(size, outName) {
  const padding = Math.round(size * 0.15)
  const inner = size - padding * 2

  const icon = await sharp(svgBuffer)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: icon, gravity: 'centre' }])
    .png()
    .toFile(resolve(root, 'public', outName))

  console.log(`  ✓ public/${outName}  (${size}x${size})`)
}

console.log('Generating PWA icons…')
await generate(192, 'pwa-192x192.png')
await generate(512, 'pwa-512x512.png')
await generate(180, 'apple-touch-icon.png')
console.log('Done.')
