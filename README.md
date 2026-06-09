<!-- markdownlint-disable MD013 -->

# gogs (A Game of Games)

A sandboxed, sequential benchmarking harness for comparing Journey (Rust/WASM)
and TinyTS (TypeScript) game engines. Engines run in isolation,
produce standardized metric JSON, and compares them.

- Journey Engine: [https://docs.rs/journey-engine/1.3.0]
- Journey Sequencer: [https://docs.rs/journey-sequencer/1.3.0]
- Journey Sound: [https://docs.rs/journey-sound/1.3.0]
- TinyTS Docs: [https://tinyts.ujjwalvivek.com/]

## Build Pipeline

```bash
# Journey
cd journey-bench
wasm-pack build --target web --release
cd www && npx serve .

# TinyTS
cd tinyts-bench
npm install
npm run dev

# Bench Data
cd bench-data
npm install
npm run dev
```

## Benchmark Suites

- **Suite 1**: Particle Stress
- **Suite 2**: Rendering + Post-FX Stress
- **Suite 3**: Audio + Sequencer Stress
- **Suite 4**: ECS + Verlet Stress
- **Suite 5**: Physics + Collision Stress

### Flow

```bash
  → harness opens journey-bench in new window
  → journey-bench runs all conditions unattended
  → harness receives payload, closes journey window
  → harness opens tinyts-bench in new window
  → tinyts-bench runs all conditions unattended
  → harness receives payload, closes tinyts window
  → posts BenchmarkRun to harness opener via postMessage
  → harness renders all graphs
```

## Bundle & Load Analysis

### Binary Bundle Size

| Metric              | Journey    | TinyTS    |
| ------------------- | ---------- | --------- |
| Raw WASM binary     | 2990.69 KB | N/A       |
| JS glue code        | 96.47 KB   | N/A       |
| npm bundle minified | N/A        | 126.43 KB |
| npm bundle gzip     | N/A        | 36.38 KB  |
| npm bundle brotli   | N/A        | 31.23 KB  |
| Total transfer size | 1443.25 KB | 36.38 KB  |

### Load Performance

| Metric                | Journey   | TinyTS    |
| --------------------- | --------- | --------- |
| WASM fetch time       | 30.79 ms  | N/A       |
| WASM compile time     | 2.50 ms   | N/A       |
| WASM instantiate time | 1.55 ms   | N/A       |
| JS parse + execute    | N/A       | < 1 ms    |
| Time to first frame   | 2005.8 ms | 2544.8 ms |

### Runtime Memory

| Metric                  | Journey  | TinyTS    |
| ----------------------- | -------- | --------- |
| WASM memory initial     | 66.58 MB | N/A       |
| WASM memory at 65k      | 67.12 MB | N/A       |
| JS heap at idle         | 66.58 MB | 7.72 MB   |
| JS heap at 65k entities | 67.12 MB | 33.87 MB  |
| JS heap after stop      | 50.16 MB | 115.12 MB |

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

## Run Profiles

| Profile    | Purpose                | Typical use                                              |
| ---------- | ---------------------- | -------------------------------------------------------- |
| `smoke`    | Short sanity run       | Validate harness automation and exports                  |
| `standard` | Default run            | Compare core behavior without a 40 minute session        |
| `full`     | Longer exploratory run | Stress optional probes after the standard run looks sane |

## Feature Probes

- `render_bloom_16384`: engine bloom/post-processing probe.
- `audio_polyphony_*`: TinyTS uses `playSound`; Journey runs Resonance DSP samples without a browser audio sink.
- `audio_sequencer_*`: sequencer update plus 8k background particles.
- `verlet_*`: TinyTS uses its Verlet helpers; Journey uses an equivalent benchmark-side Verlet implementation.
- `ecs_*`: TinyTS-only Registry probes. Churn and hierarchy conditions are CPU-only, so blank screens are expected.
- `render_post_fx_stack_16384`: TinyTS-only full post-FX stack, available in `full`.

## Known Caveats

- Journey frame timing uses engine-reported frame time; TinyTS uses browser wall-clock delta. Acceptable for broad runs, not final instrumentation.
- The memory-over-time chart currently shows JS host heap samples. A sawtooth in Journey's JS host heap does not prove Rust/WASM allocation inside the engine; it may come from wrapper code, JS/WASM boundary conversion, metric collection, rendering glue, or JSON accumulation.

## Further Plan

The current smoke output validates automation and export shape only.Before anything, V3 requires:

- unified wall-clock timing around the update/render work unit in both engines
- separate frame pacing and work-duration charts
- separate JS heap and WASM linear-memory charts
- production-build load timing with cache mode recorded
- raw JSON retained for frame-level analysis
