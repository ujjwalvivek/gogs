<!-- markdownlint-disable MD013 -->

# Journey Engine Quick Reference

A compact cheat sheet for the `journey-engine` Rust API. Public types and entry points are grouped by subsystem so this file can replace the larger Journey docs for day-to-day reference.

## Table of Contents

- [Core Engine](#core-engine)
  - [Entry Points](#entry-points)
  - [GameApp Trait](#gameapp-trait)
  - [Context](#context)
- [Input](#input)
  - [GameAction](#gameaction)
  - [InputState](#inputstate)
  - [InputMap](#inputmap)
- [Rendering](#rendering)
  - [Draw Calls](#draw-calls)
  - [Sprites](#sprites)
  - [Textures](#textures)
  - [Bloom](#bloom)
  - [Atmosphere](#atmosphere)
- [Physics](#physics)
  - [AABB](#aabb)
  - [Collision Volumes](#collision-volumes)
- [Audio](#audio)
  - [AudioManager](#audiomanager)
  - [UI Audio](#ui-audio)
- [Animation](#animation)
- [Time](#time)
- [Math](#math)
- [Re-exports](#re-exports)

## Core Engine

### Entry Points

Defined in the `engine` crate root.

- **`run<G: GameApp>()`**
  Starts a native desktop game and blocks on async GPU initialization.
- **`run_wasm<G: GameApp>()`**
  Starts a WASM/browser game with non-blocking async initialization.

```rust
fn main() {
    engine::run::<MyGame>();
}
```

```rust
#[wasm_bindgen(start)]
pub fn wasm_main() {
    engine::run_wasm::<MyGame>();
}
```

### GameApp Trait

Core lifecycle contract between the engine and game.

- **`GameApp`**

  ```rust
  pub trait GameApp: 'static {
      type Action: GameAction;

      fn init(ctx: &mut Context<Self::Action>) -> Self;
      fn fixed_update(&mut self, ctx: &mut Context<Self::Action>, fixed_time: &FixedTime) {}
      fn update(&mut self, ctx: &mut Context<Self::Action>);
      fn render(&mut self, ctx: &mut Context<Self::Action>);
      fn ui(&mut self, egui_ctx: &egui::Context, ctx: &mut Context<Self::Action>, scene_params: &mut SceneParams) {}

      fn window_title() -> &'static str { "Journey Engine" }
      fn window_icon() -> Option<&'static [u8]> { None }
      fn wasm_ready_event() -> Option<&'static str> { None }
      fn internal_resolution() -> (u32, u32) { (640, 360) }
  }
  ```

- **`init`**
  Load assets, configure input, allocate gameplay state.
- **`fixed_update`**
  Deterministic simulation and physics. Runs at fixed tick rate.
- **`update`**
  Variable-rate frame logic, camera smoothing, non-deterministic UI/game orchestration.
- **`render`**
  Submit sprites and debug geometry.
- **`ui`**
  Optional egui overlay/debug/options UI.

### Context

Mutable engine handle passed to `GameApp` methods.

- **Fields**
  - `input: InputState<A>`
  - `delta_time: f32`
  - `screen_width: f32`
  - `screen_height: f32`
  - `camera_offset_x: f32`
  - `camera_offset_y: f32`
  - `fps: f32`
  - `frame_time_ms: f32`
  - `fixed_tick_rate: u32`
  - `target_fps: u32`
  - `interpolation_alpha: f32`
  - `freeze_frames: u16`
  - `pending_shakes: Vec<(f32, f32)>`
  - `request_exit: bool`
  - `fullscreen_enabled: bool`
  - `hdr_enabled: bool`
  - `audio: AudioManager`
  - `pending_ui_audio: Vec<UiAudioEvent>`
  - `bloom: BloomSettings`

- **`load_texture(bytes: &'static [u8], label: &str): usize`**
  Queues an embedded image for GPU loading. Returns a 1-based texture ID; `0` is the built-in white pixel.
- **`screen_center(): Vec2`**
  Returns center of the current internal screen.
- **`set_fullscreen_enabled(enabled: bool)`**
  Toggles fullscreen.
- **`set_hdr_enabled(enabled: bool)`**
  Toggles HDR output where supported.
- **`trigger_freeze(frames: u16)`**
  Freezes fixed updates for hitstop.
- **`trigger_shake(intensity: f32, duration: f32)`**
  Adds a decaying screen shake.
- **`override_bloom(settings: BloomSettings)`**
  Applies bloom settings for the current frame only.

## Input

### GameAction

Generic action trait implemented by the game enum.

- **`GameAction`**

  ```rust
  pub trait GameAction: Copy + Eq + Debug + 'static {
      fn count() -> usize;
      fn index(&self) -> usize;
      fn from_index(index: usize) -> Option<Self>;

      fn move_negative_x() -> Option<Self> { None }
      fn move_positive_x() -> Option<Self> { None }
      fn move_negative_y() -> Option<Self> { None }
      fn move_positive_y() -> Option<Self> { None }
  }
  ```

- **`Key`**
  Keyboard enum including `W`, `A`, `S`, `D`, `Space`, `Shift`, `Alt`, arrows, `F12`, and `Escape`.
- **`MouseBinding`**
  `Left`, `Right`, `Middle`.

### InputState

- **`is_action_pressed(action: A): bool`**
  Held action.
- **`is_action_just_pressed(action: A): bool`**
  Rising edge this frame.
- **`was_action_pressed_buffered(action: A, buffer_window: f32): bool`**
  Recent press within time window.
- **`is_key_pressed(key: Key): bool`**
  Raw held key.
- **`is_key_just_pressed(key: Key): bool`**
  Raw rising-edge key.
- **`is_mouse_pressed(button: MouseButton): bool`**
  Held mouse button.
- **`get_move_x(): f32`**
  Combined horizontal axis, `-1.0..1.0`.
- **`get_move_y(): f32`**
  Combined vertical axis, `-1.0..1.0`.
- **`any_keyboard_or_mouse(): bool`**
  Last/active keyboard or mouse signal.
- **`any_gamepad(): bool`**
  Gamepad activity.
- **`input_map_mut(): &mut InputMap<A>`**
  Mutable binding map.

### InputMap

- **`bind_key(key: Key, action: A)`**
  Binds keyboard key.
- **`bind_mouse(button: MouseBinding, action: A)`**
  Binds mouse button.
- **`bind_button(button: gilrs::Button, action: A)`**
  Native gamepad button binding.

## Rendering

### Draw Calls

Methods on `Context`.

- **`draw_rect(position: Vec2, size: Vec2, color: [f32; 4])`**
  Draws solid rectangle on world layer.
- **`draw_rect_layer(layer: RenderLayer, position: Vec2, size: Vec2, color: [f32; 4])`**
  Draws solid rectangle on explicit layer.
- **`draw_rect_additive(position: Vec2, size: Vec2, color: [f32; 4])`**
  Draws additive rectangle for glows/effects.
- **`draw_sprite(position: Vec2, size: Vec2, color: [f32; 4], flip_x: bool)`**
  Draws built-in white texture sprite tinted by color.
- **`draw_sprite_from_sheet(position, size, color, source_rect, flip_x, texture_id)`**
  Draws a texture region from a spritesheet.
- **`draw_sprite_from_sheet_additive(position, size, color, source_rect, flip_x, texture_id)`**
  Additive spritesheet draw.

### Sprites

- **`Rect`**

  ```rust
  pub struct Rect {
      pub x: f32,
      pub y: f32,
      pub w: f32,
      pub h: f32,
  }
  ```

  Constructors: `Rect::new(x, y, w, h)`, `Rect::from_pos_size(pos, size)`.

- **`RenderLayer`**
  `Background`, `World`, `Effects`, `Debug`.

- **`BlendMode`**
  `Alpha`, `Additive`.

Rendering details:

- Internal resolution defaults to `640x360`.
- Sprites are ordered by `RenderLayer`, then `BlendMode`, then batched by `texture_id`.
- `texture_id = 0` uses the built-in white pixel.
- Horizontal flipping is UV-space, avoiding anchor offset problems.

### Textures

- **`Context::load_texture(bytes, label): usize`**
  Simplest game-facing texture path.
- **`Texture`**
  Low-level GPU texture with view, sampler, width, and height.
- **`TextureHandle`**
  Opaque texture-manager handle.

### Bloom

- **`BloomSettings`**

  ```rust
  pub struct BloomSettings {
      pub enabled: bool,
      pub threshold: f32,
      pub intensity: f32,
      pub radius: f32,
  }
  ```

Use persistent settings through `ctx.bloom`, or one-frame overrides through `ctx.override_bloom(settings)`.

### Atmosphere

- **`SkyParams`**
  Gradient sky primitive:
  `enabled`, `horizon_glow`, `top_color`, `horizon_color`, `bottom_color`, `horizon_y`, `horizon_width`.
- **`SkyParams::lerp(&self, other, t): SkyParams`**
  Interpolates sky parameters.
- **`SkyTransition`**
  One-shot sky transition with `current`, `target`, `duration`, and `elapsed`.
- **`SceneParams`**
  Background/fog/sky data passed to `GameApp::ui()`.

Internal helpers:

- `hex_to_rgb`
- `smoothstep`
- `draw_gradient`
- `render_sky_to_buffer`
- `render_fog_overlay`
- `render_fog_to_buffer`
- `render_atmosphere_to_buffer`

## Physics

### AABB

- **`AABB`**

  ```rust
  pub struct AABB {
      pub center: Vec2,
      pub size: Vec2,
  }
  ```

- **`AABB::new(center: Vec2, size: Vec2): Self`**
  Creates from center and size.
- **`AABB::from_top_left(top_left: Vec2, size: Vec2): Self`**
  Creates from top-left and size.
- **`min(): Vec2`**
  Top-left corner.
- **`max(): Vec2`**
  Bottom-right corner.
- **`top_left(): Vec2`**
  Alias for `min`.
- **`check_collision(&self, other: &AABB): bool`**
  Overlap test.
- **`get_overlap(&self, other: &AABB): Vec2`**
  Per-axis overlap.
- **`resolve_collision(mover: &AABB, obstacle: &AABB): Option<Vec2>`**
  Minimum translation vector for overlap resolution.
- **`swept_collision(&self, displacement: Vec2, obstacle: &AABB): Option<SweepResult>`**
  Continuous collision detection.

- **`SweepResult`**
  `{ time: f32, normal: Vec2 }`

### Collision Volumes

- **`CollisionLayer`**
  `Pushbox`, `Hurtbox`, `Hitbox`, `Parrybox`.

- **`BoxVolume`**

  ```rust
  pub struct BoxVolume {
      pub layer: CollisionLayer,
      pub local_offset: Vec2,
      pub size: Vec2,
      pub active: bool,
  }
  ```

- **`BoxVolume::new(layer, offset, size): Self`**
  Creates a local collision volume.
- **`world_aabb(entity_pos: Vec2, facing_right: bool): AABB`**
  Converts to world-space AABB and flips X offset when facing left.

## Audio

### AudioManager

Cross-platform audio wrapper around Kira.

- **`AudioTrack`**
  `Music`, `Ambience`, `Sfx`, `Ui`.

- **Playback**
  - `play_oneshot(data: &StaticSoundData, track: AudioTrack)`
  - `play_music(data: &StaticSoundData, fade_in_secs: f32)`
  - `stop_music(fade_out_secs: f32)`
  - `play_ambience(data: &StaticSoundData, fade_in_secs: f32)`
  - `stop_ambience(fade_out_secs: f32)`
  - `play_loop_sfx(data: &StaticSoundData)`
  - `stop_loop_sfx(fade_out_secs: f32)`

- **Volume**
  - `set_master_volume(volume: f64)`
  - `set_music_volume(volume: f64)`
  - `set_ambience_volume(volume: f64)`
  - `set_sfx_volume(volume: f64)`
  - `set_ui_volume(volume: f64)`
  - `master_volume(): f64`
  - `music_volume(): f64`
  - `effective_volume(track: AudioTrack): f64`
  - `set_music_live_volume(amp: f64, fade_secs: f32)`
  - `set_ambience_live_volume(amp: f64, fade_secs: f32)`

- **State**
  - `has_active_music(): bool`
  - `has_active_ambience(): bool`
  - `notify_user_gesture()`

- **`load_sound_data(bytes: &'static [u8]): Option<StaticSoundData>`**
  Decodes embedded audio.

### UI Audio

- **`UiAudioEvent`**
  `Hover`, `Click`, `CheckboxOn`, `CheckboxOff`, `TabChange`.

- **`AudioResponse`**
  Extension trait for egui responses:
  - `with_ui_sound(pending)`
  - `with_checkbox_sound(checked, pending)`
  - `with_tab_sound(pending)`

Game-specific audio should be modeled in the game crate as its own event enum and dispatched through `ctx.audio`.

## Animation

- **`AnimationDef`**

  ```rust
  pub struct AnimationDef {
      pub name: String,
      pub start_frame: usize,
      pub frame_count: usize,
      pub frame_duration: f32,
      pub looping: bool,
  }
  ```

- **`AnimationDef::new(name, start_frame, frame_count, frame_duration, looping): Self`**
  Defines frame range/timing.

- **`AnimationState`**

  ```rust
  pub struct AnimationState {
      pub current_anim: String,
      pub frame_index: usize,
      pub timer: f32,
  }
  ```

- **Methods**
  - `new(animations, default_anim): Self`
  - `update(dt: f32)`
  - `current(): Option<(&AnimationDef, usize)>`
  - `play(anim_name: &str)`
  - `is_finished(): bool`
  - `current_animation_name(): Option<&str>`
  - `get_progress(): f32`

## Time

- **Constants**
  - `DEFAULT_FIXED_HZ: u32 = 60`
  - `MAX_STEPS: u32 = 5`

- **`FixedTime`**

  ```rust
  pub struct FixedTime {
      pub tick: u64,
      pub fixed_dt: f32,
  }
  ```

- **Methods**
  - `new(hz: u32): Self`
  - `accumulate(dt: f32): u32`
  - `advance()`
  - `interpolation_alpha(): f32`
  - `tick_rate(): u32`
  - `set_tick_rate(hz: u32)`
  - `freeze(frames: u16)`
  - `is_frozen(): bool`
  - `freeze_remaining(): u16`

## Math

- **`Vec2`**
  Re-exported from `glam`.
- **`Vec3`**
  Re-exported from `glam`.
- **`Vec4`**
  Re-exported from `glam`.
- **`move_towards(current: f32, target: f32, max_delta: f32): f32`**
  Moves a value toward a target without overshooting.

```rust
velocity_x = move_towards(velocity_x, 0.0, decel * dt);
velocity_x = move_towards(velocity_x, target_speed, accel * dt);
```

## Re-exports

The crate root re-exports common API:

```rust
pub use audio::{AudioManager, AudioResponse, AudioTrack, UiAudioEvent, load_sound_data};
pub use camera::ScreenShake;
pub use context::Context;
pub use glam::{Vec2, Vec3, Vec4};
pub use input::{GameAction, InputMap, InputState, Key, MouseBinding};
pub use kira::sound::static_sound::StaticSoundData;
pub use math::move_towards;
pub use physics::{AABB, BoxVolume, CollisionLayer, SweepResult};
pub use sprite::{BlendMode, Rect, RenderLayer};
pub use animation::{AnimationDef, AnimationState};
pub use texture::Texture;
pub use texture_manager::TextureHandle;
pub use time::FixedTime;
pub use egui;
#[cfg(not(target_arch = "wasm32"))]
pub use gilrs;
```
