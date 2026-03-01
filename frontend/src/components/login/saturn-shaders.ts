/**
 * GLSL shaders for Saturn ring particle system with Daphnis-style moon warp effects.
 * Used with THREE.ShaderMaterial on a Points geometry.
 */

export const ringVertexShader = /* glsl */ `
  #define PI 3.14159265359
  #define TWO_PI 6.28318530718
  #define NUM_MOONS 12

  uniform vec3 uMoons[NUM_MOONS];
  uniform float uMoonStatus[NUM_MOONS];
  uniform float uPixelRatio;
  uniform vec3 uAlertColor;
  uniform float uTime;

  attribute vec3 color;
  varying vec3 vColor;

  // Pseudo-random function for the sparkle/flicker effect
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    float r = length(position.xz);
    float theta = atan(position.z, position.x);

    float dy = 0.0;
    vec3 finalColor = color;
    vec3 newPos = position;
    float pointSizeMultiplier = 1.0;

    for(int i = 0; i < NUM_MOONS; i++) {
      float mR = uMoons[i].x;
      float mTheta = uMoons[i].y;
      float mBaseR = uMoons[i].z;
      float status = uMoonStatus[i];

      float dTheta = mod(theta - mTheta + PI, TWO_PI) - PI;
      float dR_moon = r - mR;
      float dR_base = r - mBaseR;

      // Visual trailing wake: ripples form behind the moon's direction of travel
      float wakeDist = -dTheta;

      if (wakeDist > 0.0 && wakeDist < 2.5 && abs(dR_moon) < 4.0) {
        float freq = 20.0;

        // Expand wake radial width over distance to form a cone
        float spread = 1.0 + wakeDist * 2.0;

        // Smooth fade-in at leading edge eliminates the hard line
        float damping = smoothstep(0.0, 0.2, wakeDist) * exp(-wakeDist * 2.0);

        // Attenuation divided by expanding spread
        float radialAtten = exp(-abs(dR_moon) * 3.0 / spread);

        // Wave phase anchored to base gap radius to prevent radial sliding
        float wave = sin(wakeDist * freq - abs(dR_base) * 8.0 - uTime * 4.0);

        float amp = 0.15 + (status * 0.8);
        dy += wave * damping * radialAtten * amp * sign(dR_base);

        float radialPush = wave * damping * radialAtten * (0.1 + status * 0.4) * sign(dR_base);
        newPos.x += (position.x / r) * radialPush;
        newPos.z += (position.z / r) * radialPush;

        if (status > 0.0) {
          float flicker = random(position.xz + uTime * 2.0);
          float heat = damping * radialAtten * status * (0.6 + 0.4 * wave);

          // Plasma wake: intense heat with flickering flame colors and enlarged particles
          vec3 flameColor = mix(uAlertColor, vec3(1.0, 0.9, 0.6), heat * flicker * 2.5);
          finalColor = mix(finalColor, flameColor, clamp(heat * 3.0, 0.0, 1.0));
          pointSizeMultiplier += (flicker * heat * 5.0);
        }
      }
    }

    vColor = finalColor;
    newPos.y += dy;

    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Apply the dynamic sparkle/fire size multiplier
    gl_PointSize = (10.0 / -mvPosition.z) * uPixelRatio * pointSizeMultiplier;
  }
`

export const ringFragmentShader = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    if(length(coord) > 0.5) discard;
    gl_FragColor = vec4(vColor, 0.7);
  }
`
