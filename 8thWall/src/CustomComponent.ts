// This is a component file. You can use this file to define a custom component for your project.
// This component will appear as a custom component in the editor.

import * as ecs from '@8thwall/ecs'  // This is how you access the ecs library.

ecs.registerComponent({
  name: 'Custom Component 2026',
    schema: {
    target: ecs.eid,             // Unique entity reference for the NPC (Entity ID)
    speed: ecs.f32,              // Movement speed of the NPC (32-bit float)
    strength: ecs.f64,           // Strength level for the NPC (64-bit float)
    level: ecs.i32,              // Character level of the NPC (32-bit integer)
    armor: ecs.ui8,              // Armor rating of the NPC (0-255, 8-bit unsigned integer)
    experience: ecs.ui32,        // Experience points of the NPC (32-bit unsigned integer)
    guildName: ecs.string,       // Name of the Guild NPC belongs to. (String)
    isHostile: ecs.boolean       // Boolean indicating if the NPC is hostile to the player (Boolean)
    },

    schemaDefaults: {
    speed: 3.14,
    strength: 5.8,
    level: 10,
    armor: 255,
    experience: 12,
    guildName: 'Niantic Crew',
    isHostile: false
    }
    
  // data: {
  // },
  // add: (world, component) => {
  // },
  // tick: (world, component) => {
  // },
  // remove: (world, component) => {
  // },
  // stateMachine: ({world, eid, schemaAttribute, dataAttribute}) => {
  //   ecs.defineState('default').initial()
  // },
})