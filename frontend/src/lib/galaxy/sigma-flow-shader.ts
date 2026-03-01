/**
 * GLSL shaders for sigma-zone particle flow along the Archimedean spiral.
 * Particles flow from the newest data point (outer edge) inward toward
 * the black hole, colored by which sigma zone they occupy.
 *
 * Violation effects are handled by a separate emission particle system
 * (see violationEmit shaders below) that sprays red particles outward
 * from each violation moon in the direction of its deviation from the
 * center line.
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
    vec3 green  = vec3(0.204, 0.827, 0.600);  // #34D399
    vec3 yellow = vec3(0.984, 0.749, 0.141);  // #FBBF24
    vec3 red    = vec3(0.973, 0.443, 0.443);  // #F87171

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

// ---------------------------------------------------------------------------
// Violation emission shaders — separate particle system
//
// Red particles spray radially outward from each violation moon,
// continuing in the direction the data point deviates from the
// spiral's center line. Particles form a cone, fade, and die.
// ---------------------------------------------------------------------------

export const violationEmitVertexShader = /* glsl */ `
  #define PI 3.14159265359
  #define MAX_VIOLATIONS 16

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uTotalTurns;
  uniform float uMaxDisplacement;
  uniform vec3 uViolationMoons[MAX_VIOLATIONS]; // (angle, radius, status)
  uniform vec3 uAlertColor;
  uniform vec3 uAckColor;

  attribute float birthPhase;    // 0-1, staggers particle births
  attribute float emitterSlot;   // 0-15, which violation slot
  attribute float coneAngle;     // -1 to 1, perpendicular spread in the cone
  attribute float emitSpeed;     // 0-1, travel speed variation

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Look up this particle's violation moon data (loop for WebGL1 compat)
    vec3 moonData = vec3(0.0);
    for (int i = 0; i < MAX_VIOLATIONS; i++) {
      if (abs(float(i) - emitterSlot) < 0.5) {
        moonData = uViolationMoons[i];
      }
    }
    float mAngle = moonData.x;
    float mRadius = moonData.y;
    float status = moonData.z;

    // Hide if slot is inactive
    if (status <= 0.0) {
      gl_Position = vec4(0.0, 0.0, -99.0, 1.0);
      gl_PointSize = 0.0;
      vColor = vec3(0.0);
      vAlpha = 0.0;
      return;
    }

    // Particle lifecycle: 0 = just born at moon, 1 = dead
    float life = fract(uTime * 1.0 + birthPhase);

    // Moon origin in world space
    float originX = cos(mAngle) * mRadius;
    float originZ = sin(mAngle) * mRadius;

    // Spiral tangent at the moon's position (flow direction = decreasing t)
    // For Archimedean spiral: x = r*cos(a), z = r*sin(a)
    // where r = inner + t*(outer-inner), a = PI/2 + t*totalAngle
    // dx/dt = -sin(a)*totalAngle*r + cos(a)*(outer-inner)
    // dz/dt =  cos(a)*totalAngle*r + sin(a)*(outer-inner)
    // Flow = decreasing t, so negate
    float totalAngle = uTotalTurns * 2.0 * PI;
    float radialRate = uOuterRadius - uInnerRadius;

    float flowX = sin(mAngle) * totalAngle * mRadius - cos(mAngle) * radialRate;
    float flowZ = -cos(mAngle) * totalAngle * mRadius - sin(mAngle) * radialRate;

    // Normalize flow direction
    float flowLen = sqrt(flowX * flowX + flowZ * flowZ);
    flowX /= flowLen;
    flowZ /= flowLen;

    // Perpendicular direction (for cone spread)
    float perpX = -flowZ;
    float perpZ = flowX;

    // Travel distance along the flow
    float maxTravel = uMaxDisplacement * 1.2;
    float travel = life * maxTravel * (0.4 + emitSpeed * 0.6);

    // Cone spread widens with distance
    float spread = coneAngle * travel * 0.35;

    // Final position: origin + travel along flow + perpendicular spread
    float x = originX + travel * flowX + spread * perpX;
    float z = originZ + travel * flowZ + spread * perpZ;

    vec3 pos = vec3(x, 0.0, z);

    // Color: bright red (unacknowledged) or muted amber (acknowledged)
    vColor = status > 0.5 ? uAlertColor : uAckColor;

    // Fade out: bright at birth, gone at end — quadratic die-off
    float fade = 1.0 - life;
    fade *= fade;
    vAlpha = fade * status * 0.55;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // Shrink as particle dies
    float size = (1.0 - life * 0.6) * 1.2;
    gl_PointSize = size * uPixelRatio * (200.0 / -mvPos.z);
  }
`

export const violationEmitFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.05, d) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`
