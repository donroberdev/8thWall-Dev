import * as ecs from '@8thwall/ecs'

// Attach to the GLB entity. The engine raycasts its actual meshes, including
// meshes nested inside the model, so no invisible button or collider is needed.
ecs.registerComponent({
  name: 'Open URL 3D Object',

  schema: {
    // @label Enabled
    enabled: ecs.boolean,
    // Absolute web address, for example https://wa.me/ followed by a phone number.
    // @label URL
    url: ecs.string,
    // @label Open In New Tab
    openInNewTab: ecs.boolean,
  },

  schemaDefaults: {enabled: true, url: '', openInNewTab: true},

  stateMachine: ({world, eid, schemaAttribute}) => {
    const taps = new Set<number>()
    // Screen positions are normalized to the viewport by the engine.
    const maxTapMovement = 0.025

    const hitsObject = (target: bigint | undefined) => {
      for (let current = target; current; current = world.getParent(current)) {
        // UI children use Open URL UI Button and must not also open this link.
        if (ecs.Ui.has(world, current)) return false
        if (current === eid) return true
      }
      return false
    }

    const openUrl = () => {
      const {enabled, url, openInNewTab} = schemaAttribute.get(eid)
      const cleanUrl = url.trim()
      if (!enabled || !cleanUrl) return

      let destination: URL
      try {
        destination = new URL(cleanUrl)
        if (destination.protocol !== 'https:' && destination.protocol !== 'http:') {
          throw new Error('Unsupported protocol')
        }
      } catch {
        console.warn('Open URL 3D Object: enter a valid URL starting with https:// or http://.')
        return
      }

      // Keep navigation inside the input callback to preserve the user gesture.
      if (openInNewTab) window.open(destination.href, '_blank', 'noopener,noreferrer')
      else window.location.assign(destination.href)
    }

    ecs.defineState('ready')
      .initial()
      .onExit(() => taps.clear())
      .listen(world.events.globalId, ecs.input.SCREEN_TOUCH_START, ({data}) => {
        taps.delete(data.pointerId)
        if (schemaAttribute.get(eid).enabled && hitsObject(data.target)) {
          taps.add(data.pointerId)
        }
      })
      .listen(world.events.globalId, ecs.input.SCREEN_TOUCH_MOVE, ({data}) => {
        const distance = Math.hypot(data.position.x - data.start.x, data.position.y - data.start.y)
        if (distance > maxTapMovement) taps.delete(data.pointerId)
      })
      .listen(world.events.globalId, ecs.input.GESTURE_START, ({data}) => {
        if (data.touchCount > 1) taps.clear()
      })
      .listen(world.events.globalId, ecs.input.SCREEN_TOUCH_END, ({data}) => {
        if (!taps.delete(data.pointerId)) return
        if (!hitsObject(data.target) || !hitsObject(data.endTarget)) return
        const distance = Math.hypot(data.position.x - data.start.x, data.position.y - data.start.y)
        if (distance <= maxTapMovement) openUrl()
      })
  },
})
