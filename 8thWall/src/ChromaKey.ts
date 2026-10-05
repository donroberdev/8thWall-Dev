import * as ecs from '@8thwall/ecs'
import {setMaterialEffect, removeMaterialEffect} from './material-effects'
import type {EffectMesh, MaterialEffect, Uniform} from './material-effects'

type Binding = {
  mesh: EffectMesh
  effect: MaterialEffect
  uniforms: {
    chromaKeyColor: Uniform<number[]>
    chromaTolerance: Uniform<number>
    chromaSoftness: Uniform<number>
  }
}

const bindings = new WeakMap<ecs.World, Map<bigint, Binding>>()

const CHROMA_FUNCTIONS = `
uniform vec3 chromaKeyColor;
uniform float chromaTolerance;
uniform float chromaSoftness;

vec3 chromaLinearToSrgb(vec3 color) {
  return mix(
    12.92 * color,
    1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
    step(vec3(0.0031308), color)
  );
}

// Compare chrominance so brightness variation and JPEG noise remain removable.
vec2 chromaUv(vec3 color) {
  return vec2(
    dot(color, vec3(-0.168736, -0.331264, 0.5)),
    dot(color, vec3(0.5, -0.418688, -0.081312))
  );
}
`

const CHROMA_FRAGMENT = `
#include <map_fragment>
#ifdef USE_MAP
  // The runtime decodes sRGB textures before this point. Inspector RGB is sRGB.
  vec3 chromaSample = chromaLinearToSrgb(sampledDiffuseColor.rgb);
  float chromaDistance = distance(chromaUv(chromaSample), chromaUv(chromaKeyColor));
  float chromaAlpha = smoothstep(
    chromaTolerance, chromaTolerance + chromaSoftness, chromaDistance
  );
  diffuseColor.a *= chromaAlpha;
  if (diffuseColor.a < 0.001) discard;
#endif
`

const release = (instances: Map<bigint, Binding>, eid: bigint) => {
  const binding = instances.get(eid)
  if (!binding) return

  removeMaterialEffect(binding.mesh, 'chroma-key', binding.effect)
  instances.delete(eid)
}

const attach = (mesh: EffectMesh): Binding => {
  const uniforms = {
    chromaKeyColor: {value: [103 / 255, 176 / 255, 71 / 255]},
    chromaTolerance: {value: 0.08},
    chromaSoftness: {value: 0.04},
  }
  const effect: MaterialEffect = {
    cacheKey: 'chroma-key-v1',
    properties: {transparent: true, depthWrite: false},
    compile: (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.fragmentShader = CHROMA_FUNCTIONS + shader.fragmentShader.replace(
        '#include <map_fragment>', CHROMA_FRAGMENT
      )
    },
  }
  return {mesh, effect, uniforms}
}

ecs.registerComponent({
  name: 'Chroma Key',

  // Attach to a textured plane. Its existing image and UV settings are preserved.
  schema: {
    // @label Enabled
    enabled: ecs.boolean,

    // @group start keyColor:color
    // @label Red
    keyRed: ecs.ui8,
    // @label Green
    keyGreen: ecs.ui8,
    // @label Blue
    keyBlue: ecs.ui8,
    // @group end

    // Higher values remove more colors around the selected background color.
    // @label Tolerance
    // @min 0
    // @max 1
    tolerance: ecs.f32,

    // Width of the transition between transparent and opaque pixels.
    // @label Edge Softness
    // @min 0
    // @max 1
    softness: ecs.f32,
  },

  schemaDefaults: {
    enabled: true,
    // Background sampled from Faro_Chroma.jpg: #67b047.
    keyRed: 103,
    keyGreen: 176,
    keyBlue: 71,
    tolerance: 0.08,
    softness: 0.04,
  },

  tick: (world, {eid, schema}) => {
    let instances = bindings.get(world)
    if (!instances) {
      instances = new Map()
      bindings.set(world, instances)
    }

    if (!schema.enabled) {
      release(instances, eid)
      return
    }

    const mesh = world.three.entityToObject.get(eid) as unknown as EffectMesh | undefined
    let binding = instances.get(eid)

    if (binding && binding.mesh !== mesh) {
      release(instances, eid)
      binding = undefined
    }

    // Retry on subsequent frames while the entity or texture is loading.
    if (!mesh?.isMesh || !mesh.material || Array.isArray(mesh.material) || !mesh.material.map) {
      release(instances, eid)
      return
    }

    if (!binding) {
      binding = attach(mesh)
      instances.set(eid, binding)
    }
    setMaterialEffect(mesh, 'chroma-key', binding.effect)

    const {uniforms} = binding
    uniforms.chromaKeyColor.value[0] = schema.keyRed / 255
    uniforms.chromaKeyColor.value[1] = schema.keyGreen / 255
    uniforms.chromaKeyColor.value[2] = schema.keyBlue / 255
    uniforms.chromaTolerance.value = Math.max(0, Math.min(1, schema.tolerance))
    // Avoid undefined smoothstep behavior when both edges are equal.
    uniforms.chromaSoftness.value = Math.max(0.0001, Math.min(1, schema.softness))
  },

  remove: (world, {eid}) => {
    const instances = bindings.get(world)
    if (instances) release(instances, eid)
  },
})
