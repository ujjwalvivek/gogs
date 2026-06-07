import {
  BenchmarkProfile,
  CollisionMode,
  Engine,
  WorkloadKind,
} from "./schema";

export interface SequenceCondition {
  suiteId: string;
  conditionName: string;
  workloadKind: WorkloadKind;
  entityTarget: number;
  collisionMode?: CollisionMode;
  spawnRate?: number;
  warmupSeconds: number;
  durationSeconds: number;
  extraParam?: string | number;
  notes?: string;
}

interface ProfileConfig {
  warmupSeconds: number;
  conditionSeconds: number;
  particleSeconds: number;
  particleCounts: number[];
  rectCounts: number[];
  polyphonyCounts: number[];
  sequencerBpms: number[];
  ropeCounts: number[];
  pointCounts: number[];
  tinytsEcsViewCounts: number[];
  includeTexture: boolean;
  includeBloom: boolean;
  includeMixedShapes: boolean;
  includePostFx: boolean;
  includeTinytsEcs: boolean;
}

export const DEFAULT_BENCHMARK_PROFILE: BenchmarkProfile = "standard";

const PROFILE_CONFIG: Record<BenchmarkProfile, ProfileConfig> = {
  smoke: {
    warmupSeconds: 1,
    conditionSeconds: 4,
    particleSeconds: 5,
    particleCounts: [8192, 32768],
    rectCounts: [8192],
    polyphonyCounts: [16],
    sequencerBpms: [180],
    ropeCounts: [50],
    pointCounts: [4096],
    tinytsEcsViewCounts: [10000],
    includeTexture: true,
    includeBloom: false,
    includeMixedShapes: false,
    includePostFx: false,
    includeTinytsEcs: true,
  },
  standard: {
    warmupSeconds: 2,
    conditionSeconds: 8,
    particleSeconds: 10,
    particleCounts: [8192, 32768, 65536],
    rectCounts: [8192, 16384, 32768],
    polyphonyCounts: [16, 64],
    sequencerBpms: [180],
    ropeCounts: [50, 200],
    pointCounts: [4096, 16384],
    tinytsEcsViewCounts: [30000],
    includeTexture: true,
    includeBloom: true,
    includeMixedShapes: false,
    includePostFx: false,
    includeTinytsEcs: true,
  },
  full: {
    warmupSeconds: 3,
    conditionSeconds: 12,
    particleSeconds: 15,
    particleCounts: [1024, 8192, 16384, 32768, 65536],
    rectCounts: [1024, 4096, 8192, 16384, 32768],
    polyphonyCounts: [4, 8, 16, 32, 64],
    sequencerBpms: [120, 180, 240],
    ropeCounts: [10, 50, 100, 200],
    pointCounts: [1024, 4096, 8192, 16384],
    tinytsEcsViewCounts: [10000, 30000, 60000],
    includeTexture: true,
    includeBloom: true,
    includeMixedShapes: true,
    includePostFx: true,
    includeTinytsEcs: true,
  },
};

export function normalizeBenchmarkProfile(
  value: string | null | undefined,
): BenchmarkProfile {
  if (value === "smoke" || value === "standard" || value === "full") {
    return value;
  }
  return DEFAULT_BENCHMARK_PROFILE;
}

function pushCondition(
  sequence: SequenceCondition[],
  config: ProfileConfig,
  condition: Omit<SequenceCondition, "warmupSeconds" | "durationSeconds"> & {
    warmupSeconds?: number;
    durationSeconds?: number;
  },
) {
  sequence.push({
    warmupSeconds: condition.warmupSeconds ?? config.warmupSeconds,
    durationSeconds: condition.durationSeconds ?? config.conditionSeconds,
    ...condition,
  });
}

