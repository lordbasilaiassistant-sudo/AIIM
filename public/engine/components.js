import { defineComponent } from "./core/ecs.js";
/**
 * Standard components. All plain serializable data — no methods, no class
 * instances — so save/load, perception snapshots, and LLM-readable world
 * state work uniformly.
 */
export const Transform = defineComponent("Transform", () => ({
    x: 0,
    y: 0,
    /** Facing, radians. 0 = +x. Set automatically from movement/attacks —
     * renderers use it, so characters always face what they're doing. */
    rot: 0,
    /** Height above the ground plane (jump arcs). 0 = grounded. */
    z: 0,
}));
export const Velocity = defineComponent("Velocity", () => ({
    vx: 0,
    vy: 0,
    /** Max speed in units/sec; movement systems clamp to this. */
    maxSpeed: 120,
    /** Vertical speed (jumping) — integrated with gravity by movementSystem. */
    vz: 0,
    /** Knockback channel — added on top of vx/vy (NOT speed-clamped), decays
     * fast. Hits shove things; separate channel so it can't be steered away. */
    kx: 0,
    ky: 0,
    /** Landing recovery before the next jump — bunny-hopping must never be a
     * dominant strategy (jump dodges attacks, so free spam = combat immunity). */
    jumpCooldown: 0.45,
    /** Internal: seconds of landing recovery remaining. */
    jumpReady: 0,
}));
/** Airborne entities above this height are missed by melee and projectiles —
 * jumping is a real dodge, in every game, by default. */
export const DODGE_HEIGHT = 14;
export const Collider = defineComponent("Collider", () => ({
    /** Circle collider radius. */
    radius: 12,
    /** Solid colliders push each other apart; non-solid are triggers. */
    solid: true,
    /** Immovable in collision resolution (walls/pillars). Entities without a
     * Velocity component are treated as static automatically. */
    static: false,
}));
export const Sprite = defineComponent("Sprite", () => ({
    /** Renderer-interpreted shape/skin id. */
    kind: "circle",
    color: "#8fd3ff",
    size: 24,
    /** Optional emoji/text glyph drawn over the shape. */
    glyph: "",
    layer: 0,
}));
export const Named = defineComponent("Named", () => ({
    name: "unnamed",
    /** Short description — included in perception snapshots so Minds know what they see. */
    blurb: "",
}));
export const Health = defineComponent("Health", () => ({
    hp: 100,
    maxHp: 100,
    /** Invulnerability window after being hit (seconds remaining). */
    iframes: 0,
}));
export const Faction = defineComponent("Faction", () => ({
    id: "neutral",
    /** Faction ids this entity treats as enemies. */
    hostileTo: [],
}));
export const Attack = defineComponent("Attack", () => ({
    damage: 10,
    range: 30,
    /** Seconds between attacks. */
    cooldown: 0.8,
    /** Internal: seconds until next attack allowed. */
    ready: 0,
    /** Telegraph: seconds of visible windup before an AI swing lands. The hit
     * only connects if the target is still in reach when it expires — enemy
     * damage is REACTABLE by default in every game (0 = instant, for players). */
    windup: 0.35,
    /** Internal: seconds left in the current windup (0 = not winding). */
    winding: 0,
    /** Internal: entity the current windup will strike. */
    windupTarget: 0,
    /** Knockback impulse applied to the victim on hit, units/sec. */
    knockback: 120,
}));
export const Inventory = defineComponent("Inventory", () => ({
    items: [],
    capacity: 20,
}));
/** Attach to anything that should drop loot on death. */
export const LootDrop = defineComponent("LootDrop", () => ({
    /** Name of a registered loot table. */
    table: "",
}));
/** A physical item lying in the world, ready to be picked up. */
export const Pickup = defineComponent("Pickup", () => ({
    item: { id: "", name: "", qty: 1 },
}));
/** Marks the (usually one) player-controlled entity. */
export const PlayerControlled = defineComponent("PlayerControlled", () => ({
    /** Current input intent, written by the input layer each frame. */
    moveX: 0,
    moveY: 0,
    attack: false,
    interact: false,
}));
/** Quick-use item slots (keys 1-9 in TopDownControls fire use_item). */
export const Hotbar = defineComponent("Hotbar", () => ({
    /** Item ids, index = key-1. */
    slots: [],
}));
/** Something a Mind or player said, displayed and audible to nearby entities. */
export const Speech = defineComponent("Speech", () => ({
    text: "",
    /** Seconds remaining to display. */
    ttl: 0,
}));
/** Simple deterministic wander/chase policy — also the Mind fallback. */
export const Behavior = defineComponent("Behavior", () => ({
    /** "idle" | "wander" | "goto" | "chase" | "attack" | "skirmish" | "flee" */
    mode: "wander",
    /** skirmish: hold this distance from the target (0 = derive from Ranged.range). */
    preferredRange: 0,
    /** Perception radius for acquiring targets. */
    sightRange: 160,
    target: 0,
    homeX: 0,
    homeY: 0,
    /** Max distance from home before returning (0 = unlimited). */
    leash: 300,
    /** Internal wander state. */
    dirTimer: 0,
    dirX: 0,
    dirY: 0,
    /** Internal nav state (waypoints from NavGrid pathfinding). */
    path: [],
    repath: 0,
}));
export const ALL_COMPONENTS = [
    Transform,
    Velocity,
    Collider,
    Sprite,
    Named,
    Health,
    Faction,
    Attack,
    Inventory,
    LootDrop,
    Pickup,
    PlayerControlled,
    Speech,
    Behavior,
    Hotbar,
];
