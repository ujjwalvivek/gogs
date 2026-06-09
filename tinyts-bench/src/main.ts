import {
  engineStart,
  engineStop,
  vec2,
  Vec2,
  clear,
  Color,
  drawRect,
  drawLine,
  drawCircle,
  drawSprite,
  createTexture,
  getRendererStats,
  getActiveRenderer,
  playSound,
  unlockAudio,
  stopSoundsWithTag,
  Sequencer,
  Pattern,
  Registry,
  createVerletPoint,
  createVerletRope,
  verletIntegrate,
  updateVerletRope,
  VerletPoint,
  VerletRope,
} from "@ujjwalvivek/tinyts";

import {
  BenchFrame,
  BenchCondition,
  BenchmarkRun,
  Renderer,
  LoadProfile,
  MemoryProfile,
  BenchmarkProfile,
} from "../../shared/schema";

import {
  buildSequence,
  normalizeBenchmarkProfile,
  SequenceCondition,
} from "../../shared/sequence";

const urlParams = new URLSearchParams(window.location.search);
const forcedRenderer = urlParams.get("renderer");
const forceWebGL2 = forcedRenderer === "webgl2";
const profile: BenchmarkProfile = normalizeBenchmarkProfile(
  urlParams.get("profile"),
);

const SEQUENCE = buildSequence("tinyts", profile);

const loadProfile: LoadProfile = {
  jsParseDurationMs: 0,
  timeToFirstFrameMs: 0,
  timeToInteractiveMs: 0,
};

try {
  const perfEntries = performance.getEntriesByType("resource");
  const selfEntry = perfEntries.find(
    (e) => e.name.includes("main.ts") || e.name.includes("index.html"),
  ) as PerformanceResourceTiming;
  if (selfEntry) {
    loadProfile.jsParseDurationMs = selfEntry.duration;
  }
} catch (e) {}

let firstFrameTime: number | null = null;
const engineStartRealTime = performance.now();

function getHeapSize(): number | undefined {
  if (typeof performance !== "undefined" && (performance as any).memory) {
    return (performance as any).memory.usedJSHeapSize;
  }
  return undefined;
}

const memoryProfile: MemoryProfile = {
  jsHeapAtIdleBytes: getHeapSize(),
  jsHeapAt65kBytes: 0,
  jsHeapAfterStopBytes: 0,
};

async function getGPUInfo(): Promise<string> {
  if ((navigator as any).gpu && !forceWebGL2) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      const info = await adapter?.requestAdapterInfo();
      return info?.device ?? "webgpu-unknown";
    } catch {
      return "webgpu-unavailable";
    }
  }
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) return "unknown";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "webgl2-unknown";
}