export function buildSequence(
  engine: Engine = "tinyts",
  profile: BenchmarkProfile = DEFAULT_BENCHMARK_PROFILE,
): SequenceCondition[] {
  const config = PROFILE_CONFIG[profile];
  const sequence: SequenceCondition[] = [];

  const particleModes: CollisionMode[] = ["none", "grid"];
  for (const mode of particleModes) {
    for (const count of config.particleCounts) {
      pushCondition(sequence, config, {
        suiteId: "particles",
        conditionName: `particles_${mode}_${count}`,
        workloadKind: "comparable",
        entityTarget: count,
        collisionMode: mode,
        spawnRate: count / 4,
        durationSeconds: config.particleSeconds,
        notes:
          mode === "none"
            ? "Comparable particle update and rect rendering with wall bounce only."
            : "Comparable custom spatial-grid particle overlap solver. This is not Journey's swept AABB API.",
      });
    }
  }

  for (const count of config.rectCounts) {
    pushCondition(sequence, config, {
      suiteId: "rendering",
      conditionName: `render_rect_flood_${count}`,
      workloadKind: "comparable",
      entityTarget: count,
      notes: "Comparable moving filled-rect rendering workload.",
    });
  }

  if (config.includeMixedShapes) {
    for (const count of config.rectCounts) {
      pushCondition(sequence, config, {
        suiteId: "rendering",
        conditionName: `render_mixed_shapes_${count}`,
        workloadKind: "exploratory",
        entityTarget: count,
        notes:
          "Exploratory only: TinyTS draws multiple primitive types; Journey maps this to layered rect draws.",
      });
    }
  }

  if (config.includeTexture) {
    pushCondition(sequence, config, {
      suiteId: "rendering",
      conditionName: "render_texture_sprites_16384",
      workloadKind: "comparable",
      entityTarget: 16384,
      notes:
        "Comparable textured sprite submission path using generated/minimal texture assets.",
    });
  }

  if (config.includeBloom) {
    pushCondition(sequence, config, {
      suiteId: "rendering",
      conditionName: "render_bloom_16384",
      workloadKind: "engine-feature",
      entityTarget: 16384,
      notes:
        "Engine bloom/post-process probe. Comparable only as a high-level bloom stress signal.",
    });
  }

  if (engine === "tinyts" && config.includePostFx) {
    pushCondition(sequence, config, {
      suiteId: "rendering",
      conditionName: "render_post_fx_stack_16384",
      workloadKind: "tinyts-feature",
      entityTarget: 16384,
      notes:
        "TinyTS-only full post-FX stack: bloom, color grade, vignette, grain, atmosphere.",
    });
  }

  for (const count of config.polyphonyCounts) {
    pushCondition(sequence, config, {
      suiteId: "audio",
      conditionName: `audio_polyphony_${count}`,
      workloadKind: "engine-feature",
      entityTarget: 0,
      extraParam: count,
      notes:
        engine === "tinyts"
          ? "TinyTS synth voice creation through playSound at near-zero volume."
          : "Journey Resonance DSP sample generation on the main benchmark loop; no browser audio sink.",
    });
  }

  for (const bpm of config.sequencerBpms) {
    pushCondition(sequence, config, {
      suiteId: "audio",
      conditionName: `audio_sequencer_${bpm}`,
      workloadKind: "engine-feature",
      entityTarget: 8192,
      extraParam: bpm,
      notes:
        "Sequencer update plus 8k background particles. Audio output is not the primary metric.",
    });
  }

  for (const count of config.ropeCounts) {
    pushCondition(sequence, config, {
      suiteId: "ecs_verlet",
      conditionName: `verlet_ropes_${count}`,
      workloadKind: "engine-feature",
      entityTarget: count,
      notes:
        engine === "tinyts"
          ? "TinyTS Verlet rope helper workload."
          : "Journey-side equivalent Verlet algorithm, not a Journey engine API.",
    });
  }

  for (const count of config.pointCounts) {
    pushCondition(sequence, config, {
      suiteId: "ecs_verlet",
      conditionName: `verlet_points_${count}`,
      workloadKind: "engine-feature",
      entityTarget: count,
      notes:
        engine === "tinyts"
          ? "TinyTS Verlet point helper workload."
          : "Journey-side equivalent Verlet algorithm, not a Journey engine API.",
    });
  }

  if (engine === "tinyts" && config.includeTinytsEcs) {
    pushCondition(sequence, config, {
      suiteId: "ecs_verlet",
      conditionName: "ecs_churn_1000",
      workloadKind: "tinyts-feature",
      entityTarget: 1000,
      notes:
        "TinyTS Registry CPU-only entity create/query/destroy churn. Blank screen is expected.",
    });

    for (const count of config.tinytsEcsViewCounts) {
      pushCondition(sequence, config, {
        suiteId: "ecs_verlet",
        conditionName: `ecs_view_query_${count}`,
        workloadKind: "tinyts-feature",
        entityTarget: count,
        notes: "TinyTS Registry view query/update/render workload.",
      });
    }

    pushCondition(sequence, config, {
      suiteId: "ecs_verlet",
      conditionName: "ecs_hierarchy_10000",
      workloadKind: "tinyts-feature",
      entityTarget: 10000,
      notes:
        "TinyTS Registry CPU-only parent/child hierarchy mutation. Blank screen is expected.",
    });
  }

  return sequence;
}
