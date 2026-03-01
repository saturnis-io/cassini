/**
 * GLSL shaders for violation spark particles.
 * Sparks emit from violation moon positions and spray outward/tangentially,
 * creating a visual disruption in the sigma flow.
 *
 * Two color modes:
 * - Unacknowledged violations: bright red-orange sparks
 * - Acknowledged violations: muted amber sparks (still sparky, just softer)
 */

export const violationSparkVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;

  attribute vec3 aOrigin;
  attribute vec3 aVelocity;
  attribute float aPhase;
  attribute float aLifetime;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Particle age within its cycle (0 = birth, 1 = death)
    float age = fract((uTime + aPhase) / aLifetime);

    // Flow along spiral direction from origin
    vec3 pos = aOrigin + aVelocity * age * aLifetime;

    // Subtle vertical flutter (sparks stay near the ring plane)
    pos.y += sin(age * 6.28318) * 0.3;

    vColor = aColor;

    // Bright flash at birth, quadratic fadeout
    vAlpha = (1.0 - age) * (1.0 - age) * 0.9;

    // Soft fade-in to avoid pop
    vAlpha *= smoothstep(0.0, 0.05, age);

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // Size: starts larger, shrinks with age (sparkle)
    float size = mix(1.8, 0.2, age);
    gl_PointSize = size * uPixelRatio * (200.0 / -mvPos.z);
  }
`

export const violationSparkFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;

    // Sharp bright core for sparkle effect
    float core = smoothstep(0.5, 0.0, d);
    float alpha = core * core * vAlpha;

    gl_FragColor = vec4(vColor, alpha);
  }
`
