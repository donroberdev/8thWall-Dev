import * as ecs from '@8thwall/ecs'
import {setMaterialEffect, removeMaterialEffect} from './material-effects'
import type {EffectMesh, MaterialEffect} from './material-effects'

type Matrix = {
  elements: ArrayLike<number>
  clone: () => Matrix
  copy: (matrix: Matrix) => Matrix
  invert: () => Matrix
}
type WindowMesh = EffectMesh & {
  matrixWorld: Matrix
  geometry: {
    boundingBox?: {min: {x: number; y: number}; max: {x: number; y: number}}
    computeBoundingBox: () => void
  }
  raycast: (...args: unknown[]) => void
}
type RenderCamera = {matrixWorld: Matrix; isOrthographicCamera?: boolean}

const CONTENT_EFFECT = 'magic-window-content'
const APERTURE_EFFECT = 'magic-window-aperture'
const apertureEffect: MaterialEffect = {
  cacheKey: APERTURE_EFFECT,
  properties: {colorWrite: false, depthWrite: false},
}

const VERTEX_DECLARATIONS = `
uniform mat4 magicWorldToWindow;
varying vec3 vMagicWindowPosition;
varying float vMagicViewDepth;
`
const VERTEX_POSITION = `
#include <project_vertex>
vMagicWindowPosition = (magicWorldToWindow * modelMatrix * vec4(transformed, 1.0)).xyz;
vMagicViewDepth = -mvPosition.z;
`
const FRAGMENT_DECLARATIONS = `
uniform vec3 magicCameraLocal;
uniform vec3 magicDirectionLocal;
uniform vec4 magicBounds;
uniform float magicOrthographic;
uniform float magicFrontOnly;
varying vec3 vMagicWindowPosition;
varying float vMagicViewDepth;
`
const FRAGMENT_CLIP = `
#include <clipping_planes_fragment>
// Intersect the camera-to-fragment ray with the window's local XY plane.
vec3 magicRay = magicOrthographic > 0.5
  ? magicDirectionLocal : vMagicWindowPosition - magicCameraLocal;
if (abs(magicRay.z) < 0.000001) discard;
if (magicFrontOnly > 0.5 && magicRay.z >= 0.0) discard;
float magicBacktrack = vMagicWindowPosition.z / magicRay.z;
float magicRayLength = magicOrthographic > 0.5 ? vMagicViewDepth : 1.0;
// The aperture must be between the camera and the media plane, not behind either one.
if (magicBacktrack < 0.0 || magicBacktrack >= magicRayLength) discard;
vec2 magicHit = vMagicWindowPosition.xy - magicRay.xy * magicBacktrack;
if (magicHit.x < magicBounds.x || magicHit.y < magicBounds.y ||
    magicHit.x > magicBounds.z || magicHit.y > magicBounds.w) discard;
`

const createWindow = (mesh: WindowMesh) => {
  const uniforms = {
    magicWorldToWindow: {value: mesh.matrixWorld.clone()},
    magicCameraLocal: {value: [0, 0, 0]},
    magicDirectionLocal: {value: [0, 0, -1]},
    magicBounds: {value: [-0.5, -0.5, 0.5, 0.5]},
    magicOrthographic: {value: 0},
    magicFrontOnly: {value: 1},
  }
  const effect: MaterialEffect = {
    cacheKey: 'magic-window-v1',
    compile: (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = VERTEX_DECLARATIONS + shader.vertexShader.replace(
        '#include <project_vertex>', VERTEX_POSITION
      )
      shader.fragmentShader = FRAGMENT_DECLARATIONS + shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>', FRAGMENT_CLIP
      )
    },
    beforeRender: (value) => {
      // These matrices are current here, including AR tracking and each XR eye.
      const camera = value as RenderCamera
      const inverse = uniforms.magicWorldToWindow.value.copy(mesh.matrixWorld).invert()
      const m = inverse.elements
      const c = camera.matrixWorld.elements
      const position = uniforms.magicCameraLocal.value
      for (let row = 0; row < 3; row++) {
        position[row] = m[row] * c[12] + m[row + 4] * c[13] + m[row + 8] * c[14] + m[row + 12]
      }
      const length = Math.hypot(c[8], c[9], c[10]) || 1
      const direction = uniforms.magicDirectionLocal.value
      for (let row = 0; row < 3; row++) {
        direction[row] = -(m[row] * c[8] + m[row + 4] * c[9] + m[row + 8] * c[10]) / length
      }
      uniforms.magicOrthographic.value = camera.isOrthographicCamera ? 1 : 0
    },
  }
  const originalRaycast = mesh.raycast
  const skipRaycast = () => {}
  // The invisible aperture must not intercept touches meant for its contents.
  mesh.raycast = skipRaycast
  return {mesh, effect, uniforms, children: new Set<EffectMesh>(), originalRaycast, skipRaycast}
}

