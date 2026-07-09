<?php
/**
 * Plugin Name:       Audio Spectrum Player
 * Plugin URI:        https://rarefunk.com
 * Description:       Adds a real-time audio spectrum visualizer (Web Audio API) above the default WordPress audio player.
 * Version:           1.1.2
 * Author:            Paul Henshaw
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       audio-spectrum-player
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ASP_VERSION', '1.1.2' );
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
	if ( is_feed() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return $html;
	}

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

	/*
	 * Compression MUST be off: gzip strips Content-Length and re-chunks
	 * the stream, which breaks duration detection and Range-based seeking
	 * (dead scrubber). Also stop proxy-level buffering and page caching.
	 */
	if ( function_exists( 'apache_setenv' ) ) {
		@apache_setenv( 'no-gzip', '1' );
	}
	@ini_set( 'zlib.output_compression', 'Off' );
	header( 'X-Accel-Buffering: no' );
	header( 'Cache-Control: no-store' );
	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		define( 'DONOTCACHEPAGE', true );
	}

	$is_head = isset( $_SERVER['REQUEST_METHOD'] ) && 'HEAD' === $_SERVER['REQUEST_METHOD'];

	$ch = curl_init( $url );
	curl_setopt( $ch, CURLOPT_FOLLOWLOCATION, true );
	if ( $is_head ) {
		curl_setopt( $ch, CURLOPT_NOBODY, true );
	}
	curl_setopt( $ch, CURLOPT_MAXREDIRS, 3 );
	curl_setopt( $ch, CURLOPT_CONNECTTIMEOUT, 15 );
	curl_setopt( $ch, CURLOPT_BUFFERSIZE, 8192 );

	if ( ! empty( $_SERVER['HTTP_RANGE'] ) ) {
		curl_setopt( $ch, CURLOPT_HTTPHEADER, array( 'Range: ' . wp_unslash( $_SERVER['HTTP_RANGE'] ) ) ); // phpcs:ignore
	}

	$upstream_status = 200;
	$sent_accept     = false;
	$sent_validator  = false;
	$content_sha1    = '';
	$content_length  = 0;
	$want_full_range = ! empty( $_SERVER['HTTP_RANGE'] ) && preg_match( '/^bytes=0-$/', trim( wp_unslash( $_SERVER['HTTP_RANGE'] ) ) ); // phpcs:ignore

	curl_setopt(
		$ch,
		CURLOPT_HEADERFUNCTION,
		function ( $ch, $header ) use ( &$upstream_status, &$sent_accept, &$sent_validator, &$content_sha1, &$content_length, $want_full_range, $url ) {
			$trimmed = trim( $header );
			if ( preg_match( '/^HTTP\/[\d.]+\s+(\d+)/', $trimmed, $m ) ) {
				$upstream_status = (int) $m[1];
				if ( $upstream_status < 300 || $upstream_status >= 400 ) {
					http_response_code( $upstream_status );
				}
			} elseif ( $upstream_status < 300 || $upstream_status >= 400 ) {
				// Only forward headers from the final (non-redirect) response.
				if ( preg_match( '/^(Content-Type|Content-Length|Content-Range|Accept-Ranges|Last-Modified|ETag):/i', $trimmed ) ) {
					header( $trimmed );
					if ( 0 === stripos( $trimmed, 'Accept-Ranges:' ) ) {
						$sent_accept = true;
					}
					if ( 0 === stripos( $trimmed, 'Last-Modified:' ) || 0 === stripos( $trimmed, 'ETag:' ) ) {
						$sent_validator = true;
					}
					if ( 0 === stripos( $trimmed, 'Content-Length:' ) ) {
						$content_length = (int) trim( substr( $trimmed, 15 ) );
					}
				} elseif ( 0 === stripos( $trimmed, 'x-bz-content-sha1:' ) ) {
					// Backblaze B2 exposes a content hash instead of an ETag.
					$content_sha1 = trim( substr( $trimmed, 18 ) );
				} elseif ( '' === $trimmed ) {
					// End of final headers: make sure the browser knows it can seek.
					if ( ! $sent_accept ) {
						header( 'Accept-Ranges: bytes' );
						$sent_accept = true;
					}
					/*
					 * Browsers refuse to combine Range (206) responses without a
					 * validator (ETag/Last-Modified) and restart playback from
					 * byte 0 on seek. Some hosts (e.g. Backblaze B2) send neither,
					 * so synthesize a stable ETag.
					 */
					if ( ! $sent_validator ) {
						$etag = $content_sha1 ? $content_sha1 : md5( $url );
						header( 'ETag: "' . $etag . '"' );
						$sent_validator = true;
					}
					/*
					 * Some hosts (e.g. Backblaze B2) answer "Range: bytes=0-"
					 * with 200 instead of 206. Browsers open media streams with
					 * exactly that header and treat a 200 reply as unseekable,
					 * restarting playback on every seek. The body is identical
					 * (full file from byte 0), so upgrade the response to a
					 * proper 206 with Content-Range.
					 */
					if ( $want_full_range && 200 === $upstream_status && $content_length > 0 ) {
						http_response_code( 206 );
						header( 'Content-Range: bytes 0-' . ( $content_length - 1 ) . '/' . $content_length );
					}
				}
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
