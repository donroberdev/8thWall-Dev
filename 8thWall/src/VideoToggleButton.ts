import * as ecs from '@8thwall/ecs'

ecs.registerComponent({
  name: 'Video Toggle Button',

  schema: {
    // @label Video Entity
    videoEntity: ecs.eid,
  },

  stateMachine: ({world, eid, schemaAttribute}) => {
    ecs.defineState('ready')
      .initial()
      .listen(eid, ecs.input.UI_CLICK, () => {
        const {videoEntity} = schemaAttribute.get(eid)

        if (!videoEntity) {
          console.warn('Assign a Video Entity in the Inspector.')
          return
        }

        if (!ecs.VideoControls.has(world, videoEntity)) {
          console.warn('The selected entity has no VideoControls.')
          return
        }

        ecs.VideoControls.mutate(world, videoEntity, (cursor) => {
          cursor.paused = !cursor.paused
          return false
        })
      })
  },
})
