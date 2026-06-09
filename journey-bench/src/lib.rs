mod benchmark;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn set_load_profile(wasm_fetch_ms: f32, wasm_compile_ms: f32, wasm_instantiate_ms: f32) {
    benchmark::set_loader_timings(wasm_fetch_ms, wasm_compile_ms, wasm_instantiate_ms);
}

#[wasm_bindgen]
pub fn start_benchmark() {
    engine::run::<benchmark::BenchmarkApp>();
}
