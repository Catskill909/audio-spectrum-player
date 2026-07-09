=== Audio Spectrum Player ===
Contributors: paulhenshaw
Tags: audio, visualizer, spectrum, web audio, media player
Requires at least: 5.0
Tested up to: 6.5
Stable tag: 1.1.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Adds a real-time audio spectrum visualizer above the default WordPress audio player using the Web Audio API.

== Description ==

Audio Spectrum Player enhances the default WordPress audio player (the `[audio]`
shortcode and the Audio block) with a real-time frequency visualizer. Orange
bars dance with the music as it plays, drawn on an HTML canvas using the Web
Audio API's AnalyserNode. No external libraries required.

= Features =

* Works with the default WordPress audio player (MediaElement.js) automatically
* Real-time frequency bars powered by the Web Audio API
* Retina / high-DPI aware canvas rendering
* Customizable colors, bar size, height, FFT size and smoothing via the
  `asp_visualizer_settings` filter

= Customization =

Add this to your theme's functions.php to customize:

`
add_filter( 'asp_visualizer_settings', function ( $settings ) {
    $settings['barColorStart'] = '#ff4d00'; // bottom of bars
    $settings['barColorEnd']   = '#ffa040'; // top of bars
    $settings['background']    = 'rgba(0, 0, 0, 0.85)';
    $settings['height']        = 140;       // px
    $settings['barWidth']      = 4;         // px
    $settings['barGap']        = 2;         // px
    $settings['fftSize']       = 2048;      // power of 2
    $settings['smoothing']     = 0.82;      // 0-1
    return $settings;
} );
`

== Installation ==

1. Upload the `audio-spectrum-player` folder to `/wp-content/plugins/`.
2. Activate the plugin through the Plugins screen in WordPress.
3. Any page using the `[audio]` shortcode or Audio block gets the visualizer.

== Notes ==

* Audio files served from a different domain/CDN must send CORS headers
  (`Access-Control-Allow-Origin`), otherwise the browser mutes the analyser
  output. The plugin adds `crossorigin="anonymous"` to audio elements to
  request CORS-enabled fetching.
* The visualizer starts on the first user-initiated play, per browser
  autoplay policies.

== Changelog ==

= 1.1.2 =
* Fix: scrubber seeking now works for Backblaze B2 files. B2 answers the
  browser's opening "Range: bytes=0-" request with 200 instead of 206,
  which makes browsers treat the stream as unseekable. The proxy now
  upgrades that response to a proper 206 with a Content-Range header.

= 1.1.1 =
* Fix: RSS feeds no longer have audio URLs rewritten to proxy URLs. The
  same-origin proxy rewrite is now skipped for feed and REST API requests,
  so feed consumers (podcast apps, etc.) get the original S3/CDN URLs.
* Fix: pausing or ending playback now clears the visualizer canvas (and
  resets peak caps) instead of leaving the bars frozen on screen.
* Fix: seeking now works for hosts that send no ETag/Last-Modified header
  (e.g. Backblaze B2). The proxy synthesizes a stable ETag (from
  x-bz-content-sha1 when available) so browsers accept Range (206)
  responses instead of restarting playback from the beginning.

= 1.1.0 =
* Same-origin signed streaming proxy for external audio (CORS bypass)
  with Range request passthrough for seeking.
* 10-band EQ with preamp and presets.
* Compressor with presets and live gain-reduction meter.
* Stereo balance, bypass A/B, clip LED.
* Meter styles: Bars, Mirror, Scope, Bars + EQ curve. Color themes.
* Peak-hold caps, log frequency mapping with treble tilt.
* Settings persistence via localStorage.

= 1.0.0 =
* Initial release.
