import * as ecs from '@8thwall/ecs'

ecs.registerComponent({
  name: 'Toggle Character Animation',

  schema: {
    // Personaje que contiene el componente GltfModel.
    // Si se deja vacío, se usa el mismo objeto.
    // @label Animation Target
    target: ecs.eid,

    // @label Idle Animation
    idleClip: ecs.string,

    // @label Dance Animation
    danceClip: ecs.string,

    // @label Cross Fade Duration
    crossFadeDuration: ecs.f32,
  },

  schemaDefaults: {
    idleClip: 'idle',
    danceClip: 'dance',
    crossFadeDuration: 0.25,
  },

  stateMachine: ({world, eid, schemaAttribute}) => {
    let isDancing = false

    const playAnimation = (
      targetEid: bigint,
      animationClip: string,
      loop: boolean
    ) => {
      if (!ecs.GltfModel.has(world, targetEid)) {
        console.warn(
          'Animation target does not have a GltfModel component.'
        )
        return
      }

      ecs.GltfModel.mutate(world, targetEid, (model) => {
        model.animationClip = animationClip
        model.loop = loop
        model.repetitions = loop ? -1 : 0
        model.paused = false
        model.time = 0
        model.timeScale = 1
        model.crossFadeDuration =
          schemaAttribute.get(eid).crossFadeDuration

        return false
      })
    }

    ecs.defineState('ready')
      .initial()
      .onEnter(() => {
        const {
          target,
          idleClip,
        } = schemaAttribute.get(eid)

        const targetEid = target || eid

        playAnimation(targetEid, idleClip, true)
      })
      .listen(
        eid,
        ecs.input.SCREEN_TOUCH_START,
        (event) => {
          // Solo responde cuando se toca el objeto
          // que tiene este componente.
          if (event.data.target !== eid) {
            return
          }

          const {
            target,
            idleClip,
            danceClip,
          } = schemaAttribute.get(eid)

          const targetEid = target || eid

          isDancing = !isDancing

          if (isDancing) {
            playAnimation(
              targetEid,
              danceClip,
              true
            )
          } else {
            playAnimation(
              targetEid,
              idleClip,
              true
            )
          }
        }
      )
  },
})