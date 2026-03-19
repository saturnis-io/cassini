/**
 * Lanczos approximation for ln(Gamma(z)) for z > 0.
 */
function lnGamma(z: number): number {
  if (z <= 0) return Infinity
  const g = 7
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]
  if (z < 0.5) {
    // Reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  }
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i)
  }
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

/**
 * Evaluate the probability density function for a given distribution family.
 */
export function evaluatePDF(family: string, params: Record<string, number>, x: number): number {
  const TWO_PI = 2 * Math.PI

  switch (family) {
    case 'normal': {
      const mu = params.loc
      const sigma = params.scale
      if (sigma <= 0) return 0
      const z = (x - mu) / sigma
      return (1 / (sigma * Math.sqrt(TWO_PI))) * Math.exp(-0.5 * z * z)
    }

    case 'lognormal': {
      const s = params.s
      const loc = params.loc
      const scale = params.scale
      const y = x - loc
      if (y <= 0 || s <= 0 || scale <= 0) return 0
      const lnY = Math.log(y) - Math.log(scale)
      return (1 / (y * s * Math.sqrt(TWO_PI))) * Math.exp(-0.5 * (lnY / s) ** 2)
    }

    case 'weibull': {
      const c = params.c
      const loc = params.loc
      const scale = params.scale
      const y = x - loc
      if (y <= 0 || c <= 0 || scale <= 0) return 0
      const yNorm = y / scale
      return (c / scale) * Math.pow(yNorm, c - 1) * Math.exp(-Math.pow(yNorm, c))
    }

    case 'gamma': {
      const a = params.a
      const loc = params.loc
      const scale = params.scale
      const y = x - loc
      if (y <= 0 || a <= 0 || scale <= 0) return 0
      const lnPdf = (a - 1) * Math.log(y) - y / scale - a * Math.log(scale) - lnGamma(a)
      return Math.exp(lnPdf)
    }

    case 'johnson_su': {
      const a = params.a
      const b = params.b
      const loc = params.loc
      const scale = params.scale
      if (scale <= 0 || b <= 0) return 0
      const z = (x - loc) / scale
      const w = a + b * Math.asinh(z)
      return (b / (scale * Math.sqrt(TWO_PI) * Math.sqrt(z * z + 1))) * Math.exp(-0.5 * w * w)
    }

    case 'johnson_sb': {
      const a = params.a
      const b = params.b
      const loc = params.loc
      const scale = params.scale
      if (scale <= 0 || b <= 0) return 0
      const z = (x - loc) / scale
      if (z <= 0 || z >= 1) return 0
      const w = a + b * Math.log(z / (1 - z))
      return (b / (scale * Math.sqrt(TWO_PI) * z * (1 - z))) * Math.exp(-0.5 * w * w)
    }

    default:
      return 0
  }
}
