use cadence::euclid::EuclideanPattern;
use cadence::markov::MarkovChain;
use cadence::sequencer::Sequencer;
use cadence::track::{Track, TrackEvent};
use engine::{
    BloomSettings, Context, FixedTime, GameAction, GameApp, Rect, RenderLayer, SceneParams, Vec2,
    egui,
};
use resonance::patch::{Patch, PatchVoice};
use serde::Serialize;
use std::cell::RefCell;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

const WIDTH: f32 = 640.0;
const HEIGHT: f32 = 360.0;
const GRID_CELL_SIZE: f32 = 4.0;
const COLS: usize = 160; // 640 / 4
const ROWS: usize = 90; // 360 / 4
const CELL_COUNT: usize = COLS * ROWS;

#[derive(Clone, Copy)]
pub struct LoaderTimings {
    pub wasm_fetch_ms: Option<f32>,
    pub wasm_compile_ms: Option<f32>,
    pub wasm_instantiate_ms: Option<f32>,
}

thread_local! {
    static LOADER_TIMINGS: RefCell<Option<LoaderTimings>> = RefCell::new(None);
}

pub fn set_loader_timings(wasm_fetch_ms: f32, wasm_compile_ms: f32, wasm_instantiate_ms: f32) {
    let timings = LoaderTimings {
        wasm_fetch_ms: clean_timing(wasm_fetch_ms),
        wasm_compile_ms: clean_timing(wasm_compile_ms),
        wasm_instantiate_ms: clean_timing(wasm_instantiate_ms),
    };

    LOADER_TIMINGS.with(|stored| {
        *stored.borrow_mut() = Some(timings);
    });
}

fn clean_timing(value: f32) -> Option<f32> {
    if value.is_finite() && value >= 0.0 {
        Some(value)
    } else {
        None
    }
}

fn get_loader_timings() -> Option<LoaderTimings> {
    LOADER_TIMINGS.with(|stored| *stored.borrow())
}

const DUMMY_PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
];

#[wasm_bindgen(inline_js = "
    export function get_gpu_renderer_js() {
        if (navigator.gpu) {
            return 'webgpu';
        }
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return 'unknown';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'webgl2-unknown';
    }
    export function get_js_heap_size_js() {
        if (typeof performance !== 'undefined' && performance.memory) {
            return performance.memory.usedJSHeapSize;
        }
        return 0;
    }
