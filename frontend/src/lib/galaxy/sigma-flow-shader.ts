/**
 * GLSL shaders for sigma-zone particle flow along the Archimedean spiral.
 * Particles flow from the newest data point (outer edge) inward toward
 * the black hole, colored by which sigma zone they occupy.
 *
 * Violation effects are handled by the ring particle shader's
 * heat-diffusion fire coloring (activated via uMoonStatus uniforms).
 */

export const sigmaFlowVertexShader = /* glsl */ `
  #define PI 3.14159265359

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uTotalTurns;
  uniform float uMaxDisplacement;
  uniform float uTotalPoints;

  attribute float spiralT;
  attribute float radialOffset;
  attribute float flowSpeed;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Flow: particles drift from outer (t=1) toward inner (t=0)
    float t = fract(spiralT - uTime * flowSpeed);

    // Archimedean spiral position
    float baseRadius = uInnerRadius + t * (uOuterRadius - uInnerRadius);
    float totalAngle = uTotalTurns * 2.0 * PI;
    float angle = 1.5707963 + t * totalAngle;

    // Radial offset within sigma zones
    float offset = radialOffset * uMaxDisplacement;
    float r = baseRadius + offset;

    vec3 pos = vec3(cos(angle) * r, 0.0, sin(angle) * r);

    // Color by sigma zone — smooth gradient between zones
    float absOff = abs(radialOffset);
    vec3 green  = vec3(0.133, 0.773, 0.369);  // #22C55E
    vec3 yellow = vec3(0.961, 0.620, 0.043);  // #F59E0B
    vec3 red    = vec3(0.937, 0.267, 0.267);  // #EF4444

    vec3 finalColor;
    if (absOff < 0.333) {
      finalColor = green;
    } else if (absOff < 0.666) {
      finalColor = mix(green, yellow, (absOff - 0.333) / 0.333);
    } else {
      finalColor = mix(yellow, red, (absOff - 0.666) / 0.334);
    }

    // Alpha: brighter near center line, dimmer at edges
    float alpha = 0.15 * (1.0 - absOff * 0.3);

    // Fade sigma bands to transparent across the oldest 10 data points
    float fadeEndT = 10.0 / max(uTotalPoints - 1.0, 1.0);
    float innerFade = smoothstep(0.0, fadeEndT, t);
    float outerFade = smoothstep(1.0, 0.97, t);
    alpha *= innerFade * outerFade;

    vColor = finalColor;
    vAlpha = alpha;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;
    gl_PointSize = 0.6 * uPixelRatio * (200.0 / -mvPos.z);
  }
`

export const sigmaFlowFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.1, d) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`
