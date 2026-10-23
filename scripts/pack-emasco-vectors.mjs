// Packs the float32 vectors in data/cache/emasco/ into small int8 files in data/emasco/vectors/ for hosting.
// Run: node scripts/pack-emasco-vectors.mjs   (after scripts/embed-emasco.mjs)
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { quantize } from './lib/packVectors.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CACHE = path.join(ROOT, 'data', 'cache', 'emasco')
const OUTPUT = path.join(ROOT, 'data', 'emasco', 'vectors')

async function writeAtomically(name, content) {
  const target = path.join(OUTPUT, name)
  await writeFile(`${target}.tmp`, content)
  await rename(`${target}.tmp`, target)
}

const meta = JSON.parse(await readFile(path.join(CACHE, 'meta.json'), 'utf8'))
await mkdir(OUTPUT, { recursive: true })
for (const name of ['skills', 'roles']) {
  const buffer = await readFile(path.join(CACHE, `${name}.f32`))
  const floats = new Float32Array(new Uint8Array(buffer).buffer)
  const { codes, scales } = quantize(floats, meta.dimension)
  await writeAtomically(`${name}.i8`, Buffer.from(codes.buffer))
  await writeAtomically(`${name}.scale.f32`, Buffer.from(scales.buffer))
  console.log(`${name}: ${floats.length / meta.dimension} vectors, ${(codes.byteLength / 1e6).toFixed(1)} MB`)
}
await writeAtomically('roles_ids.json', await readFile(path.join(CACHE, 'roles_ids.json')))
await writeAtomically('meta.json', JSON.stringify({
  modelId: meta.modelId,
  dimension: meta.dimension,
  skillsHash: meta.skillsHash,
  rolesHash: meta.rolesHash,
  skillCount: meta.skillCount,
  roleCount: meta.roleCount,
  packedAt: new Date().toISOString()
}))
console.log(`Wrote ${OUTPUT}`)