async function runBenchmark() {
  const st = document.getElementById("status-text");
  if (st) st.style.display = "none";
  await new Promise((r) => setTimeout(r, 500));
  memoryProfile.jsHeapAtIdleBytes = getHeapSize();

  const allConditions: BenchCondition[] = [];
  let conditionIndex = 0;

  for (const condition of SEQUENCE) {
    conditionIndex++;
    updateHarnessProgress(condition, conditionIndex, SEQUENCE.length, 0);
    const frames = await runCondition(
      condition,
      conditionIndex,
      SEQUENCE.length,
    );
    allConditions.push({
      suiteId: condition.suiteId,
      conditionName: condition.conditionName,
      workloadKind: condition.workloadKind,
      entityTarget: condition.entityTarget,
      collisionMode: condition.collisionMode,
      spawnRate: condition.spawnRate,
      warmupSeconds: condition.warmupSeconds,
      durationSeconds: condition.durationSeconds,
      notes: condition.notes,
      frames,
    });
  }

  memoryProfile.jsHeapAfterStopBytes = getHeapSize();

  const run: BenchmarkRun = {
    benchmarkVersion: "v1",
    profile,
    engine: "tinyts",
    renderer: forceWebGL2
      ? "webgl2"
      : (getActiveRenderer() as any as Renderer) || "webgl2",
    rendererForced: forceWebGL2,
    entityCap: 65536,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    gpuRenderer: await getGPUInfo(),
    recordedAt: new Date().toISOString(),
    conditionCount: allConditions.length,
    conditions: allConditions,
    loadProfile,
    memoryProfile,
  };

  const peak65kCond = allConditions.find((c) => c.entityTarget === 65536);
  if (peak65kCond && peak65kCond.frames.length > 0) {
    const lastFrame = peak65kCond.frames[peak65kCond.frames.length - 1];
    memoryProfile.jsHeapAt65kBytes = lastFrame.jsHeapBytes;
  }

  if (window.opener) {
    window.opener.postMessage(
      {
        type: "BENCH_COMPLETE",
        payload: run,
      },
      "*",
    );
  } else {
    const blob = new Blob([JSON.stringify(run, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tinyts_run_${forceWebGL2 ? "webgl2" : "best"}.json`;
    a.click();
  }
}

function updateHarnessProgress(
  condition: SequenceCondition,
  index: number,
  total: number,
  framesCollected: number,
) {
  if (window.opener) {
    window.opener.postMessage(
      {
        type: "BENCH_PROGRESS",
        engine: "tinyts",
        conditionIndex: index,
        totalConditions: total,
        framesCollected,
        currentCondition: condition.conditionName,
      },
      "*",
    );
  }
}

interface BenchParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: Color;
}

const GRID_CELL_SIZE = 4;
const width = 640;
const height = 360;
const cols = Math.ceil(width / GRID_CELL_SIZE);
const rows = Math.ceil(height / GRID_CELL_SIZE);
const cellCount = cols * rows;
const gridHeads = new Int32Array(cellCount);
const gridNext = new Int32Array(65536);

let proceduralTexture: HTMLCanvasElement | null = null;
function getProceduralTexture() {
  if (!proceduralTexture) {
    proceduralTexture = createTexture(
      (ctx, w, h) => {
        ctx.fillStyle = "#ff5555";
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(w * 0.35, h * 0.35, 1.5, 0, Math.PI * 2);
        ctx.arc(w * 0.65, h * 0.35, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w * 0.25, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();
      },
      "smiley",
      16,
    );
  }
  return proceduralTexture;
}

class EcsPosition {
  x = 0;
  y = 0;
  init(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
class EcsVelocity {
  x = 0;
  y = 0;
  init(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
class EcsHealth {
  hp = 0;
  init(hp: number) {
    this.hp = hp;
  }
}

async function runCondition(
  condition: SequenceCondition,
  index: number,
  total: number,
): Promise<BenchFrame[]> {
  return new Promise((resolve) => {
    const frames: BenchFrame[] = [];
    let elapsed = 0;
    let recording = false;
    let spawnAccumulator = 0;
    let lastTime = performance.now();
    let handle: ReturnType<typeof engineStart>;

    let ecsRegistry: Registry | null = null;

    let verletRopes: VerletRope[] = [];
    let verletPoints: VerletPoint[] = [];

    let audioSequencer: Sequencer | null = null;

    const particles: BenchParticle[] = [];
    const rects: {
      x: number;
      y: number;
      w: number;
      h: number;
      vx: number;
      vy: number;
      color: Color;
    }[] = [];
    const shapes: {
      type: "rect" | "line" | "circle";
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: Color;
    }[] = [];

    function setupCondition() {
      if (condition.suiteId === "rendering") {
        if (condition.conditionName.startsWith("render_rect_flood")) {
          for (let i = 0; i < condition.entityTarget; i++) {
            rects.push({
              x: Math.random() * width,
              y: Math.random() * height,
              w: 4 + Math.random() * 12,
              h: 4 + Math.random() * 12,
              vx: -50 + Math.random() * 100,
              vy: -50 + Math.random() * 100,
              color: Color.fromHSL(Math.random() * 360, 0.7, 0.5),
            });
          }
        } else if (condition.conditionName.startsWith("render_mixed_shapes")) {
          const types: ("rect" | "line" | "circle")[] = [
            "rect",
            "line",
            "circle",
          ];
          for (let i = 0; i < condition.entityTarget; i++) {
            shapes.push({
              type: types[i % 3],
              x: Math.random() * width,
              y: Math.random() * height,
              vx: -50 + Math.random() * 100,
              vy: -50 + Math.random() * 100,
              color: Color.fromHSL(Math.random() * 360, 0.7, 0.5),
            });
          }
        } else if (
          condition.conditionName.startsWith("render_texture_sprites")
        ) {
          for (let i = 0; i < condition.entityTarget; i++) {
            rects.push({
              x: Math.random() * width,
              y: Math.random() * height,
              w: 8,
              h: 8,
              vx: -60 + Math.random() * 120,
              vy: -60 + Math.random() * 120,
              color: Color.fromHSL(Math.random() * 360, 0.7, 0.5),
            });
          }
        } else if (
          condition.conditionName.startsWith("render_bloom") ||
          condition.conditionName.startsWith("render_post_fx_stack")
        ) {
          for (let i = 0; i < condition.entityTarget; i++) {
            rects.push({
              x: Math.random() * width,
              y: Math.random() * height,
              w: 4,
              h: 4,
              vx: -80 + Math.random() * 160,
              vy: -80 + Math.random() * 160,
              color: Color.fromHSL(Math.random() * 360, 0.7, 0.5),
            });
          }
        }
      } else if (condition.suiteId === "audio") {
        for (let i = 0; i < 8192; i++) {
          particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: -70 + Math.random() * 140,
            vy: -70 + Math.random() * 140,
            color: Color.fromHSL(i % 360, 0.8, 0.5),
          });
        }

        if (condition.conditionName.startsWith("audio_polyphony")) {
          try {
            unlockAudio();
          } catch (e) {}
        } else if (condition.conditionName.startsWith("audio_sequencer")) {
          const bpm = condition.extraParam as number;
          audioSequencer = new Sequencer(bpm);
          audioSequencer.addPattern(
            new Pattern(
              "kick",
              [
                { beat: 0, note: 36, duration: 1 },
                { beat: 1, note: 36, duration: 1 },
                { beat: 2, note: 36, duration: 1 },
                { beat: 3, note: 36, duration: 1 },
              ],
              1,
            ),
          );
          audioSequencer.addPattern(
            new Pattern(
              "snare",
              [
                { beat: 1, note: 40, duration: 1 },
                { beat: 3, note: 40, duration: 1 },
              ],
              1,
            ),
          );
          audioSequencer.addPattern(
            new Pattern(
              "hihat",
              [
                { beat: 0.5, note: 42, duration: 0.5 },
                { beat: 1.5, note: 42, duration: 0.5 },
                { beat: 2.5, note: 42, duration: 0.5 },
                { beat: 3.5, note: 42, duration: 0.5 },
              ],
              1,
            ),
          );
          audioSequencer.addPattern(
            new Pattern(
              "melody",
              [
                { beat: 0, note: 60, duration: 1 },
                { beat: 1, note: 64, duration: 1 },
                { beat: 2, note: 67, duration: 1 },
                { beat: 3, note: 72, duration: 1 },
              ],
              1,
            ),
          );

          audioSequencer.addTrack({
            pattern: "kick",
            wave: "triangle",
            volume: 0.001,
          });
          audioSequencer.addTrack({
            pattern: "snare",
            wave: "noise",
            volume: 0.001,
          });
          audioSequencer.addTrack({
            pattern: "hihat",
            wave: "noise",
            volume: 0.001,
          });
          audioSequencer.addTrack({
            pattern: "melody",
            wave: "sine",
            volume: 0.001,
          });
          audioSequencer.play();
        }
      } else if (condition.suiteId === "ecs_verlet") {
        if (condition.conditionName.startsWith("verlet_ropes")) {
          for (let i = 0; i < condition.entityTarget; i++) {
            const ropeX = Math.random() * width;
            verletRopes.push(createVerletRope(ropeX, 10, 20, 10, true));
          }
        } else if (condition.conditionName.startsWith("verlet_points")) {
          for (let i = 0; i < condition.entityTarget; i++) {
            verletPoints.push(
              createVerletPoint(
                Math.random() * width,
                Math.random() * height,
                false,
              ),
            );
          }
        } else if (condition.conditionName.startsWith("ecs_churn")) {
          ecsRegistry = new Registry();
          ecsRegistry.registerComponentType("EcsPosition", EcsPosition);
          ecsRegistry.registerComponentType("EcsVelocity", EcsVelocity);
          ecsRegistry.registerComponentType("EcsHealth", EcsHealth);
        } else if (condition.conditionName.startsWith("ecs_view_query")) {
          ecsRegistry = new Registry();
          ecsRegistry.registerComponentType("EcsPosition", EcsPosition);
          ecsRegistry.registerComponentType("EcsVelocity", EcsVelocity);
          ecsRegistry.registerComponentType("EcsHealth", EcsHealth);
          for (let i = 0; i < condition.entityTarget; i++) {
            const ent = ecsRegistry.createEntity();
            ecsRegistry.addComponent(
              ent,
              EcsPosition,
              ecsRegistry.obtain(
                EcsPosition,
                Math.random() * width,
                Math.random() * height,
              ),
            );
            ecsRegistry.addComponent(
              ent,
              EcsVelocity,
              ecsRegistry.obtain(
                EcsVelocity,
                -50 + Math.random() * 100,
                -50 + Math.random() * 100,
              ),
            );
            ecsRegistry.addComponent(
              ent,
              EcsHealth,
              ecsRegistry.obtain(EcsHealth, 100),
            );
          }
        } else if (condition.conditionName.startsWith("ecs_hierarchy")) {
          ecsRegistry = new Registry();
          const root = ecsRegistry.createEntity();
          const branchCount = 10;
          const leafCount = 999;
          for (let b = 0; b < branchCount; b++) {
            const branch = ecsRegistry.createEntity();
            ecsRegistry.setParent(branch, root);
            for (let l = 0; l < leafCount; l++) {
              const leaf = ecsRegistry.createEntity();
              ecsRegistry.setParent(leaf, branch);
            }
          }
        }
      }
    }

    const config: any = {
      size: { width, height },
      scaleMode: "stretch",
      pixelated: true,
      webgpu: !forceWebGL2,
      webgl: true,
      fixedHz: 60,

      update(dt: number) {
        const now = performance.now();
        elapsed += dt;

        if (condition.suiteId === "particles") {
          if (particles.length < condition.entityTarget) {
            spawnAccumulator += (condition.spawnRate || 0) * dt;
            const toSpawn = Math.floor(spawnAccumulator);
            spawnAccumulator -= toSpawn;
            for (
              let i = 0;
              i < toSpawn && particles.length < condition.entityTarget;
              i++
            ) {
              particles.push({
                x: width / 2 + (Math.random() - 0.5) * 50,
                y: height / 2 + (Math.random() - 0.5) * 50,
                vx: -80 + Math.random() * 160,
                vy: -80 + Math.random() * 160,
                color: Color.fromHSL((particles.length * 15) % 360, 0.8, 0.5),
              });
            }
          }

          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (p.x < 2) {
              p.x = 2;
              p.vx = Math.abs(p.vx);
            } else if (p.x > width - 2) {
              p.x = width - 2;
              p.vx = -Math.abs(p.vx);
            }
            if (p.y < 2) {
              p.y = 2;
              p.vy = Math.abs(p.vy);
            } else if (p.y > height - 2) {
              p.y = height - 2;
              p.vy = -Math.abs(p.vy);
            }
          }

          if (condition.collisionMode && condition.collisionMode !== "none") {
            gridHeads.fill(-1);
            for (let i = 0; i < particles.length; i++) {
              const p = particles[i];
              const cx = Math.max(
                0,
                Math.min(cols - 1, Math.floor(p.x / GRID_CELL_SIZE)),
              );
              const cy = Math.max(
                0,
                Math.min(rows - 1, Math.floor(p.y / GRID_CELL_SIZE)),
              );
              const cell = cy * cols + cx;
              gridNext[i] = gridHeads[cell];
              gridHeads[cell] = i;
            }

            for (let i = 0; i < particles.length; i++) {
              const a = particles[i];
              const cx = Math.max(
                0,
                Math.min(cols - 1, Math.floor(a.x / GRID_CELL_SIZE)),
              );
              const cy = Math.max(
                0,
                Math.min(rows - 1, Math.floor(a.y / GRID_CELL_SIZE)),
              );

              const minX = Math.max(0, cx - 1);
              const maxX = Math.min(cols - 1, cx + 1);
              const minY = Math.max(0, cy - 1);
              const maxY = Math.min(rows - 1, cy + 1);

              for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                  let cursor = gridHeads[y * cols + x];
                  while (cursor !== -1) {
                    const j = cursor;
                    cursor = gridNext[j];
                    if (j <= i) continue;

                    const b = particles[j];
                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    const overlapX = 4 - Math.abs(dx);
                    const overlapY = 4 - Math.abs(dy);

                    if (overlapX > 0 && overlapY > 0) {
                      if (overlapX < overlapY) {
                        const sign = dx >= 0 ? 1 : -1;
                        a.x += overlapX * 0.5 * sign;
                        b.x -= overlapX * 0.5 * sign;
                        const tmp = a.vx;
                        a.vx = b.vx;
                        b.vx = tmp;
                      } else {
                        const sign = dy >= 0 ? 1 : -1;
                        a.y += overlapY * 0.5 * sign;
                        b.y -= overlapY * 0.5 * sign;
                        const tmp = a.vy;
                        a.vy = b.vy;
                        b.vy = tmp;
                      }
                    }
                  }
                }
              }
            }
          }
        } else if (condition.suiteId === "rendering") {
          if (rects.length > 0) {
            for (const r of rects) {
              r.x += r.vx * dt;
              r.y += r.vy * dt;
              if (r.x < 0) {
                r.x = 0;
                r.vx = Math.abs(r.vx);
              } else if (r.x > width - r.w) {
                r.x = width - r.w;
                r.vx = -Math.abs(r.vx);
              }
              if (r.y < 0) {
                r.y = 0;
                r.vy = Math.abs(r.vy);
              } else if (r.y > height - r.h) {
                r.y = height - r.h;
                r.vy = -Math.abs(r.vy);
              }
            }
          } else if (shapes.length > 0) {
            for (const s of shapes) {
              s.x += s.vx * dt;
              s.y += s.vy * dt;
              if (s.x < 4) {
                s.x = 4;
                s.vx = Math.abs(s.vx);
              } else if (s.x > width - 4) {
                s.x = width - 4;
                s.vx = -Math.abs(s.vx);
              }
              if (s.y < 4) {
                s.y = 4;
                s.vy = Math.abs(s.vy);
              } else if (s.y > height - 4) {
                s.y = height - 4;
                s.vy = -Math.abs(s.vy);
              }
            }
          }
        } else if (condition.suiteId === "audio") {
          for (const p of particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.x < 2) {
              p.x = 2;
              p.vx = Math.abs(p.vx);
            } else if (p.x > width - 2) {
              p.x = width - 2;
              p.vx = -Math.abs(p.vx);
            }
            if (p.y < 2) {
              p.y = 2;
              p.vy = Math.abs(p.vy);
            } else if (p.y > height - 2) {
              p.y = height - 2;
              p.vy = -Math.abs(p.vy);
            }
          }

          if (condition.conditionName.startsWith("audio_polyphony")) {
            const voiceCount = condition.extraParam as number;
            for (let i = 0; i < voiceCount; i++) {
              playSound({
                wave: "sine",
                frequency: 220 + Math.random() * 880,
                attack: 0.001,
                decay: 0.015,
                sustain: 0.0001,
                hold: 0.02,
                release: 0.03,
                volume: 0.0001,
                tag: "bench-polyphony",
              });
            }
          } else if (audioSequencer) {
            audioSequencer.update(dt);
          }
        } else if (condition.suiteId === "ecs_verlet") {
          if (condition.conditionName.startsWith("verlet_ropes")) {
            const gravityVec = vec2(0, 400);
            for (const rope of verletRopes) {
              updateVerletRope(rope, gravityVec, 1, 8, dt);
              for (const pt of rope.points) {
                if (pt.pos.y > height) pt.pos.y = height;
                if (pt.pos.x < 0) pt.pos.x = 0;
                if (pt.pos.x > width) pt.pos.x = width;
              }
            }
          } else if (condition.conditionName.startsWith("verlet_points")) {
            const gravityVec = vec2(0, 400);
            for (const pt of verletPoints) {
              verletIntegrate(pt, gravityVec, dt);
              if (pt.pos.y > height) {
                pt.pos.y = height;
                pt.oldPos.y = pt.pos.y;
              }
              if (pt.pos.x < 0) {
                pt.pos.x = 0;
                pt.oldPos.x = pt.pos.x;
              }
              if (pt.pos.x > width) {
                pt.pos.x = width;
                pt.oldPos.x = pt.pos.x;
              }
            }
          } else if (ecsRegistry) {
            if (condition.conditionName.startsWith("ecs_churn")) {
              for (let i = 0; i < 1000; i++) {
                const ent = ecsRegistry.createEntity();
                ecsRegistry.addComponent(
                  ent,
                  EcsPosition,
                  ecsRegistry.obtain(EcsPosition, 0, 0),
                );
                ecsRegistry.addComponent(
                  ent,
                  EcsVelocity,
                  ecsRegistry.obtain(EcsVelocity, 1, 1),
                );
                ecsRegistry.addComponent(
                  ent,
                  EcsHealth,
                  ecsRegistry.obtain(EcsHealth, 100),
                );
              }
              const all = ecsRegistry.view(EcsPosition, EcsVelocity, EcsHealth);
              for (const e of all) {
                ecsRegistry.destroyEntity(e);
              }
            } else if (condition.conditionName.startsWith("ecs_view_query")) {
              const entities = ecsRegistry.view(
                EcsPosition,
                EcsVelocity,
                EcsHealth,
              );
              for (const e of entities) {
                const pos = ecsRegistry.getComponent(e, EcsPosition)!;
                const vel = ecsRegistry.getComponent(e, EcsVelocity)!;
                pos.x += vel.x * dt;
                pos.y += vel.y * dt;
                if (pos.x < 0) {
                  pos.x = 0;
                  vel.x = Math.abs(vel.x);
                } else if (pos.x > width) {
                  pos.x = width;
                  vel.x = -Math.abs(vel.x);
                }
                if (pos.y < 0) {
                  pos.y = 0;
                  vel.y = Math.abs(vel.y);
                } else if (pos.y > height) {
                  pos.y = height;
                  vel.y = -Math.abs(vel.y);
                }
              }
            } else if (condition.conditionName.startsWith("ecs_hierarchy")) {
              for (let i = 0; i < 100; i++) {
                const child = Math.floor(Math.random() * 10000) + 1;
                const parent = Math.floor(Math.random() * 10000) + 1;
                if (child !== parent) {
                  ecsRegistry.setParent(child, parent);
                }
              }
            }
          }
        }

        if (elapsed >= condition.warmupSeconds && !recording) {
          recording = true;
          elapsed = 0;
        }

        if (recording) {
          const frameTime = now - lastTime;

          let entityCount = 0;
          if (condition.suiteId === "particles") {
            entityCount = particles.length;
          } else if (condition.suiteId === "rendering") {
            entityCount = rects.length || shapes.length;
          } else if (condition.suiteId === "audio") {
            entityCount = particles.length;
          } else if (condition.suiteId === "ecs_verlet") {
            if (condition.conditionName.startsWith("verlet_ropes")) {
              entityCount = verletRopes.length;
            } else if (condition.conditionName.startsWith("verlet_points")) {
              entityCount = verletPoints.length;
            } else if (ecsRegistry) {
              entityCount = condition.entityTarget;
            }
          }

          const rStats = getRendererStats();
          const frame: BenchFrame = {
            frameTimeMs: frameTime,
            entityCount,
            timestamp: now,
            jsHeapBytes: getHeapSize(),
            drawCalls: rStats?.drawCalls,
            batchFlushes: rStats?.batchFlushes,
            quadCount: rStats?.quads,
          };
          frames.push(frame);

          if (firstFrameTime === null) {
            firstFrameTime = now;
            loadProfile.timeToFirstFrameMs =
              firstFrameTime - engineStartRealTime;
            loadProfile.timeToInteractiveMs =
              loadProfile.timeToFirstFrameMs + 50;
          }

          if (frames.length % 30 === 0) {
            updateHarnessProgress(condition, index, total, frames.length);
          }
        }

        lastTime = now;

        if (recording && elapsed >= condition.durationSeconds) {
          audioSequencer?.stop();
          stopSoundsWithTag("bench-polyphony");
          engineStop();
          resolve(frames);
        }
      },

      render() {
        clear(Color.fromHSL(235, 0.45, 0.05));

        if (condition.suiteId === "particles") {
          for (const p of particles) {
            drawRect(vec2(p.x - 2, p.y - 2), vec2(4, 4), p.color);
          }
        } else if (condition.suiteId === "rendering") {
          if (condition.conditionName.startsWith("render_texture_sprites")) {
            const tex = getProceduralTexture();
            for (const r of rects) {
              drawSprite(tex, vec2(r.x, r.y), vec2(r.w, r.h));
            }
          } else if (rects.length > 0) {
            for (const r of rects) {
              drawRect(vec2(r.x, r.y), vec2(r.w, r.h), r.color);
            }
          } else if (shapes.length > 0) {
            for (const s of shapes) {
              if (s.type === "rect") {
                drawRect(vec2(s.x - 4, s.y - 4), vec2(8, 8), s.color);
              } else if (s.type === "line") {
                drawLine(
                  vec2(s.x - 4, s.y - 4),
                  vec2(s.x + 4, s.y + 4),
                  s.color,
                );
              } else if (s.type === "circle") {
                drawCircle(vec2(s.x, s.y), 4, s.color);
              }
            }
          }
        } else if (condition.suiteId === "audio") {
          for (const p of particles) {
            drawRect(vec2(p.x - 2, p.y - 2), vec2(4, 4), p.color);
          }
        } else if (condition.suiteId === "ecs_verlet") {
          if (condition.conditionName.startsWith("verlet_ropes")) {
            for (const rope of verletRopes) {
              for (let i = 0; i < rope.points.length - 1; i++) {
                const p1 = rope.points[i].pos;
                const p2 = rope.points[i + 1].pos;
                drawLine(
                  vec2(p1.x, p1.y),
                  vec2(p2.x, p2.y),
                  Color.fromHSL(120, 0.8, 0.6),
                );
              }
            }
          } else if (condition.conditionName.startsWith("verlet_points")) {
            for (const pt of verletPoints) {
              drawRect(
                vec2(pt.pos.x - 1, pt.pos.y - 1),
                vec2(2, 2),
                Color.fromHSL(180, 0.9, 0.5),
              );
            }
          } else if (
            ecsRegistry &&
            condition.conditionName.startsWith("ecs_view_query")
          ) {
            const entities = ecsRegistry.view(EcsPosition);
            for (const e of entities) {
              const pos = ecsRegistry.getComponent(e, EcsPosition)!;
              drawRect(
                vec2(pos.x - 2, pos.y - 2),
                vec2(4, 4),
                Color.fromHSL(40, 0.9, 0.5),
              );
            }
          }
        }
      },
    };

    if (condition.conditionName === "render_bloom_16384") {
      config.post = {
        bloom: { enabled: true, threshold: 0.5, intensity: 0.8, passes: 5 },
      };
    } else if (condition.conditionName === "render_post_fx_stack_16384") {
      config.post = {
        bloom: { enabled: true, threshold: 0.5, intensity: 0.8, passes: 5 },
        colorGrade: {
          enabled: true,
          contrast: 1.1,
          saturation: 1.1,
          gamma: 1.0,
          temperature: 0.1,
          tint: 0.0,
        },
        vignette: { enabled: true, intensity: 0.5, smoothness: 0.5 },
        grain: { enabled: true, amount: 0.05, speed: 1.0 },
        atmosphere: {
          enabled: true,
          fogEnabled: true,
          fogDensity: 1.0,
          fogColor: [0.1, 0.1, 0.1],
        },
      };
    }

    setupCondition();
    handle = engineStart(config);

    const container = document.querySelector("#app");
    if (container) {
      container.appendChild(handle.canvasManager.canvas);
      if (handle.overlayCanvas) {
        container.appendChild(handle.overlayCanvas);
      }
    }
  });
}

window.addEventListener("message", (e) => {
  if (e.data?.type === "BENCH_START") {
    runBenchmark();
  }
});

if (window.opener) {
  window.opener.postMessage({ type: "BENCH_LOADED", engine: "tinyts" }, "*");
} else {
  runBenchmark();
}
