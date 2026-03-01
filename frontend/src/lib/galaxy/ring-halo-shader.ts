/**
 * Simplified ring shader for the 'halo' LOD level.
 * Renders flowing particles without the moon wake computation — much cheaper on the GPU.
 */

export const ringHaloVertexShader = /* glsl */ `
  uniform float uPixelRatio;

  attribute vec3 color;
  varying vec3 vColor;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = (8.0 / -mvPosition.z) * uPixelRatio;
  }
`

export const ringHaloFragmentShader = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    if(length(coord) > 0.5) discard;
    gl_FragColor = vec4(vColor, 0.5);
  }
`
