import * as ecs from '@8thwall/ecs'

ecs.registerComponent({
  name: 'Open URL Button',

  schema: {
    // @label URL
    url: ecs.string,
  },

  schemaDefaults: {
    url: 'https://example.com',
  },

  stateMachine: ({eid, schemaAttribute}) => {
    ecs.defineState('ready')
      .initial()
      .listen(eid, ecs.input.UI_CLICK, () => {
        const {url} = schemaAttribute.get(eid)
        const cleanUrl = url.trim()

        if (!cleanUrl.startsWith('https://') &&
            !cleanUrl.startsWith('http://')) {
          console.warn('URL must start with https:// or http://')
          return
        }

        window.open(cleanUrl, '_blank', 'noopener,noreferrer')
      })
  },
})
