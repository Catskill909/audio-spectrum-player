/**
 * Audio Spectrum Player - engine.
 *
 * Real-time visualizer + Web Audio processing chain (preamp, 10-band EQ,
 * compressor, balance) for the default WordPress audio player.
 *
 * Graph:
 * source -> preamp -> eq[0..9] -> compressor -> makeup -> panner -> wet \
 *        \-> dry ----------------------------------------------------- +-> analyser -> speakers
 */
( function () {
	'use strict';

	var defaults = {
		barColorStart: '#ff4d00',
		barColorEnd: '#ffa040',
		background: 'rgba(0, 0, 0, 0.85)',
		height: 140,
		barWidth: 4,
		barGap: 2,
		fftSize: 2048,
		smoothing: 0.82,
		peakCaps: true,
		meterMode: 'bars'
	};

	var settings = Object.assign( {}, defaults, window.aspSettings || {} );
	settings.height = parseInt( settings.height, 10 ) || defaults.height;
	settings.barWidth = parseInt( settings.barWidth, 10 ) || defaults.barWidth;
	settings.barGap = parseInt( settings.barGap, 10 ) || defaults.barGap;
	settings.fftSize = parseInt( settings.fftSize, 10 ) || defaults.fftSize;
	settings.smoothing = parseFloat( settings.smoothing ) || defaults.smoothing;

	var EQ_FREQS = [ 31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 ];

	var EQ_PRESETS = {
		flat: { label: 'Flat', eq: [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ] },
		bass: { label: 'Bass Boost', eq: [ 7, 6, 5, 3, 1, 0, 0, 0, 0, 0 ] },
		vinyl: { label: 'Vinyl Warmth', eq: [ 3, 4, 3, 1, 0, -1, -1, -2, -3, -4 ] },
		vocal: { label: 'Vocal / Radio', eq: [ -2, -1, 0, 2, 4, 4, 3, 1, -1, -2 ] },
		club: { label: 'Club', eq: [ 5, 4, 2, 0, -1, 0, 1, 3, 4, 3 ] },
		loud: { label: 'Loudness', eq: [ 6, 5, 3, 1, 0, 0, 1, 3, 4, 5 ] }
	};

	var COMP_PRESETS = {
		off: { label: 'Off', comp: { threshold: 0, knee: 30, ratio: 1, attack: 0.01, release: 0.25, makeup: 0 } },
		gentle: { label: 'Gentle', comp: { threshold: -18, knee: 25, ratio: 2, attack: 0.02, release: 0.3, makeup: 2 } },
		punchy: { label: 'Punchy', comp: { threshold: -24, knee: 10, ratio: 4, attack: 0.005, release: 0.15, makeup: 4 } },
		radio: { label: 'Radio', comp: { threshold: -30, knee: 6, ratio: 8, attack: 0.003, release: 0.25, makeup: 6 } },
		brick: { label: 'Brickwall', comp: { threshold: -40, knee: 0, ratio: 20, attack: 0.001, release: 0.1, makeup: 8 } }
	};

	var METER_MODES = {
		bars: 'Bars',
		mirror: 'Mirror',
		scope: 'Scope',
		curve: 'Bars + EQ'
	};

	/*
	 * Color themes. `start`/`end` feed the gradient styles.
	 * `mode` selects how bars are colored:
	 *   gradient - vertical two-stop gradient
	 *   heat     - each bar colored by its level (green -> red)
	 *   rainbow  - hue mapped across the frequency axis
	 */
	var THEMES = {
		sunset: { label: 'Sunset', mode: 'gradient', start: '#ff4d00', end: '#ffa040' },
		heat: { label: 'Heat', mode: 'heat', start: '#2ecc40', end: '#ff4136' },
		spectrum: { label: 'Spectrum', mode: 'rainbow', start: '#ff3b30', end: '#af52de' },
		aurora: { label: 'Aurora', mode: 'gradient', start: '#00e5c3', end: '#7a5cff' },
		mono: { label: 'Mono', mode: 'gradient', start: '#8a9099', end: '#f5f6f7' }
	};

	function heatColor( v ) {
		// 0 -> green (120), 1 -> red (0), through yellow/orange.
		var hue = Math.round( 120 - 120 * Math.min( 1, v * 1.15 ) );
		return 'hsl(' + hue + ', 90%, 52%)';
	}

	function rainbowColor( t ) {
		// bass red (0) -> treble violet (290).
		return 'hsl(' + Math.round( t * 290 ) + ', 85%, 55%)';
	}

	var STORAGE_KEY = 'asp-chain-v2';
	var RAMP = 0.04;

	var audioCtx = null;

	function getAudioContext() {
		if ( ! audioCtx ) {
			var Ctx = window.AudioContext || window.webkitAudioContext;
			if ( ! Ctx ) {
				return null;
			}
			audioCtx = new Ctx();
		}
		return audioCtx;
	}

	/* ------------------------------------------------------------------ */
	/* AudioChain                                                          */
	/* ------------------------------------------------------------------ */

	function AudioChain( ctx, source ) {
		this.ctx = ctx;

		this.preamp = ctx.createGain();
		this.filters = EQ_FREQS.map( function ( freq, i ) {
			var f = ctx.createBiquadFilter();
			if ( 0 === i ) {
				f.type = 'lowshelf';
			} else if ( EQ_FREQS.length - 1 === i ) {
				f.type = 'highshelf';
			} else {
				f.type = 'peaking';
				f.Q.value = 1.1;
			}
			f.frequency.value = freq;
			f.gain.value = 0;
			return f;
		} );
		this.compressor = ctx.createDynamicsCompressor();
		this.compressor.threshold.value = 0;
		this.compressor.ratio.value = 1;
		this.makeup = ctx.createGain();
		this.panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
		this.wet = ctx.createGain();
		this.dry = ctx.createGain();
		this.dry.gain.value = 0;
		this.analyser = ctx.createAnalyser();
		this.analyser.fftSize = settings.fftSize;
		this.analyser.smoothingTimeConstant = settings.smoothing;

		// Wire it up.
		source.connect( this.preamp );
		var node = this.preamp;
		this.filters.forEach( function ( f ) {
			node.connect( f );
			node = f;
		} );
		node.connect( this.compressor );
		this.compressor.connect( this.makeup );
		this.makeup.connect( this.panner );
		this.panner.connect( this.wet );
		this.wet.connect( this.analyser );
		this.preamp.connect( this.dry );
		this.dry.connect( this.analyser );
		this.analyser.connect( ctx.destination );

		this.state = {
			eqPreset: 'flat',
			compPreset: 'off',
			meter: METER_MODES[ settings.meterMode ] ? settings.meterMode : 'bars',
			theme: THEMES[ settings.theme ] ? settings.theme : 'sunset',
			bypass: false,
			preampDb: 0,
			balance: 0,
			eq: EQ_FREQS.map( function () {
				return 0;
			} ),
			comp: Object.assign( {}, COMP_PRESETS.off.comp )
		};

		this.loadState();
		this.applyState();
	}

	AudioChain.prototype.ramp = function ( param, value ) {
		var now = this.ctx.currentTime;
		param.cancelScheduledValues( now );
		param.setTargetAtTime( value, now, RAMP );
	};

	AudioChain.prototype.setBand = function ( index, db ) {
		db = Math.max( -12, Math.min( 12, db ) );
		this.state.eq[ index ] = db;
		this.state.eqPreset = 'custom';
		this.ramp( this.filters[ index ].gain, db );
		this.saveState();
	};

	AudioChain.prototype.setComp = function ( key, value ) {
		this.state.comp[ key ] = value;
		this.state.compPreset = 'custom';
		if ( 'makeup' === key ) {
			this.ramp( this.makeup.gain, Math.pow( 10, value / 20 ) );
		} else {
			this.ramp( this.compressor[ key ], value );
		}
		this.saveState();
	};

	AudioChain.prototype.setPreamp = function ( db ) {
		db = Math.max( -12, Math.min( 12, db ) );
		this.state.preampDb = db;
		this.ramp( this.preamp.gain, Math.pow( 10, db / 20 ) );
		this.saveState();
	};

	AudioChain.prototype.setBalance = function ( v ) {
		v = Math.max( -1, Math.min( 1, v ) );
		this.state.balance = v;
		if ( this.panner.pan ) {
			this.ramp( this.panner.pan, v );
		}
		this.saveState();
	};

	AudioChain.prototype.setBypass = function ( on ) {
		this.state.bypass = !! on;
		this.ramp( this.wet.gain, on ? 0 : 1 );
		this.ramp( this.dry.gain, on ? 1 : 0 );
		this.saveState();
	};

	AudioChain.prototype.applyEQPreset = function ( name ) {
		var preset = EQ_PRESETS[ name ];
		if ( ! preset ) {
			return;
		}
		this.state.eqPreset = name;
		this.state.eq = preset.eq.slice();
		this.applyState();
		this.saveState();
	};

	AudioChain.prototype.applyCompPreset = function ( name ) {
		var preset = COMP_PRESETS[ name ];
		if ( ! preset ) {
			return;
		}
		this.state.compPreset = name;
		this.state.comp = Object.assign( {}, preset.comp );
		this.applyState();
		this.saveState();
	};

	AudioChain.prototype.setMeter = function ( mode ) {
		if ( METER_MODES[ mode ] ) {
			this.state.meter = mode;
			this.saveState();
		}
	};

	AudioChain.prototype.setTheme = function ( name ) {
		if ( THEMES[ name ] ) {
			this.state.theme = name;
			this.saveState();
		}
	};

	AudioChain.prototype.isEQFlat = function () {
		return this.state.eq.every( function ( v ) {
			return 0 === v;
		} );
	};

	AudioChain.prototype.applyState = function () {
		var s = this.state;
		var self = this;
		this.ramp( this.preamp.gain, Math.pow( 10, s.preampDb / 20 ) );
		s.eq.forEach( function ( db, i ) {
			self.ramp( self.filters[ i ].gain, db );
		} );
		this.ramp( this.compressor.threshold, s.comp.threshold );
		this.ramp( this.compressor.knee, s.comp.knee );
		this.ramp( this.compressor.ratio, s.comp.ratio );
		this.compressor.attack.value = s.comp.attack;
		this.compressor.release.value = s.comp.release;
		this.ramp( this.makeup.gain, Math.pow( 10, s.comp.makeup / 20 ) );
		if ( this.panner.pan ) {
			this.ramp( this.panner.pan, s.balance );
		}
		this.ramp( this.wet.gain, s.bypass ? 0 : 1 );
		this.ramp( this.dry.gain, s.bypass ? 1 : 0 );
	};

	AudioChain.prototype.getReduction = function () {
		var r = this.compressor.reduction;
		return 'number' === typeof r ? r : r.value || 0;
	};

	/**
	 * Combined EQ magnitude response (dB) at the given frequencies.
	 */
	AudioChain.prototype.getEQResponse = function ( freqs ) {
		var mag = new Float32Array( freqs.length );
		var phase = new Float32Array( freqs.length );
		var total = new Float32Array( freqs.length );
		this.filters.forEach( function ( f ) {
			f.getFrequencyResponse( freqs, mag, phase );
			for ( var i = 0; i < freqs.length; i++ ) {
				total[ i ] += 20 * Math.log10( mag[ i ] || 0.0001 );
			}
		} );
		return total;
	};

	AudioChain.prototype.saveState = function () {
		try {
			window.localStorage.setItem( STORAGE_KEY, JSON.stringify( this.state ) );
		} catch ( e ) {
			/* private mode etc. */
		}
	};

	AudioChain.prototype.loadState = function () {
		try {
			var raw = window.localStorage.getItem( STORAGE_KEY );
			if ( raw ) {
				var saved = JSON.parse( raw );
				this.state = Object.assign( this.state, saved );
				this.state.comp = Object.assign( {}, COMP_PRESETS.off.comp, saved.comp || {} );
				if ( ! METER_MODES[ this.state.meter ] ) {
					this.state.meter = 'bars';
				}
				if ( ! THEMES[ this.state.theme ] ) {
					this.state.theme = 'sunset';
				}
			}
		} catch ( e ) {
			/* corrupted storage - keep defaults */
		}
	};

	/* ------------------------------------------------------------------ */
	/* Visualizer                                                          */
	/* ------------------------------------------------------------------ */

	function getPlayerWrapper( audio ) {
		var el = audio;
		var wrapper = audio;
		while ( el && el !== document.body ) {
			if (
				el.classList &&
				( el.classList.contains( 'mejs-container' ) ||
					el.classList.contains( 'wp-audio-shortcode' ) ||
					el.classList.contains( 'wp-block-audio' ) )
			) {
				wrapper = el;
			}
			el = el.parentElement;
		}
		return wrapper;
	}

	function createCanvas( audio ) {
		var wrapper = getPlayerWrapper( audio );
		var container = document.createElement( 'div' );
		container.className = 'asp-visualizer';
		container.style.height = settings.height + 'px';

		var canvas = document.createElement( 'canvas' );
		container.appendChild( canvas );

		wrapper.parentNode.insertBefore( container, wrapper );

		return { container: container, canvas: canvas };
	}

	function resizeCanvas( canvas ) {
		var dpr = window.devicePixelRatio || 1;
		var rect = canvas.parentNode.getBoundingClientRect();
		canvas.width = Math.max( 1, Math.round( rect.width * dpr ) );
		canvas.height = Math.max( 1, Math.round( rect.height * dpr ) );
	}

	function setupVisualizer( audio ) {
		if ( audio.dataset.aspInit ) {
			return;
		}
		audio.dataset.aspInit = '1';

		var ctx = getAudioContext();
		if ( ! ctx ) {
			return;
		}

		var source;
		try {
			source = ctx.createMediaElementSource( audio );
		} catch ( e ) {
			return;
		}

		var chain = new AudioChain( ctx, source );
		var analyser = chain.analyser;

		var made = createCanvas( audio );
		var canvas = made.canvas;
		var canvasCtx = canvas.getContext( '2d' );
		var freqData = new Uint8Array( analyser.frequencyBinCount );
		var timeData = new Uint8Array( analyser.fftSize );
		var peaks = [];
		var rafId = null;
		var clipped = false;

		resizeCanvas( canvas );
		window.addEventListener( 'resize', function () {
			resizeCanvas( canvas );
		} );

		function drawEQCurve( w, h, dpr ) {
			var points = 64;
			var freqs = new Float32Array( points );
			var nyquist = ctx.sampleRate / 2;
			var minLog = Math.log10( 20 );
			var maxLog = Math.log10( Math.min( 20000, nyquist ) );
			for ( var i = 0; i < points; i++ ) {
				freqs[ i ] = Math.pow( 10, minLog + ( i / ( points - 1 ) ) * ( maxLog - minLog ) );
			}
			var db = chain.getEQResponse( freqs );

			canvasCtx.beginPath();
			for ( var j = 0; j < points; j++ ) {
				var x = ( j / ( points - 1 ) ) * w;
				var y = h / 2 - ( db[ j ] / 15 ) * ( h / 2 );
				if ( 0 === j ) {
					canvasCtx.moveTo( x, y );
				} else {
					canvasCtx.lineTo( x, y );
				}
			}
			canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
			canvasCtx.lineWidth = 1.5 * dpr;
			canvasCtx.stroke();
		}

		function barValues( barCount ) {
			// Logarithmic frequency mapping (like classic hardware analyzers)
			// so the octaves are spread evenly across the bars instead of
			// cramming all the music into the left edge.
			var nyquist = ctx.sampleRate / 2;
			var minFreq = 20;
			var maxFreq = Math.min( 16000, nyquist );
			var binHz = nyquist / freqData.length;
			var values = [];

			for ( var i = 0; i < barCount; i++ ) {
				var f0 = minFreq * Math.pow( maxFreq / minFreq, i / barCount );
				var f1 = minFreq * Math.pow( maxFreq / minFreq, ( i + 1 ) / barCount );
				var b0 = Math.floor( f0 / binHz );
				var b1 = Math.max( b0 + 1, Math.ceil( f1 / binHz ) );
				var peak = 0;
				for ( var b = b0; b < b1 && b < freqData.length; b++ ) {
					if ( freqData[ b ] > peak ) {
						peak = freqData[ b ];
					}
				}
				// Gentle treble tilt to counter natural spectral roll-off.
				var tilt = 0.85 + 0.45 * ( i / barCount );
				values.push( Math.min( 1, ( peak / 255 ) * tilt ) );
			}
			return values;
		}

		function drawBars( w, h, dpr, mirrored ) {
			var headroom = 0.78; // keep bars from pinning the top of the canvas
			var barWidth = settings.barWidth * dpr;
			var barGap = settings.barGap * dpr;
			var step = barWidth + barGap;
			var barCount = Math.floor( w / step );
			var values = barValues( barCount );
			var theme = THEMES[ chain.state.theme ] || THEMES.sunset;

			if ( 'gradient' === theme.mode ) {
				var gradient = canvasCtx.createLinearGradient( 0, h, 0, 0 );
				gradient.addColorStop( 0, theme.start );
				gradient.addColorStop( 1, theme.end );
				canvasCtx.fillStyle = gradient;
			}

			for ( var i = 0; i < barCount; i++ ) {
				if ( 'heat' === theme.mode ) {
					canvasCtx.fillStyle = heatColor( values[ i ] );
				} else if ( 'rainbow' === theme.mode ) {
					canvasCtx.fillStyle = rainbowColor( i / barCount );
				}
				var barHeight = Math.max( 2 * dpr, values[ i ] * h * headroom );
				if ( mirrored ) {
					var half = barHeight / 2;
					canvasCtx.fillRect( i * step, h / 2 - half, barWidth, barHeight );
				} else {
					canvasCtx.fillRect( i * step, h - barHeight, barWidth, barHeight );
				}

				if ( settings.peakCaps && ! mirrored ) {
					if ( undefined === peaks[ i ] || barHeight >= peaks[ i ] ) {
						peaks[ i ] = barHeight;
					} else {
						peaks[ i ] = Math.max( barHeight, peaks[ i ] - 1.2 * dpr );
					}
				}
			}

			if ( settings.peakCaps && ! mirrored ) {
				canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
				for ( var p = 0; p < barCount; p++ ) {
					if ( peaks[ p ] > 3 * dpr ) {
						canvasCtx.fillRect( p * step, h - peaks[ p ] - 2 * dpr, barWidth, 2 * dpr );
					}
				}
			}
		}

		function drawScope( w, h, dpr ) {
			canvasCtx.beginPath();
			var sliceWidth = w / timeData.length;
			for ( var i = 0; i < timeData.length; i++ ) {
				var v = timeData[ i ] / 128.0;
				var y = ( v * h ) / 2;
				if ( 0 === i ) {
					canvasCtx.moveTo( 0, y );
				} else {
					canvasCtx.lineTo( i * sliceWidth, y );
				}
			}
			var theme = THEMES[ chain.state.theme ] || THEMES.sunset;
			var gradient = canvasCtx.createLinearGradient( 0, 0, w, 0 );
			gradient.addColorStop( 0, theme.start );
			gradient.addColorStop( 1, theme.end );
			canvasCtx.strokeStyle = gradient;
			canvasCtx.lineWidth = 2 * dpr;
			canvasCtx.stroke();
		}

		function draw() {
			rafId = requestAnimationFrame( draw );

			analyser.getByteFrequencyData( freqData );
			analyser.getByteTimeDomainData( timeData );

			var w = canvas.width;
			var h = canvas.height;
			var dpr = window.devicePixelRatio || 1;

			canvasCtx.clearRect( 0, 0, w, h );
			canvasCtx.fillStyle = settings.background;
			canvasCtx.fillRect( 0, 0, w, h );

			var mode = chain.state.meter;

			if ( 'scope' === mode ) {
				drawScope( w, h, dpr );
			} else if ( 'mirror' === mode ) {
				drawBars( w, h, dpr, true );
			} else {
				drawBars( w, h, dpr, false );
				if ( 'curve' === mode && ! chain.state.bypass && ! chain.isEQFlat() ) {
					drawEQCurve( w, h, dpr );
				}
			}

			// Clip detection (post-chain waveform).
			clipped = false;
			for ( var t = 0; t < timeData.length; t += 8 ) {
				if ( timeData[ t ] < 3 || timeData[ t ] > 252 ) {
					clipped = true;
					break;
				}
			}
			if ( chain.onFrame ) {
				chain.onFrame( clipped );
			}
		}

		function start() {
			if ( ctx.state === 'suspended' ) {
				ctx.resume();
			}
			if ( ! rafId ) {
				draw();
			}
		}

		function stop() {
			if ( rafId ) {
				cancelAnimationFrame( rafId );
				rafId = null;
			}
			peaks = [];
			canvasCtx.clearRect( 0, 0, canvas.width, canvas.height );
			canvasCtx.fillStyle = settings.background;
			canvasCtx.fillRect( 0, 0, canvas.width, canvas.height );
		}

		audio.addEventListener( 'play', start );
		audio.addEventListener( 'pause', stop );
		audio.addEventListener( 'ended', stop );

		draw();
		stop();

		if ( ! audio.paused ) {
			start();
		}

		// Announce readiness so the control panel (asp-panel.js) can attach.
		document.dispatchEvent(
			new CustomEvent( 'asp:ready', {
				detail: {
					audio: audio,
					chain: chain,
					container: made.container,
					eqPresets: EQ_PRESETS,
					compPresets: COMP_PRESETS,
					meterModes: METER_MODES,
					themes: THEMES,
					eqFreqs: EQ_FREQS
				}
			} )
		);
	}

	function findAudioElements() {
		return document.querySelectorAll(
			'audio.wp-audio-shortcode, .wp-block-audio audio, .mejs-container audio'
		);
	}

	function init() {
		var audios = findAudioElements();

		audios.forEach( function ( audio ) {
			if ( audio.dataset.aspBound ) {
				return;
			}
			audio.dataset.aspBound = '1';

			audio.addEventListener(
				'play',
				function onFirstPlay() {
					audio.removeEventListener( 'play', onFirstPlay );
					setupVisualizer( audio );
					audio.dispatchEvent( new Event( 'play' ) );
				},
				{ once: false }
			);
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

	window.addEventListener( 'load', init );
} )();
