/**
 * Audio Spectrum Player - control panel UI.
 *
 * Winamp-inspired EQ + compressor panel. Attaches to each player when
 * the engine (asp-visualizer.js) dispatches 'asp:ready'.
 */
( function () {
	'use strict';

	var EQ_LABELS = [ '31', '62', '125', '250', '500', '1K', '2K', '4K', '8K', '16K' ];

	var COMP_PARAMS = [
		{ key: 'threshold', label: 'THRESH', min: -60, max: 0, step: 1, unit: 'dB' },
		{ key: 'knee', label: 'KNEE', min: 0, max: 40, step: 1, unit: 'dB' },
		{ key: 'ratio', label: 'RATIO', min: 1, max: 20, step: 0.5, unit: ':1' },
		{ key: 'attack', label: 'ATTACK', min: 0.001, max: 0.3, step: 0.001, unit: 's' },
		{ key: 'release', label: 'RELEASE', min: 0.05, max: 1, step: 0.01, unit: 's' },
		{ key: 'makeup', label: 'MAKEUP', min: 0, max: 12, step: 0.5, unit: 'dB' }
	];

	function el( tag, className, parent ) {
		var node = document.createElement( tag );
		if ( className ) {
			node.className = className;
		}
		if ( parent ) {
			parent.appendChild( node );
		}
		return node;
	}

	function formatValue( param, value ) {
		if ( 'attack' === param.key || 'release' === param.key ) {
			return Math.round( value * 1000 ) + 'ms';
		}
		if ( 'ratio' === param.key ) {
			return value + ':1';
		}
		return value + param.unit;
	}

	function buildPanel( detail ) {
		var audio = detail.audio;
		var chain = detail.chain;
		var container = detail.container;
		var eqPresets = detail.eqPresets;
		var compPresets = detail.compPresets;

		/* Toggle button on the visualizer */
		var toggle = el( 'button', 'asp-panel-toggle', container );
		toggle.type = 'button';
		toggle.setAttribute( 'aria-label', 'Audio settings' );
		toggle.innerHTML =
			'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="14" r="2"/></svg>';

		/* Panel shell */
		var panel = el( 'div', 'asp-panel' );
		panel.hidden = true;
		container.parentNode.insertBefore( panel, container.nextSibling );

		toggle.addEventListener( 'click', function () {
			panel.hidden = ! panel.hidden;
			toggle.classList.toggle( 'is-open', ! panel.hidden );
		} );

		/* ------ Header: tabs + bypass + clip LED ------ */
		var header = el( 'div', 'asp-panel__header', panel );

		var tabBar = el( 'div', 'asp-tabs', header );
		var tabButtons = {};
		var tabPanes = {};

		function addTab( key, label ) {
			var btn = el( 'button', 'asp-tab', tabBar );
			btn.type = 'button';
			btn.textContent = label;
			btn.addEventListener( 'click', function () {
				selectTab( key );
			} );
			tabButtons[ key ] = btn;
		}

		function selectTab( key ) {
			Object.keys( tabButtons ).forEach( function ( k ) {
				tabButtons[ k ].classList.toggle( 'is-active', k === key );
				if ( tabPanes[ k ] ) {
					tabPanes[ k ].hidden = k !== key;
				}
			} );
		}

		addTab( 'eq', 'EQ' );
		addTab( 'comp', 'COMP' );
		addTab( 'display', 'DISPLAY' );

		var headRight = el( 'div', 'asp-panel__header-right', header );

		var clipLed = el( 'span', 'asp-clip', headRight );
		clipLed.textContent = 'CLIP';

		var bypassBtn = el( 'button', 'asp-bypass', headRight );
		bypassBtn.type = 'button';
		bypassBtn.textContent = 'BYPASS';
		bypassBtn.addEventListener( 'click', function () {
			chain.setBypass( ! chain.state.bypass );
			syncUI();
		} );

		/* ------ Body ------ */
		var body = el( 'div', 'asp-panel__body', panel );

		/* EQ tab */
		var eqSection = el( 'div', 'asp-section asp-section--eq', body );
		tabPanes.eq = eqSection;

		var presetWrap = el( 'div', 'asp-presets', eqSection );
		var eqPresetButtons = {};
		Object.keys( eqPresets ).forEach( function ( key ) {
			var btn = el( 'button', 'asp-preset', presetWrap );
			btn.type = 'button';
			btn.textContent = eqPresets[ key ].label;
			btn.addEventListener( 'click', function () {
				chain.applyEQPreset( key );
				syncUI();
			} );
			eqPresetButtons[ key ] = btn;
		} );

		var eqRow = el( 'div', 'asp-eq', eqSection );

		function makeVSlider( parent, label, min, max, step, value, onInput, onReset ) {
			var wrap = el( 'div', 'asp-vslider', parent );
			var readout = el( 'span', 'asp-vslider__value', wrap );
			var input = el( 'input', 'asp-vslider__input', wrap );
			input.type = 'range';
			input.min = min;
			input.max = max;
			input.step = step;
			input.value = value;
			var lab = el( 'span', 'asp-vslider__label', wrap );
			lab.textContent = label;

			function update() {
				var v = parseFloat( input.value );
				readout.textContent = ( v > 0 ? '+' : '' ) + v;
				onInput( v );
			}
			input.addEventListener( 'input', update );
			input.addEventListener( 'dblclick', function () {
				input.value = onReset !== undefined ? onReset : 0;
				update();
			} );
			readout.textContent = ( value > 0 ? '+' : '' ) + value;
			return input;
		}

		var preampInput = makeVSlider( eqRow, 'PRE', -12, 12, 0.5, chain.state.preampDb, function ( v ) {
			chain.setPreamp( v );
		} );
		el( 'div', 'asp-eq__divider', eqRow );

		var eqInputs = EQ_LABELS.map( function ( label, i ) {
			return makeVSlider( eqRow, label, -12, 12, 0.5, chain.state.eq[ i ], function ( v ) {
				chain.setBand( i, v );
				markCustom( eqPresetButtons );
			} );
		} );

		/* Balance */
		var balWrap = el( 'div', 'asp-balance', eqSection );
		var balLabel = el( 'span', 'asp-balance__label', balWrap );
		balLabel.textContent = 'BALANCE';
		var balInput = el( 'input', 'asp-balance__input', balWrap );
		balInput.type = 'range';
		balInput.min = -1;
		balInput.max = 1;
		balInput.step = 0.05;
		balInput.value = chain.state.balance;
		var balReadout = el( 'span', 'asp-balance__value', balWrap );

		function balText( v ) {
			if ( Math.abs( v ) < 0.03 ) {
				return 'C';
			}
			return ( v < 0 ? 'L' : 'R' ) + Math.round( Math.abs( v ) * 100 );
		}
		balReadout.textContent = balText( chain.state.balance );
		balInput.addEventListener( 'input', function () {
			var v = parseFloat( balInput.value );
			chain.setBalance( v );
			balReadout.textContent = balText( v );
		} );
		balInput.addEventListener( 'dblclick', function () {
			balInput.value = 0;
			chain.setBalance( 0 );
			balReadout.textContent = 'C';
		} );

		/* Compressor tab */
		var compSection = el( 'div', 'asp-section asp-section--comp', body );
		tabPanes.comp = compSection;

		var compPresetWrap = el( 'div', 'asp-presets asp-presets--comp', compSection );
		var compPresetButtons = {};
		Object.keys( compPresets ).forEach( function ( key ) {
			var btn = el( 'button', 'asp-preset', compPresetWrap );
			btn.type = 'button';
			btn.textContent = compPresets[ key ].label;
			btn.addEventListener( 'click', function () {
				chain.applyCompPreset( key );
				syncUI();
			} );
			compPresetButtons[ key ] = btn;
		} );

		var compGrid = el( 'div', 'asp-comp', compSection );
		var compInputs = {};

		COMP_PARAMS.forEach( function ( param ) {
			var wrap = el( 'div', 'asp-hslider', compGrid );
			var top = el( 'div', 'asp-hslider__top', wrap );
			var lab = el( 'span', 'asp-hslider__label', top );
			lab.textContent = param.label;
			var readout = el( 'span', 'asp-hslider__value', top );

			var input = el( 'input', 'asp-hslider__input', wrap );
			input.type = 'range';
			input.min = param.min;
			input.max = param.max;
			input.step = param.step;
			input.value = chain.state.comp[ param.key ];
			readout.textContent = formatValue( param, chain.state.comp[ param.key ] );

			input.addEventListener( 'input', function () {
				var v = parseFloat( input.value );
				chain.setComp( param.key, v );
				readout.textContent = formatValue( param, v );
				markCustom( compPresetButtons );
			} );

			compInputs[ param.key ] = { input: input, readout: readout, param: param };
		} );

		/* Gain reduction meter */
		var meterWrap = el( 'div', 'asp-gr', compSection );
		var meterLabel = el( 'span', 'asp-gr__label', meterWrap );
		meterLabel.textContent = 'GR';
		var meterTrack = el( 'div', 'asp-gr__track', meterWrap );
		var meterFill = el( 'div', 'asp-gr__fill', meterTrack );
		var meterDb = el( 'span', 'asp-gr__db', meterWrap );
		meterDb.textContent = '0.0 dB';

		/* Display tab */
		var dispSection = el( 'div', 'asp-section asp-section--display', body );
		tabPanes.display = dispSection;

		el( 'h4', 'asp-section__title', dispSection ).textContent = 'METER STYLE';
		var meterWrapRow = el( 'div', 'asp-presets', dispSection );
		var meterButtons = {};
		Object.keys( detail.meterModes || {} ).forEach( function ( key ) {
			var btn = el( 'button', 'asp-preset', meterWrapRow );
			btn.type = 'button';
			btn.textContent = detail.meterModes[ key ];
			btn.addEventListener( 'click', function () {
				chain.setMeter( key );
				syncUI();
			} );
			meterButtons[ key ] = btn;
		} );

		el( 'h4', 'asp-section__title', dispSection ).textContent = 'COLOR THEME';
		var themeRow = el( 'div', 'asp-presets asp-themes', dispSection );
		var themeButtons = {};
		Object.keys( detail.themes || {} ).forEach( function ( key ) {
			var t = detail.themes[ key ];
			var btn = el( 'button', 'asp-preset asp-theme', themeRow );
			btn.type = 'button';
			var dot = el( 'span', 'asp-theme__dot', btn );
			dot.style.background = 'linear-gradient(135deg, ' + t.start + ', ' + t.end + ')';
			var lab = el( 'span', '', btn );
			lab.textContent = t.label;
			btn.addEventListener( 'click', function () {
				chain.setTheme( key );
				syncUI();
			} );
			themeButtons[ key ] = btn;
		} );

		/* ------ Sync helpers ------ */
		function markCustom( group ) {
			Object.keys( group ).forEach( function ( key ) {
				group[ key ].classList.remove( 'is-active' );
			} );
		}

		function syncUI() {
			var s = chain.state;
			Object.keys( eqPresetButtons ).forEach( function ( key ) {
				eqPresetButtons[ key ].classList.toggle( 'is-active', s.eqPreset === key );
			} );
			Object.keys( compPresetButtons ).forEach( function ( key ) {
				compPresetButtons[ key ].classList.toggle( 'is-active', s.compPreset === key );
			} );
			bypassBtn.classList.toggle( 'is-active', s.bypass );
			panel.classList.toggle( 'is-bypassed', s.bypass );
			preampInput.value = s.preampDb;
			preampInput.parentNode.querySelector( '.asp-vslider__value' ).textContent =
				( s.preampDb > 0 ? '+' : '' ) + s.preampDb;
			eqInputs.forEach( function ( input, i ) {
				input.value = s.eq[ i ];
				input.parentNode.querySelector( '.asp-vslider__value' ).textContent =
					( s.eq[ i ] > 0 ? '+' : '' ) + s.eq[ i ];
			} );
			Object.keys( compInputs ).forEach( function ( key ) {
				var c = compInputs[ key ];
				c.input.value = s.comp[ key ];
				c.readout.textContent = formatValue( c.param, s.comp[ key ] );
			} );
			balInput.value = s.balance;
			balReadout.textContent = balText( s.balance );
			Object.keys( meterButtons ).forEach( function ( key ) {
				meterButtons[ key ].classList.toggle( 'is-active', s.meter === key );
			} );
			Object.keys( themeButtons ).forEach( function ( key ) {
				themeButtons[ key ].classList.toggle( 'is-active', s.theme === key );
			} );
		}

		syncUI();
		selectTab( 'eq' );

		/* ------ Live meters via engine frame hook ------ */
		var clipHold = 0;
		chain.onFrame = function ( clipped ) {
			if ( panel.hidden ) {
				return;
			}
			var reduction = Math.min( 0, chain.getReduction() );
			var pct = Math.min( 100, ( -reduction / 24 ) * 100 );
			meterFill.style.width = pct + '%';
			meterDb.textContent = reduction.toFixed( 1 ) + ' dB';

			if ( clipped ) {
				clipHold = 60;
			}
			if ( clipHold > 0 ) {
				clipHold--;
				clipLed.classList.add( 'is-on' );
			} else {
				clipLed.classList.remove( 'is-on' );
			}
		};
	}

	document.addEventListener( 'asp:ready', function ( e ) {
		buildPanel( e.detail );
	} );
} )();
