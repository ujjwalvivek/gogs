export type Engine = "journey" | "tinyts";
export type BenchmarkProfile = "smoke" | "standard" | "full";
export type CollisionMode = "none" | "grid";
export type Renderer = "wgpu" | "webgpu" | "webgl2" | "canvas2d";
export type WorkloadKind =
  | "comparable"
  | "engine-feature"
  | "tinyts-feature"
  | "journey-feature"
  | "exploratory";

export interface BenchFrame {
  frameTimeMs: number;
  entityCount: number;
  timestamp: number;
  jsHeapBytes?: number;
  drawCalls?: number;
  batchFlushes?: number;
  quadCount?: number;
}

export interface BenchCondition {
  suiteId: string;
  conditionName: string;
  workloadKind: WorkloadKind;
  entityTarget: number;
  collisionMode?: CollisionMode;
  spawnRate?: number;
  warmupSeconds: number;
  durationSeconds: number;
  notes?: string;
  frames: BenchFrame[];
}

export interface LoadProfile {
  wasmFetchMs?: number; // Journey only
  wasmCompileMs?: number; // Journey only
  wasmInstantiateMs?: number; // Journey only
  jsParseDurationMs?: number; // TinyTS only
  timeToFirstFrameMs: number;
  timeToInteractiveMs: number;
}

export interface MemoryProfile {
  wasmLinearMemoryInitialBytes?: number;
  wasmLinearMemoryAt65kBytes?: number;
  jsHeapAtIdleBytes?: number;
  jsHeapAt65kBytes?: number;
  jsHeapAfterStopBytes?: number;
}

export interface BenchmarkRun {
  benchmarkVersion: "v1";
  profile: BenchmarkProfile;
  engine: Engine;
  renderer: Renderer;
  rendererForced: boolean;
  entityCap: number;
  platform: string;
  userAgent: string;
  gpuRenderer: string;
  recordedAt: string;
  conditionCount: number;
  conditions: BenchCondition[];
  loadProfile: LoadProfile;
  memoryProfile: MemoryProfile;
}
