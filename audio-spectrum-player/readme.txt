=== Audio Spectrum Player ===
Contributors: paulhenshaw
Tags: audio, visualizer, spectrum, web audio, media player
Requires at least: 5.0
Tested up to: 6.5
Stable tag: 1.0.0
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

= 1.0.0 =
* Initial release.
