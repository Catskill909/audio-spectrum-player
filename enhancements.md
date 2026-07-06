# Audio Spectrum Player — Enhancements

## Requested (in progress)

### 1. Color themes for the meter
Orange reads as SoundCloud. Add selectable color looks, including colors that
communicate spectrum *heat* (level).

- **Sunset** — current orange gradient (default)
- **Heat** — per-bar color by level: green → yellow → orange → red (classic VU logic)
- **Spectrum** — hue mapped across frequency (bass red → treble violet, rainbow)
- **Aurora** — teal → violet gradient, cool modern look
- **Mono** — white/gray minimal, blends with any theme

### 2. Panel UI/UX cleanup — tabs
Current layout mixes EQ presets, meter select, clip and bypass in one confusing
header. Reorganize into tabs with strong visual grouping:

- **EQ tab** — presets, 10-band sliders, preamp, balance
- **COMP tab** — presets, threshold/knee/ratio/attack/release/makeup, GR meter
- **DISPLAY tab** — meter style (Bars / Mirror / Scope / Bars+EQ), color theme
- Header keeps global items only: tabs left, CLIP led + BYPASS right

## Brainstorm — future candidates

### Visual
- [ ] LED segment meter style (discrete blocks, classic hi-fi)
- [ ] Dot-matrix / particle style
- [ ] Circular / radial spectrum
- [ ] Waveform seek-bar (SoundCloud-style pre-rendered waveform as progress bar)
- [ ] Fullscreen visualizer mode
- [ ] Album art background with blur behind bars
- [ ] Custom theme builder (user picks 2 colors, saved per site)

### Audio
- [ ] A/B loop points for practice/review
- [ ] Playback speed control (0.5x–2x, pitch-preserved)
- [ ] Simple reverb / space (ConvolverNode)
- [ ] Mono fold-down toggle (mix check)
- [ ] Per-track settings memory (keyed by src) vs global

### Player / UX
- [ ] Playlist support — chain multiple audio blocks, continuous play
- [ ] Keyboard shortcuts (space play/pause, arrows seek, B bypass)
- [ ] Share timestamped link (?t=1:23)
- [ ] Download button (optional, per-post toggle)
- [ ] Mini/compact mode for sidebars

### WordPress admin
- [ ] Settings page: default theme, meter style, default height, enable/disable panel
- [ ] Per-block overrides via block attributes (Gutenberg panel)
- [ ] Shortcode attrs: [audio asp_theme="heat" asp_meter="scope"]

## Done
- [x] Real-time spectrum visualizer on default WP audio players
- [x] S3/external CORS bypass via signed same-origin proxy
- [x] 10-band EQ + preamp + presets
- [x] Compressor + presets + live GR meter
- [x] Stereo balance, bypass A/B, clip LED
- [x] Peak-hold caps, log frequency mapping w/ treble tilt
- [x] Meter styles: Bars, Mirror, Scope, Bars+EQ curve
- [x] Visual headroom (bars top out ~78%)
- [x] Settings persistence (localStorage)
