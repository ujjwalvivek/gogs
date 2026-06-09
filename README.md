<!-- markdownlint-disable MD013 -->

# gogs (A Game of Games)

A sandboxed, sequential benchmarking harness for comparing Journey (Rust/WASM)
and TinyTS (TypeScript) game engines. Engines run in isolation,
produce standardized metric JSON, and compares them.

- Journey Engine - [https://docs.rs/journey-engine/1.3.0]
- Journey Sequencer - [https://docs.rs/journey-sequencer/1.3.0]
- Journey Sound - [https://docs.rs/journey-sound/1.3.0]
- TinyTS Docs - [https://tinyts.ujjwalvivek.com/]

---

## Build Pipeline

### Journey

```bash
cd journey-bench
wasm-pack build --target web --release
cd www && npx serve .
```

### TinyTS

```bash
cd tinyts-bench
npm install
npm run dev
```

### Harness

```bash
cd bench-data
npm install
npm run dev
```

---

### Flow

```test
  → harness opens journey-bench in new window
  → journey-bench runs all conditions unattended
  → harness receives payload, closes journey window
  → harness opens tinyts-bench in new window
  → tinyts-bench runs all conditions unattended
  → harness receives payload, closes tinyts window
  → posts BenchmarkRun to harness opener via postMessage
  → harness renders all graphs
```

---

## Bundle & Load Analysis

### Binary / Bundle Size

| Metric              | Journey    | TinyTS    |
| ------------------- | ---------- | --------- |
| Raw WASM binary     | 2990.69 KB | N/A       |
| JS glue code        | 96.47 KB   | N/A       |
| npm bundle minified | N/A        | 126.43 KB |
| npm bundle gzip     | N/A        | 36.38 KB  |
| npm bundle brotli   | N/A        | 31.23 KB  |
| Total transfer size | 1443.25 KB | 36.38 KB  |

---

### Load Performance - Mostly Incomplete Data

| Metric                | Journey   | TinyTS                      |
| --------------------- | --------- | --------------------------- |
| WASM fetch time       | 30.79 ms  | N/A                         |
| WASM compile time     | 2.50 ms   | N/A                         |
| WASM instantiate time | 1.55 ms   | N/A                         |
| JS parse + execute    | N/A       | `PerformanceResourceTiming` |
| Time to first frame   | 2005.8 ms | 2544.8 ms                   |
| Time to interactive   | N/A       | N/A                         |

---

### Runtime Memory

| Metric                     | Journey  | TinyTS    |
| -------------------------- | -------- | --------- |
| WASM linear memory initial | 66.58 MB | N/A       |
| WASM linear memory at 65k  | 67.12 MB | N/A       |
| JS heap at idle            | 66.58 MB | 7.72 MB   |
| JS heap at 65k entities    | 67.12 MB | 33.87 MB  |
| JS heap after stop         | 50.16 MB | 115.12 MB |

---

## Engine Deep Dive

### Journey Engine (Rust/WASM)

| Aspect           | Details                                                 |
| ---------------- | ------------------------------------------------------- |
| **Language**     | Rust -> WASM via `wasm-pack`                            |
| **Renderer**     | wGPU batched sprite rendering with bloom post-process   |
| **Game Loop**    | `GameApp` trait with fixed-timestep accumulator         |
| **Physics**      | Swept AABB, spatial grid, collision layers, box volumes |
| **UI**           | `egui` immediate-mode UI                                |
| **Audio**        | `journey-sound` synthesis, envelopes, patches           |
| **Sequencer**    | Transport, tracks, Euclidean patterns, Markov/LFSR      |
| **Post-Process** | Shader bloom via `BloomSettings`                        |
| **Math**         | `glam` vectors and noise helpers                        |
| **Perf API**     | `ctx.perf()`, `FrameStats`, `ctx.average_fps()`         |
| **Memory Model** | WASM linear memory, no JS GC for engine allocations     |
| **WASM Hooks**   | `wasm_ready_event()` and `wasm-bindgen` JS interop      |

### TinyTS (TypeScript)

| Aspect           | Details                                                         |
| ---------------- | --------------------------------------------------------------- |
| **Language**     | TypeScript, zero runtime deps                                   |
| **Renderer**     | WebGPU, WebGL2, and Canvas2D backends                           |
| **Game Loop**    | `engineStart(config)` with fixed-timestep accumulator           |
| **Physics**      | Swept AABB, tilemap collision, spatial grid, verlet helpers     |
| **ECS**          | Registry, views, pooling, serialization, parent-child hierarchy |
| **Audio**        | ADSR synth, voice stealing, spatial audio, sequencer            |
| **Post-Process** | Bloom, color grade, vignette, grain, atmosphere/fog             |
| **Particles**    | Pooled emitters, lifecycle, shapes, blending, prewarm           |
| **Procedural**   | Runtime textures and procedural shape helpers                   |
| **Framebuffers** | Offscreen rendering via frame buffer helpers                    |
| **Input**        | Keyboard, mouse, gamepad, touch, actions, on-screen controls    |
| **Perf API**     | `stats` and `getRendererStats()`                                |
| **Memory Model** | JavaScript heap with V8 GC; pooling reduces allocation pressure |

---

## Proposed Plan

### Suite 1: Particle Stress

| Parameter            | Value                               |
| -------------------- | ----------------------------------- |
| Entity counts        | 1024 / 8192 / 16384 / 32768 / 65536 |
| Collision modes      | none / aabb / fast                  |
| Warmup               | 5 seconds                           |
| Recording            | 30 seconds                          |
| Spawn rate           | `entityTarget / 10` per second      |
| **Total conditions** | 15 per engine                       |

### Suite 2: Rendering + Post-FX Stress

| Test                     | Description                                                                   |
| ------------------------ | ----------------------------------------------------------------------------- |
| **Rect flood**           | Draw 1k-32k filled rects per frame. Measures raw draw throughput.             |
| **Mixed shapes**         | Draw rects, lines, and circles. Measures batch breaks from shape switching.   |
| **Texture sprites**      | Draw textured sprites from a procedural texture. Measures texture batching.   |
| **Post-processing load** | Run 16k particles with bloom enabled. Measures GPU post-processing cost.      |
| **Post-FX stack**        | TinyTS-only full post stack: bloom, color grade, vignette, grain, atmosphere. |

### Suite 3: Audio + Sequencer Stress

| Test                   | Description                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------- |
| **Polyphony flood**    | Trigger 4-64 simultaneous synth voices. Measures audio/frame-time impact.          |
| **Sequencer playback** | Run 4 tracks at 120/180/240 BPM while rendering 8k particles. Measures mixed load. |

### Suite 4: ECS + Verlet Stress

#### 4a: ECS Stress

TinyTS-only. Journey uses direct `Vec` management instead of an ECS.

| Test                 | Description                                                       |
| -------------------- | ----------------------------------------------------------------- |
| **Entity churn**     | Create/destroy 1000 entities per frame with 3 components each.    |
| **View query**       | Query `Position + Velocity + Health` across 10k/30k/60k entities. |
| **Hierarchy stress** | Build 10k parent-child entities and destroy subtrees.             |

#### 4b: Verlet Physics Stress

| Test                  | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| **Rope stress**       | Simulate 10/50/100/200 ropes with 20 points and 8 constraint passes.     |
| **Point mass stress** | Simulate 1k/4k/8k/16k free points with gravity and boundary constraints. |

---
