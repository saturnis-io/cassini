/**
 * GLSL shaders for black hole accretion disc and photon ring effects.
 * Particles orbit at Keplerian speeds (faster near core) with a bright
 * photon ring at the innermost edge.
 */

export const blackHoleVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;

  attribute vec3 color;
  attribute float orbitalPhase;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float r = length(position.xz);
    float baseAngle = atan(position.z, position.x) + orbitalPhase;

    // Keplerian orbital speed: faster near center
    float orbitalSpeed = 0.3 / sqrt(max(r / 12.0, 0.1));
    float angle = baseAngle + uTime * orbitalSpeed;

    // Reconstruct orbital position
    vec3 pos = vec3(cos(angle) * r, position.y, sin(angle) * r);

    // Photon ring: bright gaussian peak at r ≈ 12 (just outside core at 10.5)
    float photonRing = exp(-pow((r - 12.0) / 0.6, 2.0));

    // Accretion disc glow: exponential falloff from core
    float discGlow = exp(-(r - 11.0) / 10.0) * 0.4;

    vAlpha = clamp(photonRing * 0.9 + discGlow, 0.02, 0.95);
    vColor = color;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // Photon ring particles are larger and brighter
    float baseSize = photonRing > 0.3 ? 2.5 : 1.2;
    gl_PointSize = baseSize * uPixelRatio * (200.0 / -mvPos.z);
  }
`

export const blackHoleFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Soft circular point
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.15, d) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`