type WindowState = ReturnType<typeof createWindow>
const windows = new WeakMap<ecs.World, Map<bigint, WindowState>>()
const releaseWindow = (instances: Map<bigint, WindowState>, eid: bigint) => {
  const state = instances.get(eid)
  if (!state) return
  for (const child of state.children) removeMaterialEffect(child, CONTENT_EFFECT, state.effect)
  removeMaterialEffect(state.mesh, APERTURE_EFFECT, apertureEffect)
  if (state.mesh.raycast === state.skipRaycast) state.mesh.raycast = state.originalRaycast
  instances.delete(eid)
}

const MagicWindow = ecs.registerComponent({
  name: 'Magic Window',
  schema: {
    // @label Enabled
    enabled: ecs.boolean,
    // Front is local +Z; place image/video children at negative local Z.
    // @label Front Side Only
    frontOnly: ecs.boolean,
    // Fraction of the plane width/height reserved as a border on each edge.
    // @label Border Inset
    // @min 0
    // @max 0.49
    borderInset: ecs.f32,
  },
  schemaDefaults: {enabled: true, frontOnly: true, borderInset: 0},

  tick: (world, {eid, schema}) => {
    let instances = windows.get(world)
    if (!instances) {
      instances = new Map()
      windows.set(world, instances)
    }
    const mesh = world.three.entityToObject.get(eid) as unknown as WindowMesh | undefined
    const validPlane = ecs.PlaneGeometry.has(world, eid) && mesh?.isMesh &&
      mesh.material && !Array.isArray(mesh.material)
    let state = instances.get(eid)
    if (state && (!schema.enabled || !validPlane || state.mesh !== mesh)) {
      releaseWindow(instances, eid)
      state = undefined
    }
    if (!schema.enabled || !validPlane) return
    if (!state) {
      state = createWindow(mesh)
      instances.set(eid, state)
    }
    setMaterialEffect(mesh, APERTURE_EFFECT, apertureEffect)

    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    const {min, max} = mesh.geometry.boundingBox
    const inset = Math.max(0, Math.min(0.49, schema.borderInset))
    const dx = (max.x - min.x) * inset
    const dy = (max.y - min.y) * inset
    const bounds = state.uniforms.magicBounds.value
    bounds[0] = min.x + dx
    bounds[1] = min.y + dy
    bounds[2] = max.x - dx
    bounds[3] = max.y - dy
    state.uniforms.magicFrontOnly.value = schema.frontOnly ? 1 : 0

    const currentChildren = new Set<EffectMesh>()
    const visit = (parent: bigint) => {
      for (const child of world.getChildren(parent)) {
        // Nested windows manage their own contents.
        if (MagicWindow.has(world, child)) continue
        const object = world.three.entityToObject.get(child) as unknown as EffectMesh | undefined
        const material = object?.material
        // Both image textures and live video textures use the same aperture.
        // Keep the original map so video playback and Chroma Key remain intact.
        const mediaPlane = ecs.PlaneGeometry.has(world, child) && object?.isMesh &&
          material && !Array.isArray(material) && material.map
        if (mediaPlane) {
          setMaterialEffect(object, CONTENT_EFFECT, state.effect)
          currentChildren.add(object)
        }
        visit(child)
      }
    }
    visit(eid)
    for (const child of state.children) {
      if (!currentChildren.has(child)) removeMaterialEffect(child, CONTENT_EFFECT, state.effect)
    }
    state.children = currentChildren
  },

  remove: (world, {eid}) => {
    const instances = windows.get(world)
    if (instances) releaseWindow(instances, eid)
  },
})
