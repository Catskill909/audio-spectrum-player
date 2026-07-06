<?php
/**
 * Plugin Name:       Audio Spectrum Player
 * Plugin URI:        https://rarefunk.com
 * Description:       Adds a real-time audio spectrum visualizer (Web Audio API) above the default WordPress audio player.
 * Version:           1.1.0
 * Author:            Paul Henshaw
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       audio-spectrum-player
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ASP_VERSION', '1.1.0' );
define( 'ASP_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

/**
 * Enqueue front-end assets.
 */
function asp_enqueue_assets() {
	wp_enqueue_style(
		'asp-visualizer',
		ASP_PLUGIN_URL . 'assets/css/asp-visualizer.css',
		array(),
		ASP_VERSION
	);

	wp_enqueue_style(
		'asp-panel',
		ASP_PLUGIN_URL . 'assets/css/asp-panel.css',
		array( 'asp-visualizer' ),
		ASP_VERSION
	);

	wp_enqueue_script(
		'asp-visualizer',
		ASP_PLUGIN_URL . 'assets/js/asp-visualizer.js',
		array(),
		ASP_VERSION,
		true
	);

	wp_enqueue_script(
		'asp-panel',
		ASP_PLUGIN_URL . 'assets/js/asp-panel.js',
		array( 'asp-visualizer' ),
		ASP_VERSION,
		true
	);

	/**
	 * Filter the visualizer settings.
	 *
	 * @param array $settings {
	 *     @type string $barColorStart Gradient start color (bottom of bars).
	 *     @type string $barColorEnd   Gradient end color (top of bars).
	 *     @type string $background    Canvas background color.
	 *     @type int    $height        Canvas height in pixels.
	 *     @type int    $barWidth      Bar width in pixels.
	 *     @type int    $barGap        Gap between bars in pixels.
	 *     @type int    $fftSize       AnalyserNode fftSize (power of 2, 32-32768).
	 *     @type float  $smoothing     AnalyserNode smoothingTimeConstant (0-1).
	 * }
	 */
	$settings = apply_filters(
		'asp_visualizer_settings',
		array(
			'barColorStart' => '#ff4d00',
			'barColorEnd'   => '#ffa040',
			'background'    => 'rgba(0, 0, 0, 0.85)',
			'height'        => 140,
			'barWidth'      => 4,
			'barGap'        => 2,
			'fftSize'       => 2048,
			'smoothing'     => 0.82,
			'peakCaps'      => true,
			'meterMode'     => 'bars',
			'theme'         => 'sunset',
		)
	);

	wp_localize_script( 'asp-visualizer', 'aspSettings', $settings );
}
add_action( 'wp_enqueue_scripts', 'asp_enqueue_assets' );

/**
 * Generate the HMAC signature for a proxied URL so the proxy
 * only streams URLs that this site itself embedded (not an open proxy).
 *
 * @param string $url Remote audio URL.
 * @return string
 */
function asp_proxy_signature( $url ) {
	return hash_hmac( 'sha256', $url, wp_salt( 'auth' ) );
}

/**
 * Build a same-origin proxy URL for a remote audio file.
 *
 * @param string $url Remote audio URL.
 * @return string
 */
function asp_get_proxy_url( $url ) {
	return home_url( '/' ) . '?asp_stream=' . rawurlencode( $url ) . '&asp_sig=' . asp_proxy_signature( $url );
}

/**
 * Rewrite external audio src attributes in player HTML to go through
 * the same-origin proxy so the Web Audio API can analyse them without
 * the remote host needing a CORS policy.
 *
 * @param string $html Player HTML.
 * @return string
 */
function asp_rewrite_audio_sources( $html ) {
	if ( false === strpos( $html, '<audio' ) ) {
		return $html;
	}

	$site_host = wp_parse_url( home_url(), PHP_URL_HOST );

	$html = preg_replace_callback(
		'/\ssrc=(["\'])(https?:\/\/[^"\']+)\1/i',
		function ( $matches ) use ( $site_host ) {
			$url  = html_entity_decode( $matches[2], ENT_QUOTES );
			$host = wp_parse_url( $url, PHP_URL_HOST );
			if ( ! $host || strtolower( $host ) === strtolower( $site_host ) ) {
				return $matches[0];
			}
			return ' src=' . $matches[1] . esc_url( asp_get_proxy_url( $url ) ) . $matches[1];
		},
		$html
	);

	return $html;
}
add_filter( 'wp_audio_shortcode', 'asp_rewrite_audio_sources' );
add_filter( 'render_block_core/audio', 'asp_rewrite_audio_sources' );

/**
 * Stream a signed remote audio URL through this site (same-origin),
 * passing Range requests through so seeking works.
 */
function asp_handle_proxy_request() {
	if ( empty( $_GET['asp_stream'] ) || empty( $_GET['asp_sig'] ) ) {
		return;
	}

	$url = wp_unslash( $_GET['asp_stream'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
	$sig = wp_unslash( $_GET['asp_sig'] );    // phpcs:ignore WordPress.Security.ValidatedSanitizedInput

	if ( ! hash_equals( asp_proxy_signature( $url ), $sig ) ) {
		status_header( 403 );
		exit;
	}

	$scheme = wp_parse_url( $url, PHP_URL_SCHEME );
	if ( ! in_array( $scheme, array( 'http', 'https' ), true ) || ! function_exists( 'curl_init' ) ) {
		status_header( 400 );
		exit;
	}

	// Prevent PHP timeouts / buffering for large files.
	if ( function_exists( 'set_time_limit' ) ) {
		set_time_limit( 0 );
	}
	while ( ob_get_level() > 0 ) {
		ob_end_clean();
	}
	session_write_close();

	$ch = curl_init( $url );
	curl_setopt( $ch, CURLOPT_FOLLOWLOCATION, true );
	curl_setopt( $ch, CURLOPT_MAXREDIRS, 3 );
	curl_setopt( $ch, CURLOPT_CONNECTTIMEOUT, 15 );
	curl_setopt( $ch, CURLOPT_BUFFERSIZE, 8192 );

	if ( ! empty( $_SERVER['HTTP_RANGE'] ) ) {
		curl_setopt( $ch, CURLOPT_HTTPHEADER, array( 'Range: ' . wp_unslash( $_SERVER['HTTP_RANGE'] ) ) ); // phpcs:ignore
	}

	curl_setopt(
		$ch,
		CURLOPT_HEADERFUNCTION,
		function ( $ch, $header ) {
			$trimmed = trim( $header );
			if ( preg_match( '/^HTTP\/[\d.]+\s+(\d+)/', $trimmed, $m ) ) {
				$code = (int) $m[1];
				if ( $code < 300 || $code >= 400 ) {
					status_header( $code );
				}
			} elseif ( preg_match( '/^(Content-Type|Content-Length|Content-Range|Accept-Ranges|Last-Modified|ETag):/i', $trimmed ) ) {
				header( $trimmed );
			}
			return strlen( $header );
		}
	);

	curl_setopt(
		$ch,
		CURLOPT_WRITEFUNCTION,
		function ( $ch, $data ) {
			echo $data; // phpcs:ignore WordPress.Security.EscapeOutput
			flush();
			return connection_aborted() ? 0 : strlen( $data );
		}
	);

	curl_exec( $ch );
	curl_close( $ch );
	exit;
}
add_action( 'init', 'asp_handle_proxy_request' );
