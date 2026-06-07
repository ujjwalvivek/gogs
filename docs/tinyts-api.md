<!-- markdownlint-disable MD013 -->

# TinyTS Quick Reference

A comprehensive cheat sheet of the TinyTS 2D game engine API. All public functions, classes, and types are grouped by subsystem.

## Table of Contents

- [Core Module](#core-module)
  - [Engine](#engine)
  - [Input](#input)
  - [Text Input](#text-input)
  - [Math & Vectors](#math--vectors)
  - [Assets](#assets)
  - [ECS (Entity Component System)](#ecs-entity-component-system)
  - [Timer](#timer)
  - [Easing & Tweens](#easing--tweens)
- [Rendering Module](#rendering-module)
  - [Renderer 2D](#renderer-2d)
  - [Color](#color)
  - [Camera](#camera)
  - [Procedural Textures](#procedural-textures)
- [Audio Module](#audio-module)
  - [Audio Manager & Synth](#audio-manager--synth)
  - [Music Sequencer](#music-sequencer)
  - [Audio Presets](#audio-presets)
- [Physics Module](#physics-module)
  - [AABB Physics](#aabb-physics)
  - [Tilemap](#tilemap)
  - [Tilemap Helpers](#tilemap-helpers)
  - [Noise](#noise)
  - [Verlet Physics](#verlet-physics)
  - [Spatial Grid](#spatial-grid)
- [FX & Particle Presets](#fx--particle-presets)

## Core Module

### Engine

Defined in [engine.ts](src/core/engine.ts)

- **`engineStart(config: EngineConfig): void`**
  Starts the game loop with fixed-timestep updates and variable rendering.
- **`EngineConfig`**
  Engine startup configuration:
  `{ size: { width: number, height: number }, scaleMode?: ScaleMode, pixelated?: boolean, webgl?: boolean, webgpu?: boolean, fixedHz?: number, maxSteps?: number, maxFrameDt?: number, update?: (dt: number) => void, render?: (alpha: number) => void }`
  Set `webgpu: true` to try the optimized WebGPU renderer first. If WebGPU is unavailable, TinyTS falls back to WebGL2 when `webgl` is also true, then Canvas2D.
- **`engineStop(): void`**
  Stops the running game loop and safely cleans up canvas, input, and audio contexts.
- **`getActiveEngine(): Engine | undefined`**
  Retrieves the currently running Engine instance.
- **`stats`**
  Global object showing current performance metrics:
  `{ fps: number, avgFps: number, frameMs: number, fixedSteps: number, fixedHz: number }`
- **`frameCount: number`**
  Total number of fixed update steps elapsed since engine startup.
- **`time: number`**
  Total simulation time elapsed in seconds.
- **`alpha: number`**
  Interpolation factor (0 to 1) indicating progress between the current and next fixed update frames. Used for smooth rendering.

### Input

Defined in [input.ts](src/core/input.ts)

- **`keyDown(code: string): boolean`**
  Checks if a keyboard key is currently held down.
- **`keyPressed(code: string): boolean`**
  Checks if a keyboard key was pressed during the current frame.
- **`keyReleased(code: string): boolean`**
  Checks if a keyboard key was released during the current frame.
- **`mousePos(): Vec2`**
  Returns the current mouse position in logical game coordinates.
- **`mouseDown(button?: number): boolean`**
  Checks if a mouse button is held down (0 for left, 1 for middle, 2 for right).
- **`mousePressed(button?: number): boolean`**
  Checks if a mouse button was clicked during the current frame.
- **`mouseReleased(button?: number): boolean`**
  Checks if a mouse button was released during the current frame.
- **`mouseWheel(): number`**
  Returns the mouse scroll wheel vertical delta.
- **`bindAction(name: string, keys: string | string[]): void`**
  Maps a logical action name to one or more keyboard, mouse, or gamepad codes.
- **`actionDown(name: string): boolean`**
  Checks if any key bound to the action is currently held down.
- **`actionPressed(name: string): boolean`**
  Checks if any key bound to the action was pressed this frame.
- **`actionReleased(name: string): boolean`**
  Checks if any key bound to the action was released this frame.
- **`gamepadIsDown(button: number, gamepadIndex?: number): boolean`**
  Checks if a specific gamepad button is held down.
- **`gamepadStick(stick: number, gamepadIndex?: number): Vec2`**
  Returns the 2D direction vector of an analog stick (0 for left stick, 1 for right stick).
- **`isTouchActive(): boolean`**
  Checks if a touch interaction is active.
- **`touchPos(): Vec2`**
  Returns the active touch coordinates in logical game space.
- **`setTouchMappedToMouse(enabled: boolean): void`**
  Enables or disables mapping primary touch coordinates to `mousePos()` and primary touch press/release to left mouse button state.
- **`addTouchControls(config: TouchControlsConfig): () => void`**
  Adds an on-screen touch control overlay attached to the active engine canvas. D-pad and button presses feed the normal keyboard/action state, so existing `keyDown()`, `keyPressed()`, `actionDown()`, and `actionPressed()` checks keep working. Returns a cleanup function.
- **`removeTouchControls(): void`**
  Removes the active on-screen touch controls and releases any held touch buttons.
- **`TouchControlsVisibility`**
  Visibility mode for on-screen controls: `"auto"` shows on coarse-pointer devices, `"always"` forces display, and `"never"` keeps the overlay hidden.
- **`TouchControlButtonConfig`**
  Action button configuration:
  `{ id?: string, label: string, keys: string | string[] }`
- **`TouchControlsConfig`**
  Touch overlay configuration:
  `{ left?: string | string[], right?: string | string[], up?: string | string[], down?: string | string[], buttons?: TouchControlButtonConfig[], visibility?: TouchControlsVisibility }`

### Text Input

Defined in [textInput.ts](src/core/textInput.ts)

- **`startTextInput(initialText?: string): void`**
  Activates capturing text input via keyboard, showing any virtual keyboard if available.
- **`stopTextInput(): string`**
  Deactivates text capturing and returns the accumulated string.
- **`getTextInput(): TextInputState`**
  Retrieves the current text input status: `{ text: string, active: boolean }`.
- **`processTextInput(e: KeyboardEvent): void`**
  Applies character entries, backspaces, or exits text capturing upon Enter or Escape keys.

### Math & Vectors

Defined in [math.ts](src/core/math.ts)

- **`Vec2`** (Class)
  Vector representation for positions, sizes, and velocities:
  - `constructor(x?: number, y?: number)`
  - `set(x: number, y: number): this`
  - `copy(v: Vec2): this`
  - `clone(): Vec2`
  - `add(v: Vec2): this`
  - `subtract(v: Vec2): this`
  - `scale(s: number): this`
  - `dot(v: Vec2): number`
  - `length(): number`
  - `lengthSquared(): number`
  - `normalize(): this`
  - `distanceTo(v: Vec2): number`
  - `lerp(v: Vec2, t: number): this`
  - `angle(): number`
  - `rotate(angle: number): this`
  - `perp(): this`
  - `floor(): this`
  - `round(): this`
- **`vec2(x?: number, y?: number): Vec2`**
  Convenience helper to instantiate a new `Vec2` object.
- **`rect(x: number, y: number, w: number, h: number): Rect`**
  Creates an object representing a 2D bounding rectangle.
- **`clamp(v: number, min: number, max: number): number`**
  Clamps a numerical value within bounds.
- **`lerp(a: number, b: number, t: number): number`**
  Linearly interpolates between two numbers.
- **`mapRange(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number`**
  Maps a value from one range to another.
- **`rand(min?: number, max?: number): number`**
  Generates a pseudo-random float between min (default 0) and max (default 1).
- **`randInt(min: number, max: number): number`**
  Generates a pseudo-random integer in the range [min, max].
- **`choose<T>(arr: T[]): T`**
  Picks a random item from the provided array.

### Assets

Defined in [assets.ts](src/core/assets.ts)

- **`loadImage(url: string): Promise<HTMLImageElement>`**
  Loads an image from a URL and caches it.
- **`loadText(url: string): Promise<string>`**
  Loads plain text from a URL.
- **`loadJson(url: string): Promise<any>`**
  Loads and parses a JSON file from a URL.
- **`loadAssets(manifest: AssetManifest): Promise<AssetBundle>`**
  Batches requests to load multiple resources (images, sounds, files) at once.

### ECS (Entity Component System)

Defined in [ecs.ts](src/core/ecs.ts)

- **`Registry`** (Class)
  - `createEntity(): Entity` - Spawns a new entity ID.
  - `destroyEntity(entity: Entity): void` - Destroys an entity and all its attached components.
  - `addComponent<T>(entity: Entity, componentClass: ComponentClass<T>, instance: T): T` - Attaches a component instance to an entity.
  - `getComponent<T>(entity: Entity, componentClass: ComponentClass<T>): T | undefined` - Fetches component instance.
  - `hasComponent(entity: Entity, componentClass: ComponentClass<any>): boolean` - Checks for component presence.
  - `removeComponent(entity: Entity, componentClass: ComponentClass<any>): void` - Removes a component.
  - `view(...componentClasses: ComponentClass<any>[]): Entity[]` - Finds all entities containing all matching components.
  - `clear(): void` - Purges all entities and components.
- **`Parent`** (Component Class)
  Maintains entity parent hierarchies.
- **`Children`** (Component Class)
  Tracks children entities.

### Timer

Defined in [timer.ts](src/core/timer.ts)

- **`Timer`** (Class)
  Robust countdown/elapsed timer:
  - `constructor(duration?: number, config?: { paused?: boolean, loop?: boolean })`
  - `update(dt: number): void`
  - `start(): void`
  - `pause(): void`
  - `resume(): void`
  - `reset(): void`
  - `isDone(): boolean`
  - `progress(): number`
  - `remaining(): number`
  - `elapsedMs(): number`

### Easing & Tweens

Defined in [easing.ts](src/core/easing.ts)

- **`addTween(config: TweenConfig): Tween`**
  Spawns a new tween and registers it to the active engine's manager.
- **`updateTweens(dt: number): void`**
  Updates all active tweens. Called automatically by the engine.
- **`clearTweens(): void`**
  Cancels and removes all currently active tweens.
- **Easing Curves:**
  `linear`, `quadIn`, `quadOut`, `quadInOut`, `cubicIn`, `cubicOut`, `cubicInOut`, `elasticOut`, `bounceOut`, `backOut`

## Rendering Module

### Renderer 2D

Defined in [renderer2d.ts](src/render/renderer2d.ts)

- **`clear(color: string | Color): void`**
  Clears the canvas with the specified color.
- **`drawRect(pos: Vec2, size: Vec2, color: string | Color): void`**
  Draws a filled rectangle.
- **`drawRectOutline(pos: Vec2, size: Vec2, color: string | Color, thickness?: number): void`**
  Draws a hollow border rectangle.
- **`drawLine(a: Vec2, b: Vec2, color: string | Color, thickness?: number): void`**
  Draws a straight line.
- **`drawCircle(pos: Vec2, radius: number, color: string | Color): void`**
  Draws a filled circle.
- **`drawCircleOutline(pos: Vec2, radius: number, color: string | Color, thickness?: number): void`**
  Draws a hollow border circle.
- **`drawSprite(image: HTMLImageElement | HTMLCanvasElement, pos: Vec2, size: Vec2, options?: SpriteOptions): void`**
  Draws an image or sprite region. Supports source framing (`sourceX`, `sourceY`, `sourceWidth`, `sourceHeight`), `angle` rotation in radians, scale flipping (`flipX`, `flipY`), and rendering `color` tint overrides.
- **`drawText(text: string, pos: Vec2, options?: TextOptions): void`**
  Draws typographic text. Options specify `size`, `font`, `color`, `align` (left/center/right), `baseline`, `outlineColor`, and `outlineThickness`. When `TextOptions.font` is omitted, TinyTS uses the bundled TinyTS font.
- **`setRenderTransform(pos: Vec2, zoom: number): void`**
  Transforms drawing operations into world/camera space.
- **`resetRenderTransform(): void`**
  Resets drawing coordinates to logical screen space.
- **`createFrameBuffer(width: number, height: number): FrameBuffer`**
  Creates an offscreen canvas rendering target.
- **`bindFrameBuffer(fb: FrameBuffer | null): void`**
  Binds a framebuffer as the active drawing destination (pass `null` to return to screen).
- **`drawFrameBuffer(fb: FrameBuffer, pos: Vec2, size: Vec2): void`**
  Draws the contents of a framebuffer to the screen.
- **`getRendererStats(): RendererStats`**
  Returns per-frame renderer instrumentation counters for the active renderer.
- **`RendererStats`**
  Renderer instrumentation snapshot:
  `{ drawCalls: number, batchFlushes: number, textureSwitches: number, shapeSwitches: number, quads: number, overlayLineCalls: number, overlayTextCalls: number }`
- **Render backends**
  `Renderer.type` can be `"canvas2d"`, `"webgl2"`, or `"webgpu"`. The WebGPU backend is highly optimized (using instanced rendering and a texture atlas) and targets the primary batched canvas path.

### Post Processing

Defined in [types.ts](src/render/types.ts)

- **`PostProcessingConfig`**
  Passed via `engineStart({ post: {...} })`.
  - `enabled?: boolean` - Master toggle (default true when object is given).
  - `resolutionScale?: number` - Global scale for intermediate targets (1.0 = full res).
  - `bloom?: BloomConfig` - Bright-pass bloom with separable gaussian blur.
  - `colorGrade?: ColorGradeConfig` - Contrast, saturation, gamma, temperature, tint.
  - `vignette?: VignetteConfig` - Screen-edge darkening.
  - `grain?: GrainConfig` - Film-grain noise overlay.
  - `atmosphere?: AtmosphereConfig` - Gradient fog rising from the bottom of the screen.

- **`BloomConfig`**
  `{ enabled?, threshold?, softKnee?, intensity?, radius?, passes?, resolutionScale? }`
  - `threshold` (default 0.72) - Luminance threshold for bright-pass extraction.
  - `softKnee` (default 0.16) - Smooth transition width around the threshold.
  - `intensity` (default 0.35) - Bloom brightness multiplier during compositing.
  - `radius` (default 1) - Blur spread radius in pixels.
  - `passes` (default 3) - Number of separable blur passes (each direction counts as one).

- **`ColorGradeConfig`**
  `{ brightness?, contrast?, saturation?, gamma?, temperature?, tint? }`
  - `brightness` (default 0) - Brightness offset added before other adjustments.
  - `contrast` (default 1) - Contrast multiplier.
  - `saturation` (default 1) - Saturation multiplier.
  - `gamma` (default 1) - Gamma correction exponent.
  - `temperature` (default 0) - Color temperature shift (negative = cooler/blue, positive = warmer/red).
  - `tint` (default [1,1,1]) - RGB tint multiplier applied before gamma.

- **`VignetteConfig`**
  `{ intensity?, radius?, softness?, color? }`
  - `intensity` (default 0) - Darkening strength.
  - `radius` (default 0.72) - Normalised inner radius of the vignette.
  - `softness` (default 0.35) - Feather width of the vignette edge.
  - `color` (default [0,0,0]) - Color applied at the screen edges.

- **`GrainConfig`**
  `{ amount?, scale?, animated? }`
  - `amount` (default 0) - Noise intensity.
  - `scale` (default 1) - Grain size in pixels.
  - `animated` (default true) - Animate the noise pattern each frame.

- **`AtmosphereConfig`**
  `{ intensity?, color?, start?, end?, noiseAmount?, noiseScale? }`
  - `intensity` (default 0) - Fog opacity (0-1).
  - `color` (default [0,0,0]) - Fog tint.
  - `start` (default 0) - Normalised height where fog begins (0 = bottom edge of screen).
  - `end` (default 1) - Normalised height where fog reaches full strength.
  - `noiseAmount` (default 0) - Amount of procedural noise variation.
  - `noiseScale` (default 128) - Scale of the noise pattern in pixels.

### Color

Defined in [color.ts](src/render/color.ts)

- **`Color`** (Class)
  Encapsulates red, green, blue, and alpha fractional values (0 to 1):
  - `constructor(r?: number, g?: number, b?: number, a?: number)`
  - `copy(c: Color): this`
  - `clone(): Color`
  - `toRGBA(): string`
  - `toHex(): string`
  - `lerp(c: Color, t: number): this`
  - `darken(amount: number): this`
  - `lighten(amount: number): this`
  - `static fromHex(hex: string): Color`
  - `static fromHSL(h: number, s: number, l: number, a?: number): Color`
- **`rgb(r: number, g: number, b: number, a?: number): Color`**
  Helper mapping integer inputs [0, 255] to a Color object.
- **`hsl(h: number, s: number, l: number, a?: number): Color`**
  Helper mapping HSL values ([0, 360], [0, 100], [0, 100]) to a Color object.
- **Color Constants:**
  `WHITE`, `BLACK`, `RED`, `GREEN`, `BLUE`, `YELLOW`, `CYAN`, `MAGENTA`, `TRANSPARENT`

### Camera

Defined in [camera.ts](src/render/camera.ts)

- **`createCamera(config?: CameraConfig): Camera`**
  Instantiates a camera to handle viewport panning, zooming, and screenshakes.
- **`Camera`** (Class)
  - `follow(target: Vec2, options?: { deadZone?: Vec2, speed?: number, lookahead?: number }): void` - Configures smooth viewport interpolation to track a moving target.
  - `shake(intensity: number): void` - Starts screen shaking.
  - `apply(): void` - Enforces camera translation/scaling on the renderer.
  - `end(): void` - Restores default screen space coordinates.
  - `worldToScreen(worldPos: Vec2): Vec2` - Converts world to screen coordinates.
  - `screenToWorld(screenPos: Vec2): Vec2` - Converts screen to world coordinates.

### Procedural Textures

Defined in [procedural.ts](src/render/procedural.ts)

Helpers for generating HTML Canvas elements dynamically at runtime to avoid asset file loading overhead:

- **`createTexture(width: number, height: number, drawFn: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement`**
- **`drawProceduralRect`, `drawProceduralCircle`, `drawProceduralLine`, `drawProceduralPolygon`, `drawProceduralArc`, `drawProceduralEllipse`, `drawProceduralBezierCurve`, `drawProceduralText`, `drawProceduralGradientRect`, `drawProceduralGridPattern`, `drawProceduralRoundedRect`, `drawProceduralRegularPolygon`, `drawProceduralStar`, `drawProceduralRing`, `drawProceduralSector`, `drawProceduralCapsule`, `drawProceduralQuadraticCurve`**

## Audio Module

### Audio Manager & Synth

Defined in [audio.ts](src/audio/audio.ts)

- **`unlockAudio(): void`**
  Resumes the browser AudioContext on user interaction to satisfy security policies.
- **`setMasterVolume(v: number): void`**
  Adjusts the output node volume (0 to 1).
- **`playSound(params: SynthOptions): AudioHandle`**
  Synthesizes game sounds procedurally on the fly using a sound definition object:
  - `wave`: oscillator waveform type (`'sine'`, `'square'`, `'triangle'`, `'sawtooth'`, `'noise'`)
  - `frequency`: start frequency in Hz
  - `frequencySlide`: pitch sliding amount in Hz
  - `attack` / `decay` / `release`: ADSR envelope phases in seconds
  - `volume` / `pan`: volume level and stereo panning [-1, 1]
  - `tag`: custom identifier to allow batch stopping
- **`loadAudio(url: string): Promise<AudioClip>`**
  Downloads and decodes an audio asset into an AudioBuffer.
- **`playLoadedAudio(clip: AudioClip, options?: PlayOptions): AudioHandle`**
  Plays a decoded audio asset.
- **`playSoundAt(params: SynthOptions, worldPos: Vec2, listenerPos: Vec2, falloff?: number): AudioHandle`**
  Calculates distance attenuation and stereo panning relative to a listener to play spatialized SFX.
- **`stopAll(): void`**
  Immediately stops all active sound channels.
- **`stopSoundsWithTag(tag: string): void`**
  Stops any sound playing under a specific tag category.

### Music Sequencer

Defined in [audio.ts](src/audio/audio.ts)

- **`midiToFreq(note: number): number`**
  Converts a MIDI pitch index to frequency (Hz).
- **`Pattern`** (Class)
  Stores note sequences for a channel track:
  - `constructor(name: string, notes: TimedNote[])`
- **`Sequencer`** (Class)
  Looping tracker playing synthesizer patterns:
  - `constructor(bpm?: number)`
  - `addTrack(channelIndex: number, instrument: SynthOptions): void`
  - `addPattern(pattern: Pattern): void`
  - `playPattern(channelIndex: number, patternName: string, barIndex: number): void`
  - `start(loop?: boolean): void`
  - `stop(): void`
  - `update(dt: number): void`

### Audio Presets

Defined in [audioPresets.ts](src/plugins/audioPresets.ts)

Accessible via `sfx.*` namespace. Returns standard configurations that can be passed to `playSound`:

- **`sfx.laser(overrides?: Partial<SynthOptions>): SynthOptions`**
- **`sfx.explosion(overrides?: Partial<SynthOptions>): SynthOptions`**
- **`sfx.coin(overrides?: Partial<SynthOptions>): SynthOptions`**
- **`sfx.jump(overrides?: Partial<SynthOptions>): SynthOptions`**
- **`sfx.hurt(overrides?: Partial<SynthOptions>): SynthOptions`**
- **`sfx.powerup(overrides?: Partial<SynthOptions>): SynthOptions`**
- **`sfx.click(overrides?: Partial<SynthOptions>): SynthOptions`**

## Physics Module

### AABB Physics

Defined in [aabb.ts](src/physics/aabb.ts)

- **`aabb(pos: Vec2, size: Vec2): AABB`**
  Creates an Axis-Aligned Bounding Box: `{ pos, size }`.
- **`aabbOverlap(a: AABB, b: AABB): boolean`**
  Tests if two AABBs intersect.
- **`aabbOverlapResult(a: AABB, b: AABB): OverlapResult | null`**
  Calculates the minimum translation vector required to separate two overlapping AABBs.
- **`pointInRect(p: Vec2, r: AABB): boolean`**
  Checks if a point is contained inside an AABB.
- **`aabbExpand(box: AABB, margin: Vec2): AABB`**
  Expands an AABB outward by margins.
- **`aabbCenter(box: AABB): Vec2`**
  Returns the center coordinates of an AABB.
- **`moveAABB(body: AABB, velocity: Vec2, colliders: ColliderEntry[], dt: number): MoveResult`**
  Performs robust swept-AABB collision detection and separation against static or dynamic colliders.
- **`sweepAABB(box: AABB, velocity: Vec2, target: AABB): SweepResult`**
  Sweeps an AABB along a velocity path against a target bounding box to determine impact time.

### Tilemap

Defined in [tilemap.ts](src/physics/tilemap.ts)

- **`createTilemap(width: number, height: number, tileSize: number, tileDefs: TileDef[]): TileMap`**
  Creates a grid-based map structure.
- **`tilemapFromString(mapStr: string, legend: Record<string, Partial<TileDef> & { spawn?: string }>, tileSize?: number): TileMap`**
  Loads a tilemap directly from an ascii layout string.
- **`moveTilemap(body: AABB, velocity: Vec2, map: TileMap, dt: number): MoveResult`**
  Swept collision resolver for moving AABB boxes against solid map tiles.
- **`TileMap`** (Class)
  - `isSolid(tx: number, ty: number): boolean` - Checks if tile coordinates contain a solid block.
  - `isSolidAABB(box: AABB): boolean` - Tests overlap between an AABB and solid tiles.
  - `worldToTile(worldPos: Vec2): Vec2` - Converts world position to grid indices.
  - `tileToWorld(tx: number, ty: number): Vec2` - Converts grid index to world position (top-left).
  - `getSpawn(name: string, index?: number): Vec2 | undefined` - Locates the world center of spawn points.
  - `render(offsetX?: number, offsetY?: number): void` - Draws all tiles using active settings.

### Tilemap Helpers

Defined in [tilemapHelpers.ts](src/physics/tilemapHelpers.ts)

- **`fillTiles(map: TileMap, tx: number, ty: number, tw: number, th: number, tileIndex: number): void`**
  Fills a rectangular section of tiles.
- **`drawLineTiles(map: TileMap, x0: number, y0: number, x1: number, y1: number, tileIndex: number): void`**
  Draws a grid line using Bresenham's algorithm.
- **`drawCircleTiles(map: TileMap, cx: number, cy: number, radius: number, tileIndex: number): void`**
  Draws a filled circular region on the map.
- **`stampTiles(map: TileMap, destX: number, destY: number, stamp: number[][]): void`**
  Copies a 2D grid layout matrix onto the map.
- **`stampTilemap(destMap: TileMap, destX: number, destY: number, srcMap: TileMap, srcX?: number, srcY?: number, srcW?: number, srcH?: number): void`**
  Copies a rectangular region from one map onto another.

### Noise

Defined in [noise.ts](src/physics/noise.ts)

- **`noise2D(x: number, y: number): number`**
  Generates deterministic, continuous 2D value noise in the range [0, 1].
- **`fractalNoise2D(x: number, y: number, octaves?: number, persistence?: number): number`**
  Layers multiple noise octaves to generate fractal landscapes or organic shapes.

### Verlet Physics

Defined in [verlet.ts](src/physics/verlet.ts)

- **`createVerletPoint(pos: Vec2, pinned?: boolean): VerletPoint`**
  Instantiates a particle point.
- **`createVerletStick(p1: VerletPoint, p2: VerletPoint, restLength?: number): VerletStick`**
  Creates a constraint stick linking two points.
- **`createVerletRope(start: Vec2, end: Vec2, pointCount: number, pinStart?: boolean, pinEnd?: boolean): VerletRope`**
  Generates a linear chain of verlet points and sticks.
- **`verletIntegrate(points: VerletPoint[], gravity: Vec2, friction: number, dt: number): void`**
  Integrates motion equations for all points under gravity forces.
- **`verletSolveStick(stick: VerletStick): void`**
  Resolves stretching stick constraint forces.
- **`updateVerletRope(rope: VerletRope, gravity: Vec2, friction: number, iterations: number, dt: number): void`**
  Updates rope nodes positions and solves stick constraints over multiple relaxation iterations.

### Spatial Grid

Defined in [spatialGrid.ts](src/physics/spatialGrid.ts)

- **`createSpatialGrid<T>(cellSize: number): SpatialGrid<T>`**
  Creates a hashing map grid for rapid spatial/proximity queries.
- **`SpatialGrid`** (Class)
  - `insert(id: T, box: AABB): void` - Registers an item inside the overlapping grid cells.
  - `query(box: AABB): T[]` - Retrieves all unique item IDs residing in overlapping grid cells.
  - `clear(): void` - Empties all grid buckets.

## FX & Particle Presets

Defined in [particlePresets.ts](src/plugins/particlePresets.ts)

Accessible via `fx.*` namespace. Generates particle explosion definitions:

- **`fx.explosion(overrides?: Partial<EmitParams>): EmitParams`**
- **`fx.fire(overrides?: Partial<EmitParams>): EmitParams`**
- **`fx.rain(overrides?: Partial<EmitParams>): EmitParams`**
- **`fx.smoke(overrides?: Partial<EmitParams>): EmitParams`**
- **`fx.sparks(overrides?: Partial<EmitParams>): EmitParams`**
