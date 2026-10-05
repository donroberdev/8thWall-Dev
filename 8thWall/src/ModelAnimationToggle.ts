import * as ecs from '@8thwall/ecs'

type AnimationMode = 'idle' | 'action'
type LoadedModel = {animations: Array<{name: string}>}

ecs.registerComponent({
  name: 'Model Animation Toggle',

  schema: {
    // Disables this controller; the model keeps its current animation.
    // @label Enabled
    enabled: ecs.boolean,
    // Leave empty to animate the object that owns this component.
    // @label Animation Target
    target: ecs.eid,
    // Clip names must match the animations included in the GLB.
    // @label Idle Animation
    idleClip: ecs.string,
    // @label Action Animation
    actionClip: ecs.string,
    // @label Play Idle On Start
    playIdleOnStart: ecs.boolean,
    // @label Loop Action
    loopAction: ecs.boolean,
    // Only applies when Loop Action is off.
    // @label Return To Idle
    returnToIdle: ecs.boolean,
    // @label Idle Speed
    // @min 0.01
    idleSpeed: ecs.f32,
    // @label Action Speed
    // @min 0.01
    actionSpeed: ecs.f32,
    // Seconds used to blend from one animation to the other.
    // @label Cross Fade Duration
    // @min 0
    crossFadeDuration: ecs.f32,
    // Minimum seconds between accepted clicks. Zero disables the cooldown.
    // @label Click Cooldown
    // @min 0
    clickCooldown: ecs.f32,
  },

  schemaDefaults: {
    enabled: true,
    idleClip: 'Idle',
    actionClip: 'Action',
    playIdleOnStart: true,
    loopAction: true,
    returnToIdle: true,
    idleSpeed: 1,
    actionSpeed: 1,
    crossFadeDuration: 0.25,
    clickCooldown: 0.2,
  },

  stateMachine: ({world, eid, schemaAttribute}) => {
    let mode: AnimationMode | undefined
    let playingClip = ''
    let boundTarget = 0n
    let loadedModel: LoadedModel | undefined
    let wasEnabled = false
    let nextClickAt = 0
    let lastWarning = ''
    let actionFinished = false
    const taps = new Set<number>()
    const maxTapMovement = 0.025

    const getTarget = () => schemaAttribute.get(eid).target || eid
    const getLoadedModel = (target: bigint) =>
      world.three.entityToObject.get(target)?.userData.gltf as LoadedModel | undefined
    const warn = (message: string) => {
      if (message !== lastWarning) console.warn(`Model Animation Toggle: ${message}`)
      lastWarning = message
    }

    const play = (next: AnimationMode) => {
      const options = schemaAttribute.get(eid)
      if (!options.enabled) return false
      const target = getTarget()
      if (!ecs.GltfModel.has(world, target)) {
        warn('Animation Target must be a GLB model. Leave it empty to use this object.')
        return false
      }
      // Wait for the real clips to load before changing the current animation.
      const loaded = getLoadedModel(target)
      if (!loaded) return false
      const clip = (next === 'idle' ? options.idleClip : options.actionClip).trim()
      if (!clip || !loaded.animations.some(animation => animation.name === clip)) {
        warn(`Animation "${clip}" not found. Available: ${loaded.animations.map(a => a.name).join(', ') || '(none)'}`)
        return false
      }
      lastWarning = ''

      ecs.GltfModel.mutate(world, target, (model) => {
        model.animationClip = clip
        model.loop = next === 'idle' || options.loopAction
        // In this engine, zero repetitions means unlimited when loop is enabled.
        model.repetitions = 0
        model.reverse = false
        model.paused = false
        model.time = 0
        model.timeScale = Math.fround(Math.max(0.01, next === 'idle' ? options.idleSpeed : options.actionSpeed))
        model.crossFadeDuration = Math.max(0, options.crossFadeDuration)
      })
      mode = next
      playingClip = clip
      actionFinished = false
      return true
    }

    const sync = () => {
      const options = schemaAttribute.get(eid)
      const target = getTarget()
      const loaded = getLoadedModel(target)
      if (target !== boundTarget || loaded !== loadedModel || options.enabled !== wasEnabled) {
        mode = undefined
        playingClip = ''
        actionFinished = false
        nextClickAt = 0
        taps.clear()
        lastWarning = ''
        boundTarget = target
        loadedModel = loaded
        wasEnabled = options.enabled
      }
      if (!options.enabled) return
      if (!mode) {
        if (options.playIdleOnStart) play('idle')
        return
      }
      if (!ecs.GltfModel.has(world, target)) return
      const model = ecs.GltfModel.get(world, target)
      // Do not overwrite an animation selected by another controller.
      if (model.animationClip !== playingClip) return
      if (mode === 'action' && actionFinished && !options.loopAction && options.returnToIdle) {
        play('idle')
        return
      }
      const clip = (mode === 'idle' ? options.idleClip : options.actionClip).trim()
      if (clip !== playingClip) {
        play(mode)
        return
      }
      const speed = Math.fround(Math.max(0.01, mode === 'idle' ? options.idleSpeed : options.actionSpeed))
      const loop = mode === 'idle' || options.loopAction
      const fade = Math.max(0, options.crossFadeDuration)
      // Inspector changes take effect without restarting the current clip.
      if (model.timeScale !== speed || model.loop !== loop || model.crossFadeDuration !== fade) {
        ecs.GltfModel.mutate(world, target, (cursor) => {
          cursor.timeScale = speed
          cursor.loop = loop
          cursor.crossFadeDuration = fade
        })
        if (loop) actionFinished = false
      }
    }

    const hitsModel = (entity: bigint | undefined) => {
      const target = getTarget()
      for (let current = entity; current; current = world.getParent(current)) {
        if (ecs.Ui.has(world, current)) return false
        if (current === eid || current === target) return true
      }
      return false
    }

    const toggle = () => {
      sync()
      const options = schemaAttribute.get(eid)
      if (!options.enabled || world.time.elapsed < nextClickAt) return
      const target = getTarget()
      const isAction = mode === 'action' && ecs.GltfModel.has(world, target) &&
        ecs.GltfModel.get(world, target).animationClip === playingClip
      if (play(isAction ? 'idle' : 'action')) {
        nextClickAt = world.time.elapsed + Math.max(0, options.clickCooldown) * 1000
      }
    }

    ecs.defineState('ready').initial()
      .onEnter(sync)
      .onTick(sync)
      .onExit(() => taps.clear())
      .listen(world.events.globalId, ecs.input.SCREEN_TOUCH_START, ({data}) => {
        taps.delete(data.pointerId)
        if (schemaAttribute.get(eid).enabled && hitsModel(data.target)) taps.add(data.pointerId)
      })
      .listen(world.events.globalId, ecs.input.SCREEN_TOUCH_MOVE, ({data}) => {
        const distance = Math.hypot(data.position.x - data.start.x, data.position.y - data.start.y)
        if (distance > maxTapMovement) taps.delete(data.pointerId)
      })
      .listen(world.events.globalId, ecs.input.GESTURE_START, ({data}) => {
        if (data.touchCount > 1) taps.clear()
      })
      .listen(world.events.globalId, ecs.input.SCREEN_TOUCH_END, ({data}) => {
        if (!taps.delete(data.pointerId) || !hitsModel(data.target) || !hitsModel(data.endTarget)) return
        const distance = Math.hypot(data.position.x - data.start.x, data.position.y - data.start.y)
        if (distance <= maxTapMovement) toggle()
      })
      .listen(world.events.globalId, ecs.events.GLTF_ANIMATION_FINISHED, (event) => {
        const target = getTarget()
        if (event.target !== target || mode !== 'action' || event.data.name !== playingClip ||
            !ecs.GltfModel.has(world, target) ||
            ecs.GltfModel.get(world, target).animationClip !== playingClip) return
        actionFinished = true
        const options = schemaAttribute.get(eid)
        if (options.enabled && !options.loopAction && options.returnToIdle) play('idle')
      })
  },
})
