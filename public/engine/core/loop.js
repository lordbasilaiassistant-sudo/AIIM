/**
 * Fixed-timestep game loop. The simulation always advances in exact `timestep`
 * increments regardless of frame rate; rendering interpolates between steps.
 * Works in the browser (requestAnimationFrame) and headless (manual/run).
 */
export class GameLoop {
    world;
    timestep;
    maxSteps;
    render;
    runInBackground;
    accumulator = 0;
    last = null;
    rafId = null;
    bgTimer = null;
    visListener = null;
    running = false;
    /** True while the sim is being driven externally (AgentPort step/pause). */
    paused = false;
    stopUntil = 0;
    constructor(world, opts = {}) {
        this.world = world;
        this.timestep = opts.timestep ?? 1 / 60;
        this.maxSteps = opts.maxStepsPerFrame ?? 5;
        this.render = opts.render;
        this.runInBackground = opts.runInBackground ?? true;
    }
    /** Advance the sim exactly n ticks (headless / tests / MCP run_sim / agents). */
    advance(n) {
        for (let i = 0; i < n; i++)
            this.world.step(this.timestep);
    }
    /**
     * Hitstop: freeze the SIM for a moment while rendering continues — the
     * classic impact-weight trick (Hades ~4 frames on melee connect). Pure
     * pacing: sim results are unchanged, just delayed, so determinism holds.
     */
    hitstop(seconds) {
        if (typeof performance === "undefined")
            return;
        this.stopUntil = Math.max(this.stopUntil, performance.now() + seconds * 1000);
    }
    /** Feed a real-time frame (ms timestamp). Used by start(); callable manually. */
    frame(nowMs) {
        if (this.paused) {
            this.render?.(0);
            return;
        }
        if (nowMs < this.stopUntil) {
            this.last = nowMs; // no catch-up burst when the freeze ends
            this.render?.(1);
            return;
        }
        // null sentinel, not 0 — a first rAF timestamp of exactly 0 is legal.
        // Backwards clock jumps clamp to 0 — negative dt must never accumulate
        // (a mixed timebase once buried the sim under -175s of debt).
        if (this.last === null)
            this.last = nowMs;
        this.accumulator += Math.min(Math.max((nowMs - this.last) / 1000, 0), 0.25);
        this.last = nowMs;
        let steps = 0;
        while (this.accumulator >= this.timestep && steps < this.maxSteps) {
            this.world.step(this.timestep);
            this.accumulator -= this.timestep;
            steps++;
        }
        if (steps === this.maxSteps)
            this.accumulator = 0; // drop backlog
        this.render?.(this.accumulator / this.timestep);
    }
    /** Start a requestAnimationFrame-driven loop (browser). */
    start() {
        if (this.running)
            return;
        this.running = true;
        this.last = null;
        const raf = typeof requestAnimationFrame !== "undefined"
            ? requestAnimationFrame.bind(globalThis) // unbound raf throws "Illegal invocation"
            : (cb) => setTimeout(() => cb(performance.now()), this.timestep * 1000);
        const tick = (t) => {
            if (!this.running)
                return;
            this.frame(t);
            this.rafId = raf(tick);
        };
        this.rafId = raf(tick);
        // rAF stops firing in hidden tabs — without this, the whole sim (and
        // every Mind in it) freezes when the player switches tabs
        if (this.runInBackground && typeof document !== "undefined") {
            this.visListener = () => {
                if (document.hidden && this.running) {
                    // browsers clamp hidden-tab timers to ~1 Hz — step the ELAPSED
                    // time per firing (capped), not one tick per firing, or the sim
                    // crawls at 1/60th speed in the background
                    let bgLast = performance.now();
                    this.bgTimer ??= setInterval(() => {
                        if (this.paused)
                            return;
                        const now = performance.now();
                        // cap the catch-up batch: a heavy combat tick times 120 queued
                        // steps would block the main thread for seconds — better to let
                        // background sim time slip than to freeze the tab
                        let elapsed = Math.min((now - bgLast) / 1000, 0.25);
                        bgLast = now;
                        while (elapsed >= this.timestep) {
                            this.world.step(this.timestep);
                            elapsed -= this.timestep;
                        }
                        this.last = null; // resync the rAF timebase on return
                    }, this.timestep * 1000);
                }
                else if (this.bgTimer !== null) {
                    clearInterval(this.bgTimer);
                    this.bgTimer = null;
                }
            };
            document.addEventListener("visibilitychange", this.visListener);
            this.visListener();
        }
    }
    stop() {
        this.running = false;
        if (this.rafId !== null && typeof cancelAnimationFrame !== "undefined") {
            cancelAnimationFrame(this.rafId);
        }
        this.rafId = null;
        if (this.bgTimer !== null) {
            clearInterval(this.bgTimer);
            this.bgTimer = null;
        }
        if (this.visListener && typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", this.visListener);
            this.visListener = null;
        }
    }
}
