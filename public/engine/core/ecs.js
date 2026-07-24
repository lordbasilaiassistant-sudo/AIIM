/**
 * Anima ECS — the deterministic simulation heart of the engine.
 *
 * Entities are integer ids. Components are plain serializable objects stored
 * in per-type maps. Systems are functions run each fixed tick. Minds (LLM
 * intelligence) live *outside* the tick as async processes that inject
 * validated intents back in — the sim never blocks on a thought.
 */
export function defineComponent(name, defaults) {
    return {
        name,
        // Only keys present in defaults() are accepted — unknown keys from
        // untrusted init data (LLM-emitted prefabs, drifted saves) are dropped
        // rather than injected into component state.
        create: (init) => {
            const data = defaults();
            if (init) {
                for (const k of Object.keys(data)) {
                    const v = init[k];
                    if (v !== undefined)
                        data[k] = v;
                }
            }
            return data;
        },
    };
}
/**
 * Typed event bus. Events emitted during a tick are also recorded into a
 * per-tick journal so perception/replay/networking can consume "what
 * happened" without subscribing to everything.
 */
export class EventBus {
    listeners = new Map();
    /**
     * Journal of events for the current tick. NOTE: while systems run, this
     * only contains events from systems that already ran this tick — a system
     * can never see same-tick events from later-ordered systems. Use
     * `lastJournal`/`recent()` for the complete previous tick.
     */
    journal = [];
    /** The COMPLETE journal of the previous tick (every system had its turn). */
    lastJournal = [];
    tick = 0;
    inTick = false;
    /** Events emitted between ticks (input handlers, external triggers) land in the NEXT tick's journal. */
    offTick = [];
    beginTick(tick) {
        this.tick = tick;
        this.lastJournal = this.journal;
        this.journal = [];
        this.inTick = true;
        for (const ev of this.offTick)
            this.journal.push({ ...ev, tick });
        this.offTick.length = 0;
    }
    endTick() {
        this.inTick = false;
    }
    /** Previous tick's full journal + what has landed so far this tick. */
    recent() {
        return this.lastJournal.concat(this.journal);
    }
    /** Drop all journal/off-tick state (used by World.load). */
    reset() {
        this.journal = [];
        this.lastJournal = [];
        this.offTick.length = 0;
        this.inTick = false;
    }
    on(type, fn) {
        let set = this.listeners.get(type);
        if (!set)
            this.listeners.set(type, (set = new Set()));
        set.add(fn);
        return () => set.delete(fn);
    }
    emit(type, payload = {}) {
        if (this.inTick)
            this.journal.push({ type, payload, tick: this.tick });
        else
            this.offTick.push({ type, payload });
        const set = this.listeners.get(type);
        if (set)
            for (const fn of set)
                fn(payload);
    }
}
/** Deterministic seeded RNG (mulberry32) — same seed, same world. */
export class Rng {
    s;
    constructor(seed = 1) {
        this.s = seed >>> 0 || 1;
    }
    next() {
        // keep state normalized to uint32 — same output (imul truncates anyway),
        // but getState() stays canonical so identical worlds save identically
        this.s = (this.s + 0x6d2b79f5) >>> 0;
        let t = this.s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(min, max) {
        return min + Math.floor(this.next() * (max - min + 1));
    }
    pick(arr) {
        return arr[Math.floor(this.next() * arr.length)];
    }
    chance(p) {
        return this.next() < p;
    }
    /** Serializable state for save/load. */
    getState() {
        return this.s;
    }
    setState(s) {
        this.s = s >>> 0;
    }
}
export class World {
    nextEntity = 1;
    alive = new Set();
    stores = new Map();
    systems = [];
    pendingDestroy = new Set();
    events = new EventBus();
    rng;
    tick = 0;
    /** Simulation time in seconds. */
    time = 0;
    constructor(seed = 1) {
        this.rng = new Rng(seed);
    }
    // ---- entities ----
    create() {
        const e = this.nextEntity++;
        this.alive.add(e);
        return e;
    }
    /** Deferred destroy: applied at end of the current step (safe mid-iteration). */
    destroy(e) {
        if (this.alive.has(e))
            this.pendingDestroy.add(e);
    }
    /** True if the entity is alive but scheduled to be destroyed at end of tick.
     * Validators should treat doomed entities as gone (prevents same-tick dupes). */
    isDoomed(e) {
        return this.pendingDestroy.has(e);
    }
    destroyNow(e) {
        if (!this.alive.delete(e))
            return;
        for (const store of this.stores.values())
            store.delete(e);
        this.events.emit("entity:destroyed", { entity: e });
    }
    isAlive(e) {
        return this.alive.has(e);
    }
    entityCount() {
        return this.alive.size;
    }
    /** All entity ids currently alive (snapshot copy). */
    entities() {
        return [...this.alive];
    }
    /** Every component on an entity, keyed by component name (plain data —
     * safe to serialize; used by debug/agent surfaces). */
    componentsOf(e) {
        const out = {};
        for (const [name, store] of this.stores) {
            const c = store.get(e);
            if (c !== undefined)
                out[name] = c;
        }
        return out;
    }
    // ---- components ----
    store(type) {
        let s = this.stores.get(type.name);
        if (!s)
            this.stores.set(type.name, (s = new Map()));
        return s;
    }
    add(e, type, init) {
        if (!this.alive.has(e)) {
            throw new Error(`cannot add ${type.name} to dead entity ${e}`);
        }
        const data = type.create(init);
        this.store(type).set(e, data);
        return data;
    }
    get(e, type) {
        return this.store(type).get(e);
    }
    require(e, type) {
        const c = this.store(type).get(e);
        if (!c)
            throw new Error(`entity ${e} missing component ${type.name}`);
        return c;
    }
    has(e, type) {
        return this.store(type).has(e);
    }
    /** Component check by NAME — for layers that shouldn't import the type
     * (e.g. core behavior policies probing optional gameplay components). */
    hasNamed(e, componentName) {
        return this.stores.get(componentName)?.has(e) ?? false;
    }
    /** Component data by NAME (undefined if absent). See hasNamed. */
    getNamed(e, componentName) {
        return this.stores.get(componentName)?.get(e);
    }
    remove(e, type) {
        this.store(type).delete(e);
    }
    /** Iterate entities that have ALL the given component types. */
    *query(...types) {
        if (types.length === 0) {
            yield* this.alive;
            return;
        }
        // iterate the smallest store for speed
        let smallest = this.store(types[0]);
        for (const t of types) {
            const s = this.store(t);
            if (s.size < smallest.size)
                smallest = s;
        }
        outer: for (const e of smallest.keys()) {
            if (!this.alive.has(e))
                continue;
            for (const t of types) {
                if (!this.store(t).has(e))
                    continue outer;
            }
            yield e;
        }
    }
    /** All (entity, component) pairs for one type. */
    *each(type) {
        for (const [e, c] of this.store(type)) {
            if (this.alive.has(e))
                yield [e, c];
        }
    }
    // ---- systems & stepping ----
    addSystem(sys) {
        this.systems.push(sys);
        this.systems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return this;
    }
    /** Advance the simulation exactly one fixed step. */
    step(dt) {
        this.tick++;
        this.time += dt;
        this.events.beginTick(this.tick);
        const ctx = { world: this, dt, tick: this.tick };
        for (const sys of this.systems)
            sys.update(ctx);
        if (this.pendingDestroy.size) {
            for (const e of this.pendingDestroy)
                this.destroyNow(e);
            this.pendingDestroy.clear();
        }
        this.events.endTick();
    }
    // ---- serialization ----
    /** Snapshot the full component state (components must stay plain data). */
    save() {
        const components = {};
        for (const [name, store] of this.stores) {
            const rows = [];
            for (const [e, c] of store) {
                if (this.alive.has(e))
                    rows.push([e, structuredClone(c)]);
            }
            if (rows.length)
                components[name] = rows;
        }
        return {
            nextEntity: this.nextEntity,
            alive: [...this.alive],
            tick: this.tick,
            time: this.time,
            rng: this.rng.getState(),
            components,
        };
    }
    /**
     * Restore a snapshot. Saved component data is passed through each type's
     * `create()` so fields added since the save get their defaults (schema
     * migration) and unknown keys are dropped. Returns the names of component
     * types present in the snapshot but not in `types` — those are NOT restored;
     * a non-empty result almost always means a missing registration (warned).
     */
    load(snap, types) {
        const byName = new Map(types.map((t) => [t.name, t]));
        this.nextEntity = snap.nextEntity;
        this.alive = new Set(snap.alive);
        this.tick = snap.tick;
        this.time = snap.time;
        this.rng.setState(snap.rng);
        this.stores.clear();
        this.pendingDestroy.clear();
        this.events.reset();
        const dropped = [];
        for (const [name, rows] of Object.entries(snap.components)) {
            const type = byName.get(name);
            if (!type) {
                dropped.push(name);
                continue;
            }
            const store = new Map();
            for (const [e, c] of rows)
                store.set(e, type.create(structuredClone(c)));
            this.stores.set(name, store);
        }
        if (dropped.length) {
            console.warn(`World.load: dropped unregistered component types: ${dropped.join(", ")} — pass them in the types list to restore them`);
        }
        return { dropped };
    }
}
