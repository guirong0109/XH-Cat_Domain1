// int8 packing of unit vectors for hosting: one scale per vector, 4x smaller than float32.

export function quantize(vectors, dimension) {
  const rowCount = vectors.length / dimension
  const codes = new Int8Array(vectors.length)
  const scales = new Float32Array(rowCount)
  for (let row = 0; row < rowCount; row += 1) {
    const offset = row * dimension
    let largest = 0
    for (let position = 0; position < dimension; position += 1) largest = Math.max(largest, Math.abs(vectors[offset + position]))
    const scale = largest > 0 ? largest / 127 : 1
    scales[row] = scale
    for (let position = 0; position < dimension; position += 1) {
      codes[offset + position] = Math.round(vectors[offset + position] / scale)
    }
  }
  return { codes, scales }
}

export function dequantize(codes, scales, dimension) {
  const vectors = new Float32Array(codes.length)
  for (let row = 0; row < scales.length; row += 1) {
    const offset = row * dimension
    for (let position = 0; position < dimension; position += 1) vectors[offset + position] = codes[offset + position] * scales[row]
  }
  return vectors
}
