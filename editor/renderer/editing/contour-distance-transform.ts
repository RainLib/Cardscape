/** Separable lower envelopes of squared parabolas. Labels follow their sites,
 * so a nearest boundary segment can be recovered without a per-pixel edge scan. */
function transform(
  source: ArrayLike<number>,
  width: number,
  height: number,
  target?: number,
  spacingX = 1,
  spacingY = 1,
) {
  const size = Math.max(width, height),
    sites = new Int32Array(size),
    cuts = new Float64Array(size + 1),
    input = new Float64Array(size),
    output = new Float64Array(size),
    nearest = new Int32Array(size),
    distance = new Float32Array(width * height),
    labels = target === undefined ? new Int32Array(width * height) : null,
    rowLabels = new Int32Array(size);
  function axis(length: number, spacing: number) {
    const scale = spacing * spacing;
    let k = 0;
    sites[0] = 0;
    cuts[0] = -Infinity;
    cuts[1] = Infinity;
    for (let q = 1; q < length; q++) {
      let s =
        (input[q] - input[sites[k]] + (q * q - sites[k] * sites[k]) * scale) /
        (2 * (q - sites[k]) * scale);
      while (s <= cuts[k]) {
        k--;
        s =
          (input[q] - input[sites[k]] + (q * q - sites[k] * sites[k]) * scale) /
          (2 * (q - sites[k]) * scale);
      }
      sites[++k] = q;
      cuts[k] = s;
      cuts[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < length; q++) {
      while (cuts[k + 1] < q) k++;
      nearest[q] = sites[k];
      output[q] = (q - sites[k]) ** 2 * scale + input[sites[k]];
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const v = source[y * width + x];
      input[y] = (target === undefined ? v >= 0 : v === target) ? 0 : 1e12;
    }
    axis(height, spacingY);
    for (let y = 0; y < height; y++) {
      distance[y * width + x] = output[y];
      if (labels) labels[y * width + x] = source[nearest[y] * width + x];
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      input[x] = distance[y * width + x];
      if (labels) rowLabels[x] = labels[y * width + x];
    }
    axis(width, spacingX);
    for (let x = 0; x < width; x++) {
      distance[y * width + x] = output[x];
      if (labels) labels[y * width + x] = rowLabels[nearest[x]];
    }
  }
  return { distance, labels };
}
export default { transform };