")]
extern "C" {
    fn get_gpu_renderer_js() -> String;
    fn get_js_heap_size_js() -> u32;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BenchAction {
    Dummy,
}

impl GameAction for BenchAction {
    fn count() -> usize {
        1
    }
    fn index(&self) -> usize {
        0
    }
    fn from_index(index: usize) -> Option<Self> {
        if index == 0 { Some(Self::Dummy) } else { None }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BenchFrame {
    pub frame_time_ms: f32,
    pub entity_count: u32,
    pub timestamp: f64,
    pub js_heap_bytes: Option<u32>,
    pub draw_calls: Option<u32>,
    pub batch_flushes: Option<u32>,
    pub quad_count: Option<u32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BenchCondition {
    pub suite_id: String,
    pub condition_name: String,
    pub workload_kind: String,
    pub entity_target: u32,
    pub collision_mode: Option<String>,
    pub spawn_rate: Option<f32>,
    pub warmup_seconds: f32,
    pub duration_seconds: f32,
    pub notes: Option<String>,
    pub frames: Vec<BenchFrame>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LoadProfile {
    pub wasm_fetch_ms: Option<f32>,
    pub wasm_compile_ms: Option<f32>,
    pub wasm_instantiate_ms: Option<f32>,
    pub time_to_first_frame_ms: f32,
    pub time_to_interactive_ms: f32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemoryProfile {
    pub wasm_linear_memory_initial_bytes: Option<u32>,
    pub wasm_linear_memory_at65k_bytes: Option<u32>,
    pub js_heap_at_idle_bytes: Option<u32>,
    pub js_heap_at65k_bytes: Option<u32>,
    pub js_heap_after_stop_bytes: Option<u32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkRun {
    pub benchmark_version: String,
    pub profile: String,
    pub engine: String,
    pub renderer: String,
    pub renderer_forced: bool,
    pub entity_cap: u32,
    pub platform: String,
    pub user_agent: String,
    pub gpu_renderer: String,
    pub recorded_at: String,
    pub condition_count: u32,
    pub conditions: Vec<BenchCondition>,
    pub load_profile: LoadProfile,
    pub memory_profile: MemoryProfile,
}

pub struct RustSequenceCondition {
    pub suite_id: &'static str,
    pub condition_name: String,
    pub workload_kind: &'static str,
    pub entity_target: u32,
    pub collision_mode: Option<String>,
    pub spawn_rate: Option<f32>,
    pub warmup_seconds: f32,
    pub duration_seconds: f32,
    pub extra_param: Option<f32>,
    pub notes: Option<&'static str>,
}

pub fn build_sequence(profile: &str) -> Vec<RustSequenceCondition> {
    let mut seq = Vec::new();

    let (
        warmup_seconds,
        condition_seconds,
        particle_seconds,
        particle_counts,
        rect_counts,
        polyphony_counts,
        sequencer_bpms,
        rope_counts,
        point_counts,
        include_texture,
        include_bloom,
        include_mixed_shapes,
    ): (
        f32,
        f32,
        f32,
        &[u32],
        &[u32],
        &[u32],
        &[u32],
        &[u32],
        &[u32],
        bool,
        bool,
        bool,
    ) = match profile {
        "smoke" => (
            1.0,
            4.0,
            5.0,
            &[8192, 32768],
            &[8192],
            &[16],
            &[180],
            &[50],
            &[4096],
            true,
            false,
            false,
        ),
        "full" => (
            3.0,
            12.0,
            15.0,
            &[1024, 8192, 16384, 32768, 65536],
            &[1024, 4096, 8192, 16384, 32768],
            &[4, 8, 16, 32, 64],
            &[120, 180, 240],
            &[10, 50, 100, 200],
            &[1024, 4096, 8192, 16384],
            true,
            true,
            true,
        ),
        _ => (
            2.0,
            8.0,
            10.0,
            &[8192, 32768, 65536],
            &[8192, 16384, 32768],
            &[16, 64],
            &[180],
            &[50, 200],
            &[4096, 16384],
            true,
            true,
            false,
        ),
    };

    macro_rules! add_condition {
        (
            $suite:expr,
            $name:expr,
            $kind:expr,
            $target:expr,
            $collision:expr,
            $spawn:expr,
            $duration:expr,
            $extra:expr,
            $notes:expr
        ) => {
            seq.push(RustSequenceCondition {
                suite_id: $suite,
                condition_name: $name,
                workload_kind: $kind,
                entity_target: $target,
                collision_mode: $collision,
                spawn_rate: $spawn,
                warmup_seconds,
                duration_seconds: $duration,
                extra_param: $extra,
                notes: $notes,
            });
        };
    }

    for mode in ["none", "grid"] {
        for &count in particle_counts {
            add_condition!(
                "particles",
                format!("particles_{}_{}", mode, count),
                "comparable",
                count,
                Some(mode.to_string()),
                Some(count as f32 / 4.0),
                particle_seconds,
                None,
                Some(if mode == "none" {
                    "Comparable particle update and rect rendering with wall bounce only."
                } else {
                    "Comparable custom spatial-grid particle overlap solver. This is not Journey's swept AABB API."
                })
            );
        }
    }

    for &count in rect_counts {
        add_condition!(
            "rendering",
            format!("render_rect_flood_{}", count),
            "comparable",
            count,
            None,
            None,
            condition_seconds,
            None,
            Some("Comparable moving filled-rect rendering workload.")
        );
    }

    if include_mixed_shapes {
        for &count in rect_counts {
            add_condition!(
                "rendering",
                format!("render_mixed_shapes_{}", count),
                "exploratory",
                count,
                None,
                None,
                condition_seconds,
                None,
                Some("Exploratory only: Journey maps this to layered rect draws.")
            );
        }
    }

    if include_texture {
        add_condition!(
            "rendering",
            "render_texture_sprites_16384".to_string(),
            "comparable",
            16384,
            None,
            None,
            condition_seconds,
            None,
            Some("Comparable textured sprite submission path using minimal texture assets.")
        );
    }

    if include_bloom {
        add_condition!(
            "rendering",
            "render_bloom_16384".to_string(),
            "engine-feature",
            16384,
            None,
            None,
            condition_seconds,
            None,
            Some(
                "Journey bloom/post-process probe. Comparable only as a high-level bloom stress signal."
            )
        );
    }

    for &count in polyphony_counts {
        add_condition!(
            "audio",
            format!("audio_polyphony_{}", count),
            "engine-feature",
            0,
            None,
            None,
            condition_seconds,
            Some(count as f32),
            Some(
                "Journey Resonance DSP sample generation on the main benchmark loop; no browser audio sink."
            )
        );
    }

    for &bpm in sequencer_bpms {
        add_condition!(
            "audio",
            format!("audio_sequencer_{}", bpm),
            "engine-feature",
            8192,
            None,
            None,
            condition_seconds,
            Some(bpm as f32),
            Some(
                "Cadence sequencer update plus 8k background particles. Audio output is not the primary metric."
            )
        );
    }

    for &count in rope_counts {
        add_condition!(
            "ecs_verlet",
            format!("verlet_ropes_{}", count),
            "engine-feature",
            count,
            None,
            None,
            condition_seconds,
            None,
            Some("Journey-side equivalent Verlet algorithm, not a Journey engine API.")
        );
    }

    for &count in point_counts {
        add_condition!(
            "ecs_verlet",
            format!("verlet_points_{}", count),
            "engine-feature",
            count,
            None,
            None,
            condition_seconds,
            None,
            Some("Journey-side equivalent Verlet algorithm, not a Journey engine API.")
        );
    }

    seq
}

#[derive(Clone, Copy)]
struct Particle {
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    color: [f32; 4],
}

struct RectEntity {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    vx: f32,
    vy: f32,
    color: [f32; 4],
}

struct ShapeEntity {
    shape_type: u8,
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    color: [f32; 4],
}

struct EcsDummyStruct {
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    hp: i32,
}

struct VerletPoint {
    pos: Vec2,
    old_pos: Vec2,
    pinned: bool,
}

struct VerletStick {
    a_idx: usize,
    b_idx: usize,
    length: f32,
}

struct VerletRope {
    points: Vec<VerletPoint>,
    sticks: Vec<VerletStick>,
}

fn get_wasm_memory_size() -> u32 {
    wasm_bindgen::memory()
        .dyn_into::<js_sys::WebAssembly::Memory>()
        .map(|mem| js_sys::ArrayBuffer::from(mem.buffer()).byte_length())
        .unwrap_or(0)
}

fn get_forced_renderer() -> (bool, String) {
    if let Some(window) = web_sys::window() {
        let location = window.location();
        if let Ok(search) = location.search() {
            if search.contains("renderer=webgl2") {
                return (true, "webgl2".to_string());
            }
        }
        let gpu_available = js_sys::Reflect::get(&window.navigator(), &"gpu".into()).is_ok();
        if !gpu_available {
            return (true, "webgl2".to_string());
        }
    }
    (false, "wgpu".to_string())
}

fn get_benchmark_profile() -> String {
    if let Some(window) = web_sys::window() {
        if let Ok(search) = window.location().search() {
            if search.contains("profile=smoke") {
                return "smoke".to_string();
            }
            if search.contains("profile=full") {
                return "full".to_string();
            }
        }
    }
    "standard".to_string()
}

pub struct BenchmarkApp {
    profile: String,
    sequence: Vec<RustSequenceCondition>,
    current_index: usize,
    elapsed_seconds: f32,
    recording: bool,
    spawn_accumulator: f32,
    last_frame_time: f64,
    first_frame_time: Option<f64>,
    load_profile: LoadProfile,
    memory_profile: MemoryProfile,
    all_conditions_results: Vec<BenchCondition>,
    current_condition_frames: Vec<BenchFrame>,
    engine_start_real_time: f64,

    particles: Vec<Particle>,
    rects: Vec<RectEntity>,
    shapes: Vec<ShapeEntity>,
    texture_id: Option<usize>,

    grid_heads: Vec<i32>,
    grid_next: Vec<i32>,

    audio_voices: Vec<PatchVoice>,
    audio_sequencer: Option<Sequencer<16>>,

    verlet_ropes: Vec<VerletRope>,
    verlet_points: Vec<VerletPoint>,
    ecs_structs: Vec<EcsDummyStruct>,
}

impl BenchmarkApp {
    fn update_harness_progress(&self, cond_name: &str, index: usize, total: usize, frames: usize) {
        if let Some(window) = web_sys::window() {
            let msg = js_sys::Object::new();
            let _ = js_sys::Reflect::set(&msg, &"type".into(), &"BENCH_PROGRESS".into());
            let _ = js_sys::Reflect::set(&msg, &"engine".into(), &"journey".into());
            let _ = js_sys::Reflect::set(&msg, &"conditionIndex".into(), &(index as u32).into());
            let _ = js_sys::Reflect::set(&msg, &"totalConditions".into(), &(total as u32).into());
            let _ = js_sys::Reflect::set(&msg, &"framesCollected".into(), &(frames as u32).into());
            let _ = js_sys::Reflect::set(&msg, &"currentCondition".into(), &cond_name.into());
            let _ = window.post_message(&msg, "*");
        }
    }

    fn complete_benchmark(&mut self) {
        let (forced, renderer) = get_forced_renderer();
        self.memory_profile.js_heap_after_stop_bytes = Some(get_js_heap_size_js());

        if let Some(c) = self
            .all_conditions_results
            .iter()
            .find(|c| c.entity_target == 65536)
        {
            if let Some(last_frame) = c.frames.last() {
                self.memory_profile.js_heap_at65k_bytes = last_frame.js_heap_bytes;
                self.memory_profile.wasm_linear_memory_at65k_bytes = Some(get_wasm_memory_size());
            }
        }

        let run = BenchmarkRun {
            benchmark_version: "v1".to_string(),
            profile: self.profile.clone(),
            engine: "journey".to_string(),
            renderer,
            renderer_forced: forced,
            entity_cap: 65536,
            platform: web_sys::window().unwrap().navigator().platform().unwrap(),
            user_agent: web_sys::window().unwrap().navigator().user_agent().unwrap(),
            gpu_renderer: get_gpu_renderer_js(),
            recorded_at: js_sys::Date::new_0().to_iso_string().into(),
            condition_count: self.all_conditions_results.len() as u32,
            conditions: self.all_conditions_results.clone(),
            load_profile: self.load_profile.clone(),
            memory_profile: self.memory_profile.clone(),
        };

        if let Some(window) = web_sys::window() {
            let msg = js_sys::Object::new();
            let _ = js_sys::Reflect::set(&msg, &"type".into(), &"BENCH_COMPLETE".into());
            let _ = js_sys::Reflect::set(
                &msg,
                &"payload".into(),
                &serde_wasm_bindgen::to_value(&run).unwrap(),
            );
            let _ = window.post_message(&msg, "*");
        }

        web_sys::console::log_1(&"Benchmark complete! Serializing run...".into());
    }

    fn setup_current_condition(&mut self, _ctx: &mut Context<BenchAction>) {
        if self.current_index >= self.sequence.len() {
            return;
        }

        let cond = &self.sequence[self.current_index];
        self.particles.clear();
        self.rects.clear();
        self.shapes.clear();
        self.verlet_ropes.clear();
        self.verlet_points.clear();
        self.ecs_structs.clear();
        self.audio_voices.clear();
        self.audio_sequencer = None;
        self.elapsed_seconds = 0.0;
        self.recording = false;
        self.spawn_accumulator = 0.0;
        self.current_condition_frames.clear();

        let width = WIDTH;
        let height = HEIGHT;

        match cond.suite_id {
            "rendering" => {
                if cond.condition_name.starts_with("render_rect_flood") {
                    for _ in 0..cond.entity_target {
                        self.rects.push(RectEntity {
                            x: rand_f32() * width,
                            y: rand_f32() * height,
                            w: 4.0 + rand_f32() * 12.0,
                            h: 4.0 + rand_f32() * 12.0,
                            vx: -50.0 + rand_f32() * 100.0,
                            vy: -50.0 + rand_f32() * 100.0,
                            color: [rand_f32(), rand_f32(), rand_f32(), 1.0],
                        });
                    }
                } else if cond.condition_name.starts_with("render_mixed_shapes") {
                    for i in 0..cond.entity_target {
                        self.shapes.push(ShapeEntity {
                            shape_type: (i % 3) as u8,
                            x: rand_f32() * width,
                            y: rand_f32() * height,
                            vx: -50.0 + rand_f32() * 100.0,
                            vy: -50.0 + rand_f32() * 100.0,
                            color: [rand_f32(), rand_f32(), rand_f32(), 1.0],
                        });
                    }
                } else if cond.condition_name.starts_with("render_texture_sprites") {
                    for _ in 0..cond.entity_target {
                        self.rects.push(RectEntity {
                            x: rand_f32() * width,
                            y: rand_f32() * height,
                            w: 8.0,
                            h: 8.0,
                            vx: -60.0 + rand_f32() * 120.0,
                            vy: -60.0 + rand_f32() * 120.0,
                            color: [rand_f32(), rand_f32(), rand_f32(), 1.0],
                        });
                    }
                } else if cond.condition_name.starts_with("render_bloom")
                    || cond.condition_name.starts_with("render_post_fx_stack")
                {
                    for _ in 0..cond.entity_target {
                        self.rects.push(RectEntity {
                            x: rand_f32() * width,
                            y: rand_f32() * height,
                            w: 4.0,
                            h: 4.0,
                            vx: -80.0 + rand_f32() * 160.0,
                            vy: -80.0 + rand_f32() * 160.0,
                            color: [rand_f32(), rand_f32(), rand_f32(), 1.0],
                        });
                    }
                }
            }
            "audio" => {
                for _ in 0..8192 {
                    self.particles.push(Particle {
                        x: rand_f32() * width,
                        y: rand_f32() * height,
                        vx: -70.0 + rand_f32() * 140.0,
                        vy: -70.0 + rand_f32() * 140.0,
                        color: [rand_f32(), rand_f32(), rand_f32(), 0.9],
                    });
                }

                if cond.condition_name.starts_with("audio_sequencer") {
                    let bpm = cond.extra_param.unwrap_or(120.0);
                    let mut seq = Sequencer::<16>::new(44100, bpm, 16, 1234);

                    let kick_pat = EuclideanPattern::new(4, 16, 0);
                    let snare_pat = EuclideanPattern::new(2, 16, 4);
                    let hihat_pat = EuclideanPattern::new(8, 16, 2);
                    let melody_pat = EuclideanPattern::new(6, 16, 0);

                    let kick_track = Track::percussion(kick_pat, 0, 0.01);
                    let snare_track = Track::percussion(snare_pat, 1, 0.01);
                    let hihat_track = Track::percussion(hihat_pat, 2, 0.01);

                    let matrix = [
                        [20, 80, 0, 0, 0, 0, 0, 0],
                        [10, 20, 70, 0, 0, 0, 0, 0],
                        [0, 10, 20, 70, 0, 0, 0, 0],
                        [0, 0, 10, 20, 70, 0, 0, 0],
                        [50, 0, 0, 10, 40, 0, 0, 0],
                        [0, 0, 0, 0, 0, 0, 0, 0],
                        [0, 0, 0, 0, 0, 0, 0, 0],
                        [0, 0, 0, 0, 0, 0, 0, 0],
                    ];
                    let melody_chain = MarkovChain::<8>::new(matrix, 0);
                    let freqs = [440.0, 494.0, 523.0, 587.0, 659.0, 0.0, 0.0, 0.0];
                    let melody_track = Track::melody(melody_pat, melody_chain, freqs, 5, 0.01);

                    seq.add_track(kick_track);
                    seq.add_track(snare_track);
                    seq.add_track(hihat_track);
                    seq.add_track(melody_track);

                    self.audio_sequencer = Some(seq);
                }
            }
            "ecs_verlet" => {
                if cond.condition_name.starts_with("verlet_ropes") {
                    for _ in 0..cond.entity_target {
                        let rx = rand_f32() * width;
                        let mut rope = VerletRope {
                            points: Vec::new(),
                            sticks: Vec::new(),
                        };
                        for j in 0..20 {
                            rope.points.push(VerletPoint {
                                pos: Vec2::new(rx, 10.0 + (j as f32) * 10.0),
                                old_pos: Vec2::new(rx, 10.0 + (j as f32) * 10.0),
                                pinned: j == 0,
                            });
                            if j > 0 {
                                rope.sticks.push(VerletStick {
                                    a_idx: j - 1,
                                    b_idx: j,
                                    length: 10.0,
                                });
                            }
                        }
                        self.verlet_ropes.push(rope);
                    }
                } else if cond.condition_name.starts_with("verlet_points") {
                    for _ in 0..cond.entity_target {
                        let px = rand_f32() * width;
                        let py = rand_f32() * height;
                        self.verlet_points.push(VerletPoint {
                            pos: Vec2::new(px, py),
                            old_pos: Vec2::new(px, py),
                            pinned: false,
                        });
                    }
                } else if cond.condition_name.starts_with("ecs_churn") {
                } else if cond.condition_name.starts_with("ecs_view_query") {
                    for _ in 0..cond.entity_target {
                        self.ecs_structs.push(EcsDummyStruct {
                            x: rand_f32() * width,
                            y: rand_f32() * height,
                            vx: -50.0 + rand_f32() * 100.0,
                            vy: -50.0 + rand_f32() * 100.0,
                            hp: 100,
                        });
                    }
                } else if cond.condition_name.starts_with("ecs_hierarchy") {
                    for _ in 0..cond.entity_target {
                        self.ecs_structs.push(EcsDummyStruct {
                            x: rand_f32() * width,
                            y: rand_f32() * height,
                            vx: 0.0,
                            vy: 0.0,
                            hp: 100,
                        });
                    }
                }
            }
            _ => {}
        }
    }
}

impl GameApp for BenchmarkApp {
    type Action = BenchAction;

    fn window_title() -> &'static str {
        "Journey Bench"
    }

    fn wasm_ready_event() -> Option<&'static str> {
        Some("journey_wasm_ready")
    }

    fn init(ctx: &mut Context<Self::Action>) -> Self {
        ctx.target_fps = 60;
        let texture_id = ctx.load_texture(DUMMY_PNG, "smiley");
        let profile = get_benchmark_profile();
        let loader_timings = get_loader_timings();

        let mut app = Self {
            profile: profile.clone(),
            sequence: build_sequence(&profile),
            current_index: 0,
            elapsed_seconds: 0.0,
            recording: false,
            spawn_accumulator: 0.0,
            last_frame_time: 0.0,
            first_frame_time: None,
            load_profile: LoadProfile {
                wasm_fetch_ms: loader_timings.and_then(|timings| timings.wasm_fetch_ms),
                wasm_compile_ms: loader_timings.and_then(|timings| timings.wasm_compile_ms),
                wasm_instantiate_ms: loader_timings.and_then(|timings| timings.wasm_instantiate_ms),
                time_to_first_frame_ms: 0.0,
                time_to_interactive_ms: 0.0,
            },
            memory_profile: MemoryProfile {
                wasm_linear_memory_initial_bytes: Some(get_wasm_memory_size()),
                wasm_linear_memory_at65k_bytes: None,
                js_heap_at_idle_bytes: Some(get_js_heap_size_js()),
                js_heap_at65k_bytes: None,
                js_heap_after_stop_bytes: None,
            },
            all_conditions_results: Vec::new(),
            current_condition_frames: Vec::new(),
            engine_start_real_time: web_sys::window().unwrap().performance().unwrap().now(),
            particles: Vec::with_capacity(65536),
            rects: Vec::new(),
            shapes: Vec::new(),
            texture_id: Some(texture_id),
            grid_heads: vec![-1; CELL_COUNT],
            grid_next: vec![-1; 65536],
            audio_voices: Vec::new(),
            audio_sequencer: None,
            verlet_ropes: Vec::new(),
            verlet_points: Vec::new(),
            ecs_structs: Vec::new(),
        };

        app.setup_current_condition(ctx);
        app
    }

    fn fixed_update(&mut self, _ctx: &mut Context<Self::Action>, _fixed_time: &FixedTime) {}

    fn update(&mut self, ctx: &mut Context<Self::Action>) {
        let dt = ctx.delta_time;
        self.elapsed_seconds += dt;
        let now = web_sys::window().unwrap().performance().unwrap().now();

        if self.current_index >= self.sequence.len() {
            return;
        }

        let cond = &self.sequence[self.current_index];

        if cond.suite_id == "particles" {
            let limit = cond.entity_target as usize;
            if self.particles.len() < limit {
                self.spawn_accumulator += cond.spawn_rate.unwrap_or(0.0) * dt;
                let to_spawn = self.spawn_accumulator.floor() as usize;
                self.spawn_accumulator -= to_spawn as f32;
                let available = limit.saturating_sub(self.particles.len());
                for _ in 0..to_spawn.min(available) {
                    self.particles.push(Particle {
                        x: WIDTH / 2.0 + (rand_f32() - 0.5) * 50.0,
                        y: HEIGHT / 2.0 + (rand_f32() - 0.5) * 50.0,
                        vx: -80.0 + rand_f32() * 160.0,
                        vy: -80.0 + rand_f32() * 160.0,
                        color: [rand_f32(), rand_f32(), rand_f32(), 0.9],
                    });
                }
            }

            for p in &mut self.particles {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if p.x < 2.0 {
                    p.x = 2.0;
                    p.vx = p.vx.abs();
                } else if p.x > WIDTH - 2.0 {
                    p.x = WIDTH - 2.0;
                    p.vx = -p.vx.abs();
                }
                if p.y < 2.0 {
                    p.y = 2.0;
                    p.vy = p.vy.abs();
                } else if p.y > HEIGHT - 2.0 {
                    p.y = HEIGHT - 2.0;
                    p.vy = -p.vy.abs();
                }
            }

            if let Some(mode) = &cond.collision_mode {
                if mode != "none" {
                    self.grid_heads.fill(-1);
                    for i in 0..self.particles.len() {
                        let p = &self.particles[i];
                        let cx = ((p.x / GRID_CELL_SIZE).floor() as usize).clamp(0, COLS - 1);
                        let cy = ((p.y / GRID_CELL_SIZE).floor() as usize).clamp(0, ROWS - 1);
                        let cell = cy * COLS + cx;
                        self.grid_next[i] = self.grid_heads[cell];
                        self.grid_heads[cell] = i as i32;
                    }

                    for i in 0..self.particles.len() {
                        let a = self.particles[i];
                        let cx = ((a.x / GRID_CELL_SIZE).floor() as usize).clamp(0, COLS - 1);
                        let cy = ((a.y / GRID_CELL_SIZE).floor() as usize).clamp(0, ROWS - 1);

                        let min_x = cx.saturating_sub(1);
                        let max_x = (cx + 1).min(COLS - 1);
                        let min_y = cy.saturating_sub(1);
                        let max_y = (cy + 1).min(ROWS - 1);

                        for y in min_y..=max_y {
                            for x in min_x..=max_x {
                                let mut cursor = self.grid_heads[y * COLS + x];
                                while cursor != -1 {
                                    let j = cursor as usize;
                                    cursor = self.grid_next[j];
                                    if j <= i {
                                        continue;
                                    }
                                    resolve_pair(&mut self.particles, i, j);
                                }
                            }
                        }
                    }
                }
            }
        } else if cond.suite_id == "rendering" {
            for r in &mut self.rects {
                r.x += r.vx * dt;
                r.y += r.vy * dt;
                if r.x < 0.0 {
                    r.x = 0.0;
                    r.vx = r.vx.abs();
                } else if r.x > WIDTH - r.w {
                    r.x = WIDTH - r.w;
                    r.vx = -r.vx.abs();
                }
                if r.y < 0.0 {
                    r.y = 0.0;
                    r.vy = r.vy.abs();
                } else if r.y > HEIGHT - r.h {
                    r.y = HEIGHT - r.h;
                    r.vy = -r.vy.abs();
                }
            }
            for s in &mut self.shapes {
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                if s.x < 4.0 {
                    s.x = 4.0;
                    s.vx = s.vx.abs();
                } else if s.x > WIDTH - 4.0 {
                    s.x = WIDTH - 4.0;
                    s.vx = -s.vx.abs();
                }
                if s.y < 4.0 {
                    s.y = 4.0;
                    s.vy = s.vy.abs();
                } else if s.y > HEIGHT - 4.0 {
                    s.y = HEIGHT - 4.0;
                    s.vy = -s.vy.abs();
                }
            }
        } else if cond.suite_id == "audio" {
            for p in &mut self.particles {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if p.x < 2.0 {
                    p.x = 2.0;
                    p.vx = p.vx.abs();
                } else if p.x > WIDTH - 2.0 {
                    p.x = WIDTH - 2.0;
                    p.vx = -p.vx.abs();
                }
                if p.y < 2.0 {
                    p.y = 2.0;
                    p.vy = p.vy.abs();
                } else if p.y > HEIGHT - 2.0 {
                    p.y = HEIGHT - 2.0;
                    p.vy = -p.vy.abs();
                }
            }

            if cond.condition_name.starts_with("audio_polyphony") {
                let voice_count = cond.extra_param.unwrap_or(4.0) as usize;

                self.audio_voices.retain(|v| v.is_active());

                for _ in 0..voice_count {
                    let mut v = PatchVoice::new(44100);
                    v.trigger(Patch::Laser);
                    self.audio_voices.push(v);
                }

                for _ in 0..735 {
                    for v in &mut self.audio_voices {
                        let _sample = v.next_sample();
                    }
                }
            } else if let Some(seq) = &mut self.audio_sequencer {
                let steps = (dt * 44100.0) as usize;
                self.audio_voices.retain(|v| v.is_active());

                for _ in 0..steps {
                    let output = seq.tick();
                    if output.step_triggered {
                        for ev in &output.events {
                            if let Some(event) = ev {
                                match event {
                                    TrackEvent::TriggerPatch { patch_index, .. } => {
                                        if let Some(patch) = Patch::from_index(*patch_index) {
                                            let mut v = PatchVoice::new(44100);
                                            v.trigger(patch);
                                            self.audio_voices.push(v);
                                        }
                                    }
                                    _ => {
                                        let mut v = PatchVoice::new(44100);
                                        v.trigger(Patch::Laser);
                                        self.audio_voices.push(v);
                                    }
                                }
                            }
                        }
                    }

                    for v in &mut self.audio_voices {
                        let _sample = v.next_sample();
                    }
                }
            }
        } else if cond.suite_id == "ecs_verlet" {
            if cond.condition_name.starts_with("verlet_ropes") {
                for rope in &mut self.verlet_ropes {
                    for pt in &mut rope.points {
                        if !pt.pinned {
                            let temp = pt.pos;
                            pt.pos += (pt.pos - pt.old_pos) + Vec2::new(0.0, 400.0) * dt * dt;
                            pt.old_pos = temp;
                        }
                    }
                    for _ in 0..8 {
                        for stick in &rope.sticks {
                            let (p1, p2) = if stick.a_idx < stick.b_idx {
                                let (left, right) = rope.points.split_at_mut(stick.b_idx);
                                (&mut left[stick.a_idx], &mut right[0])
                            } else {
                                let (left, right) = rope.points.split_at_mut(stick.a_idx);
                                (&mut right[0], &mut left[stick.b_idx])
                            };

                            let delta = p1.pos - p2.pos;
                            let dist = delta.length();
                            if dist > 0.0 {
                                let diff = stick.length - dist;
                                let percent = diff / dist * 0.5;
                                let offset = delta * percent;
                                if !p1.pinned {
                                    p1.pos += offset;
                                }
                                if !p2.pinned {
                                    p2.pos -= offset;
                                }
                            }
                        }
                        for pt in &mut rope.points {
                            if pt.pos.y > HEIGHT {
                                pt.pos.y = HEIGHT;
                            }
                            if pt.pos.x < 0.0 {
                                pt.pos.x = 0.0;
                            }
                            if pt.pos.x > WIDTH {
                                pt.pos.x = WIDTH;
                            }
                        }
                    }
                }
            } else if cond.condition_name.starts_with("verlet_points") {
                for pt in &mut self.verlet_points {
                    let temp = pt.pos;
                    pt.pos += (pt.pos - pt.old_pos) + Vec2::new(0.0, 400.0) * dt * dt;
                    pt.old_pos = temp;
                    if pt.pos.y > HEIGHT {
                        pt.pos.y = HEIGHT;
                        pt.old_pos.y = pt.pos.y;
                    }
                    if pt.pos.x < 0.0 {
                        pt.pos.x = 0.0;
                        pt.old_pos.x = pt.pos.x;
                    }
                    if pt.pos.x > WIDTH {
                        pt.pos.x = WIDTH;
                        pt.old_pos.x = pt.pos.x;
                    }
                }
            } else if cond.condition_name.starts_with("ecs_churn") {
                for _ in 0..1000 {
                    self.ecs_structs.push(EcsDummyStruct {
                        x: 0.0,
                        y: 0.0,
                        vx: 1.0,
                        vy: 1.0,
                        hp: 100,
                    });
                }
                self.ecs_structs.clear();
            } else if cond.condition_name.starts_with("ecs_view_query") {
                for s in &mut self.ecs_structs {
                    if s.hp > 0 {
                        s.x += s.vx * dt;
                        s.y += s.vy * dt;
                        if s.x < 0.0 {
                            s.x = 0.0;
                            s.vx = s.vx.abs();
                        } else if s.x > WIDTH {
                            s.x = WIDTH;
                            s.vx = -s.vx.abs();
                        }
                        if s.y < 0.0 {
                            s.y = 0.0;
                            s.vy = s.vy.abs();
                        } else if s.y > HEIGHT {
                            s.y = HEIGHT;
                            s.vy = -s.vy.abs();
                        }
                    }
                }
            } else if cond.condition_name.starts_with("ecs_hierarchy") {
                for _ in 0..100 {
                    let child_idx = (rand_f32() * 10000.0) as usize % 10000;
                    let parent_idx = (rand_f32() * 10000.0) as usize % 10000;
                    if child_idx != parent_idx {
                        self.ecs_structs.swap(child_idx, parent_idx);
                    }
                }
            }
        }

        if self.elapsed_seconds >= cond.warmup_seconds && !self.recording {
            self.recording = true;
            self.elapsed_seconds = 0.0;
        }

        if self.recording {
            let mut entity_count = 0;
            if cond.suite_id == "particles" {
                entity_count = self.particles.len();
            } else if cond.suite_id == "rendering" {
                entity_count = self.rects.len() + self.shapes.len();
            } else if cond.suite_id == "audio" {
                entity_count = self.particles.len();
            } else if cond.suite_id == "ecs_verlet" {
                if cond.condition_name.starts_with("verlet_ropes") {
                    entity_count = self.verlet_ropes.len();
                } else if cond.condition_name.starts_with("verlet_points") {
                    entity_count = self.verlet_points.len();
                } else {
                    entity_count = cond.entity_target as usize;
                }
            }

            self.current_condition_frames.push(BenchFrame {
                frame_time_ms: ctx.perf().frame_time_ms,
                entity_count: entity_count as u32,
                timestamp: now,
                js_heap_bytes: Some(get_js_heap_size_js()),
                draw_calls: None,
                batch_flushes: None,
                quad_count: None,
            });

            if self.first_frame_time.is_none() {
                self.first_frame_time = Some(now);
                self.load_profile.time_to_first_frame_ms =
                    (now - self.engine_start_real_time) as f32;
                self.load_profile.time_to_interactive_ms =
                    self.load_profile.time_to_first_frame_ms + 50.0;
            }

            if self.current_condition_frames.len() % 30 == 0 {
                self.update_harness_progress(
                    &cond.condition_name,
                    self.current_index + 1,
                    self.sequence.len(),
                    self.current_condition_frames.len(),
                );
            }
        }

        self.last_frame_time = now;

        if self.recording && self.elapsed_seconds >= cond.duration_seconds {
            self.all_conditions_results.push(BenchCondition {
                suite_id: cond.suite_id.to_string(),
                condition_name: cond.condition_name.clone(),
                workload_kind: cond.workload_kind.to_string(),
                entity_target: cond.entity_target,
                collision_mode: cond.collision_mode.clone(),
                spawn_rate: cond.spawn_rate,
                warmup_seconds: cond.warmup_seconds,
                duration_seconds: cond.duration_seconds,
                notes: cond.notes.map(|note| note.to_string()),
                frames: self.current_condition_frames.clone(),
            });

            self.current_index += 1;
            if self.current_index >= self.sequence.len() {
                self.complete_benchmark();
                ctx.request_exit = true;
            } else {
                self.setup_current_condition(ctx);
            }
        }
    }

    fn render(&mut self, ctx: &mut Context<Self::Action>) {
        if self.current_index >= self.sequence.len() {
            return;
        }

        let cond = &self.sequence[self.current_index];

        if cond.suite_id == "particles" {
            let half = Vec2::splat(2.0);
            let size = Vec2::splat(4.0);
            for p in &self.particles {
                ctx.draw_rect(Vec2::new(p.x, p.y) - half, size, p.color);
            }
        } else if cond.suite_id == "rendering" {
            if cond.condition_name.starts_with("render_texture_sprites") {
                if let Some(tex_id) = self.texture_id {
                    let source_rect = Rect::new(0.0, 0.0, 8.0, 8.0);
                    let size = Vec2::new(8.0, 8.0);
                    for r in &self.rects {
                        ctx.draw_sprite_from_sheet(
                            Vec2::new(r.x, r.y),
                            size,
                            [1.0, 1.0, 1.0, 1.0],
                            source_rect,
                            false,
                            tex_id,
                        );
                    }
                }
            } else if self.rects.len() > 0 {
                for r in &self.rects {
                    ctx.draw_rect(Vec2::new(r.x, r.y), Vec2::new(r.w, r.h), r.color);
                }
            } else if self.shapes.len() > 0 {
                for s in &self.shapes {
                    if s.shape_type == 0 {
                        ctx.draw_rect_layer(
                            RenderLayer::World,
                            Vec2::new(s.x, s.y),
                            Vec2::new(8.0, 8.0),
                            s.color,
                        );
                    } else if s.shape_type == 1 {
                        ctx.draw_rect_layer(
                            RenderLayer::Effects,
                            Vec2::new(s.x, s.y),
                            Vec2::new(8.0, 8.0),
                            s.color,
                        );
                    } else {
                        ctx.draw_rect_layer(
                            RenderLayer::Debug,
                            Vec2::new(s.x, s.y),
                            Vec2::new(8.0, 8.0),
                            s.color,
                        );
                    }
                }
            }
        } else if cond.suite_id == "audio" {
            let half = Vec2::splat(2.0);
            let size = Vec2::splat(4.0);
            for p in &self.particles {
                ctx.draw_rect(Vec2::new(p.x, p.y) - half, size, p.color);
            }
        } else if cond.suite_id == "ecs_verlet" {
            if cond.condition_name.starts_with("verlet_ropes") {
                for rope in &self.verlet_ropes {
                    for j in 0..rope.points.len() - 1 {
                        let p1 = rope.points[j].pos;
                        let p2 = rope.points[j + 1].pos;
                        let delta = p2 - p1;
                        let dist = delta.length();
                        if dist > 0.0 {
                            ctx.draw_rect(p1, Vec2::new(dist, 1.0), [0.0, 1.0, 0.0, 1.0]);
                        }
                    }
                }
            } else if cond.condition_name.starts_with("verlet_points") {
                let size = Vec2::new(2.0, 2.0);
                for pt in &self.verlet_points {
                    ctx.draw_rect(pt.pos - Vec2::splat(1.0), size, [0.0, 1.0, 1.0, 1.0]);
                }
            } else if cond.condition_name.starts_with("ecs_view_query") {
                let size = Vec2::new(4.0, 4.0);
                for s in &self.ecs_structs {
                    ctx.draw_rect(
                        Vec2::new(s.x, s.y) - Vec2::splat(2.0),
                        size,
                        [1.0, 0.5, 0.0, 1.0],
                    );
                }
            }
        }
    }

    fn ui(
        &mut self,
        _egui_ctx: &egui::Context,
        ctx: &mut Context<Self::Action>,
        _scene_params: &mut SceneParams,
    ) {
        ctx.show_perf_hud = false;
        _scene_params.fog_enabled = false;
        if self.current_index >= self.sequence.len() {
            return;
        }

        let cond = &self.sequence[self.current_index];
        if cond.condition_name == "render_bloom_16384"
            || cond.condition_name == "render_post_fx_stack_16384"
        {
            ctx.override_bloom(BloomSettings {
                enabled: true,
                threshold: 0.5,
                intensity: 0.8,
                radius: 5.0,
            });
        }
    }
}

static mut RNG_SEED: u32 = 0x7a5f123d;
pub fn rand_f32() -> f32 {
    unsafe {
        RNG_SEED = RNG_SEED.wrapping_mul(1664525).wrapping_add(1013904223);
        (RNG_SEED as f32) / (u32::MAX as f32)
    }
}

fn resolve_pair(particles: &mut [Particle], i: usize, j: usize) {
    if i == j {
        return;
    }
    let (left, right) = if i < j {
        particles.split_at_mut(j)
    } else {
        particles.split_at_mut(i)
    };
    let (a, b) = if i < j {
        (&mut left[i], &mut right[0])
    } else {
        (&mut right[0], &mut left[j])
    };

    let dx = a.x - b.x;
    let dy = a.y - b.y;
    let overlap_x = 4.0 - dx.abs();
    let overlap_y = 4.0 - dy.abs();

    if overlap_x > 0.0 && overlap_y > 0.0 {
        if overlap_x < overlap_y {
            let sign = if dx >= 0.0 { 1.0 } else { -1.0 };
            a.x += overlap_x * 0.5 * sign;
            b.x -= overlap_x * 0.5 * sign;
            std::mem::swap(&mut a.vx, &mut b.vx);
        } else {
            let sign = if dy >= 0.0 { 1.0 } else { -1.0 };
            a.y += overlap_y * 0.5 * sign;
            b.y -= overlap_y * 0.5 * sign;
            std::mem::swap(&mut a.vy, &mut b.vy);
        }
    }
}
