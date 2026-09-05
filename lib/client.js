/**
 * dsh-ui-deepdiving — browser half (zero-build: hand-maintained source AND
 * shipped artifact, in the window.__ModuleLoader__ handoff format).
 *
 * Curates the running-turn status line ("Deep diving…") in two dimensions:
 *
 * EFFECTS. The stock effect is a single pale band sweeping a flat-blue text
 * every ~2s — between sweeps the label sits still. A registry (EFFECTS below)
 * holds pure-CSS animation presets gated on body[data-dv-effect]; the picker
 * writes the attribute, reapply() projects per-effect knobs as --dv-* custom
 * properties, and the stylesheet itself is generated once from the registry
 * — adding an effect is one registry entry, nothing else. Every traveling
 * gradient stays periodic (first stop == last stop) and moves an exact
 * integer number of tiles per cycle, so the loop is seamless at ANY duration
 * (all layers share one --dv-dur); the two alternate-direction effects
 * (rainbow's hue swing, aurora's position swing) never reach a seam.
 * Percentage background-position shifts one full tile at p = 100·k·S/(S−1)
 * for size S and k tiles.
 *
 *   flow (default)  three parallax currents over a color river bed
 *   stock           the official single-band sweep, as a fallback preset
 *   breath          the whole row breathes: opacity dips by --dv-depth
 *   rainbow         the flow currents + a hue-rotate shimmer of --dv-span
 *   ecg             one narrow bright beam with a --dv-trail halo sweeping by
 *   aurora          a broad diagonal gradient swinging ± --dv-swing
 *
 * Each effect declares followMin: the pace sampler's output (and the
 * constant multiplier's quotient) is clamped to it, so follow mode can never
 * jitter a slow effect (aurora) or over-drive a tight one (breath).
 *
 * Shared knobs: intensity mixes the two lightest highlight stops toward
 * transparency via color-mix (the bed layer stays opaque — the text remains
 * readable at 0.3), and glow toggles the soft text-shadow aura through
 * --dv-glow.
 *
 * WORDING. The stock text comes from locale key chat.deepDiving and the
 * locale service refuses duplicate (ns, locale) registrations, so the custom
 * wording rides the DOM instead: a data-dv-text attribute on the status
 * element, turned into glyphs by ::before { content: attr(data-dv-text) }
 * while the stock text node collapses to font-size: 0. React diffs only its
 * own vdom and never reclaims attributes it does not manage, so the attribute
 * survives the per-second elapsed-tick re-renders; a 1s re-pin watchdog
 * covers per-turn remounts (the element mounts fresh with every running
 * turn). The gradient clipping and the glow shadow inherit onto the
 * ::before, so every effect animates the custom wording identically.
 *
 * Selector discipline: [role="status"][class$="_turnStatus"] matches the
 * CSS-module hashed class ("Md3f7G_turnStatus" in 0.1.0-rc.6) with
 * specificity (0,2,0) over the module class (0,1,0); a plain .turnStatus
 * fallback covers any future unhashed build. Colors resolve from the host's
 * --dsw-static-deepseek tokens with official values as fallbacks;
 * body[data-ds-dark-theme] (the ThemePresenter signal) brightens the two
 * darkest stops for dark surfaces.
 *
 * Preferences card (Settings → Plugins → Plugin configuration): a visual
 * replica of the shipped PluginCard chrome — same tokens, same fold-out
 * layout, same select-pill and switch idioms — holding:
 *
 *   effect      the preset picker (Menu)
 *   speed mode  constant | follow — follow counts streamed characters via a
 *               MutationObserver over [data-conversation-scroll] and maps an
 *               EMA onto --dv-dur (12s still water → 2s rapids)
 *   speed       constant-mode multiplier (Pill scale)
 *   intensity   highlight prominence (Pill scale)
 *   glow        the aura switch
 *   wording     status-text input; empty restores the official locale text
 *   per-effect  the selected effect's own knob(s), rendered from the registry
 *
 * Since 0.4 preferences persist in the host's settings document through the
 * official plugin-settings path (docs/cookbook/adding-a-settings-card.md):
 * the Host half (lib/index.js) registers the `deepdiving` namespace, this
 * half binds a settingsScope on it (revision-fenced reads/writes over
 * settings.describe/mutate), and the card claims its keyed slot under
 * settings.plugin.item. The pre-0.4 localStorage keys are migrated once, then
 * dropped; they remain a read-only fallback while the namespace is unserved.
 * Copy is bilingual (zh/en) through the locale service's active snapshot.
 */
window.__ModuleLoader__.load({
	id: "dsh-ui-deepdiving",
	factory: (require) => {
		const React = require("react");
		const h = React.createElement;
		const { Menu, Pill } = require("@deepseek-ai/dsh-client-ui-primitives");

		const LS_FLOW = "dsh-deepdiving:force-flow";
		const LS_SPEED = "dsh-deepdiving:speed-mode";
		const LS_MULT = "dsh-deepdiving:constant-mult";
		/** Speed semantics: 1x = the official chat.deepseek.com shimmer
		 * cadence (a 4s cycle here — the constant mode's base). A multiplier
		 * k maps to duration 4/k seconds; the scale's steps are 0.5x each. */
		const MULTS = [0.5, 1, 1.5, 2, 2.5, 3];
		const BASE_S = 4;
		/** Both selector arms the CSS and the JS discovery share: the hashed
		 * CSS-module class (suffix match) and the unhashed fallback. Compound
		 * forms are built arm-wise (gate/prefix) — appending to or prepending
		 * before the comma LIST as a string would only decorate one arm. */
		const ARM_HASHED = '[role="status"][class$="_turnStatus"]';
		const ARM_PLAIN = '[role="status"].turnStatus';
		const SEL = `${ARM_HASHED}, ${ARM_PLAIN}`;
		/** Both arms, each compounded with a suffix (attribute/pseudo). */
		const gate = (suffix) => `${ARM_HASHED}${suffix}, ${ARM_PLAIN}${suffix}`;
		/** Both arms, each under an ancestor condition (body[…]). */
		const prefix = (p) => `${p} ${ARM_HASHED}, ${p} ${ARM_PLAIN}`;

		/** Namespace defaults — mirror of the Host-half schema (lib/index.js).
		 * KEYS (its key order) drives override detection, migration and reset. */
		const DEFAULTS = {
			effect: "flow",
			speedMode: "follow",
			mult: 1,
			forceFlow: true,
			glow: true,
			intensity: 1,
			statusText: "",
			depth: 0.35,
			span: 90,
			trail: 15,
			swing: 15,
		};
		const KEYS = Object.keys(DEFAULTS);

		/** Gate both selector arms on the effect attribute. The stylesheet is
		 * generated once from the registry; the picker only flips the
		 * attribute, so switching effects never re-injects CSS. */
		const withEffect = (id) => prefix(`body[data-dv-effect="${id}"]`);

		/**
		 * The effect registry. One entry per preset:
		 *   css       the gated rules + keyframes (still state = base
		 *             declarations, so `animation: none` freezes cleanly and
		 *             the shared reduced-motion hold needs no per-effect reset)
		 *   params    per-effect knobs: schema key → --dv-* projection, with
		 *             pill ticks and a value formatter for the card
		 *   followMin duration floor applied in BOTH speed modes — the clamp
		 *             that keeps follow mode from jittering a slow effect
		 */
		const EFFECTS = [
			{
				id: "flow",
				followMin: 1,
				params: [],
				css: `${withEffect("flow")} {
				background-image:
					/* surface sparkle: one narrow bright streak per 1.25w tile */
					linear-gradient(90deg,
						transparent 0%, transparent 28%,
						var(--dv-hi2) 36%,
						transparent 44%, transparent 100%),
					/* mid current: two slanted highlight crests per 2w tile */
					linear-gradient(100deg,
						transparent 0%, transparent 14%,
						var(--dv-hi3) 26%,
						transparent 40%,
						transparent 58%,
						var(--dv-hi3) 74%,
						transparent 88%, transparent 100%),
					/* base river bed: broad periodic color undulation, never flat */
					linear-gradient(90deg,
						var(--dv-d500) 0%,
						var(--dv-d450) 12%,
						var(--dv-d500) 28%,
						var(--dv-d400) 45%,
						var(--dv-d500) 62%,
						var(--dv-d450) 78%,
						var(--dv-d500) 90%,
						var(--dv-d500) 100%);
				background-size: 125% 100%, 200% 100%, 150% 100%;
				background-position: 0 0, 0 0, 0 0;
				animation: dv-deepdiving-flow var(--dv-dur, 4s) linear infinite;
			}
			@keyframes dv-deepdiving-flow {
				from { background-position: 2500% 0, 600% 0, 600% 0; }
				to   { background-position: 0 0, 0 0, 0 0; }
			}`,
			},
			{
				id: "stock",
				followMin: 1,
				params: [],
				css: `${withEffect("stock")} {
				/* the official single-band sweep: a flat bed, one pale band
				 * riding a 2w tile (one crossing per cycle, then a pause —
				 * the band's stops sit in the right half so the rest state at
				 * position 0 shows only flat color) */
				background-image:
					linear-gradient(90deg,
						transparent 0%, transparent 62%,
						var(--dv-hi2) 72%,
						transparent 82%, transparent 100%),
					linear-gradient(90deg, var(--dv-d500) 0%, var(--dv-d500) 100%);
				background-size: 200% 100%, 100% 100%;
				background-position: 0 0, 0 0;
				animation: dv-stock-sweep var(--dv-dur, 4s) linear infinite;
			}
			@keyframes dv-stock-sweep {
				from { background-position: 200% 0, 0 0; }
				to   { background-position: 0 0, 0 0; }
			}`,
			},
			{
				id: "breath",
				followMin: 1.5,
				params: [{
					key: "depth", cssVar: "--dv-depth", unit: "",
					ticks: [0.15, 0.3, 0.45, 0.6], fmt: (v) => Math.round(v * 100) + "%",
				}],
				css: `${withEffect("breath")} {
				/* still bed (the flow's undulation, unanimated) breathing in
				 * place: opacity dips by the depth knob and returns */
				background-image:
					linear-gradient(90deg,
						var(--dv-d500) 0%,
						var(--dv-d450) 14%,
						var(--dv-d500) 34%,
						var(--dv-d400) 55%,
						var(--dv-d500) 78%,
						var(--dv-d500) 100%);
				animation: dv-breath var(--dv-dur, 4s) ease-in-out infinite;
			}
			@keyframes dv-breath {
				0%, 100% { opacity: 1; }
				50% { opacity: calc(1 - var(--dv-depth, 0.35)); }
			}`,
			},
			{
				id: "rainbow",
				followMin: 1,
				params: [{
					key: "span", cssVar: "--dv-span", unit: "deg",
					ticks: [30, 90, 180], fmt: (v) => v + "\u00b0",
				}],
				css: `${withEffect("rainbow")} {
				/* the full flow current, plus an alternating hue shimmer:
				 * 0 -> span -> 0 never crosses a seam at any span */
				background-image:
					linear-gradient(90deg,
						transparent 0%, transparent 28%,
						var(--dv-hi2) 36%,
						transparent 44%, transparent 100%),
					linear-gradient(100deg,
						transparent 0%, transparent 14%,
						var(--dv-hi3) 26%,
						transparent 40%,
						transparent 58%,
						var(--dv-hi3) 74%,
						transparent 88%, transparent 100%),
					linear-gradient(90deg,
						var(--dv-d500) 0%,
						var(--dv-d450) 12%,
						var(--dv-d500) 28%,
						var(--dv-d400) 45%,
						var(--dv-d500) 62%,
						var(--dv-d450) 78%,
						var(--dv-d500) 90%,
						var(--dv-d500) 100%);
				background-size: 125% 100%, 200% 100%, 150% 100%;
				background-position: 0 0, 0 0, 0 0;
				animation: dv-deepdiving-flow var(--dv-dur, 4s) linear infinite,
					dv-rainbow-shimmer var(--dv-dur, 4s) ease-in-out infinite alternate;
			}
			@keyframes dv-rainbow-shimmer {
				from { filter: hue-rotate(0deg); }
				to   { filter: hue-rotate(var(--dv-span, 90deg)); }
			}`,
			},
			{
				id: "ecg",
				followMin: 1,
				params: [{
					key: "trail", cssVar: "--dv-trail", unit: "%",
					ticks: [5, 15, 25], fmt: (v) => v + "%",
				}],
				css: `${withEffect("ecg")} {
				/* one narrow bright beam per 2w tile with a wide faint halo
				 * centered on it (the halo half-width IS the trail knob);
				 * flat bed beneath */
				background-image:
					linear-gradient(90deg,
						transparent 0%, transparent 47%,
						var(--dv-hi2) 50%,
						transparent 53%, transparent 100%),
					linear-gradient(90deg,
						transparent 0%,
						transparent calc(50% - var(--dv-trail, 15%)),
						var(--dv-hi3) 50%,
						transparent calc(50% + var(--dv-trail, 15%)),
						transparent 100%),
					linear-gradient(90deg, var(--dv-d500) 0%, var(--dv-d500) 100%);
				background-size: 200% 100%, 200% 100%, 100% 100%;
				background-position: 0 0, 0 0, 0 0;
				animation: dv-ecg-sweep var(--dv-dur, 4s) linear infinite;
			}
			@keyframes dv-ecg-sweep {
				from { background-position: 200% 0, 200% 0, 0 0; }
				to   { background-position: 0 0, 0 0, 0 0; }
			}`,
			},
			{
				id: "aurora",
				followMin: 6,
				params: [{
					key: "swing", cssVar: "--dv-swing", unit: "%",
					project: (v) => -(v * 2) + "%",
					ticks: [5, 15, 25], fmt: (v) => v + "%",
				}],
				css: `${withEffect("aurora")} {
				/* a broad diagonal curtain swinging slowly in place; alternate
				 * direction means any travel distance loops without a seam */
				background-image: linear-gradient(105deg,
					var(--dv-d500) 0%,
					var(--dv-d400) 20%,
					var(--dv-d300) 34%,
					var(--dv-d450) 52%,
					var(--dv-d400) 68%,
					var(--dv-d500) 86%,
					var(--dv-d500) 100%);
				background-size: 240% 100%;
				background-position: 0 0;
				animation: dv-aurora-swing var(--dv-dur, 4s) ease-in-out infinite alternate;
			}
			@keyframes dv-aurora-swing {
				from { background-position: 0 0; }
				to   { background-position: var(--dv-swing, -30%) 0; }
			}`,
			},
		];
		const EFFECT_IDS = EFFECTS.map((e) => e.id);
		const findEffect = (id) => EFFECTS.find((e) => e.id === id) ?? EFFECTS[0];
		/** Registry param schema key -> CSS custom property value. */
		const projectParam = (q, v) => q.project ? q.project(v) : String(v) + (q.unit ?? "");

		/* Legacy localStorage readers — read-only fallback while the settings
		 * namespace is unserved (loading) or unavailable, and the source of the
		 * one-shot migration once it is. Only the three pre-registry keys ever
		 * lived in localStorage; everything newer starts at its default. */
		function readForceFlow() {
			try { return window.localStorage.getItem(LS_FLOW) !== "0"; } catch { return DEFAULTS.forceFlow; }
		}
		function readSpeedMode() {
			try {
				const v = window.localStorage.getItem(LS_SPEED);
				if (v === "constant" || v === "follow") return v;
				return DEFAULTS.speedMode;
			} catch { return DEFAULTS.speedMode; }
		}
		function readMult() {
			try {
				const v = Number(window.localStorage.getItem(LS_MULT));
				return MULTS.includes(v) ? v : DEFAULTS.mult;
			} catch { return DEFAULTS.mult; }
		}
		function clearLegacy() {
			try {
				window.localStorage.removeItem(LS_SPEED);
				window.localStorage.removeItem(LS_MULT);
				window.localStorage.removeItem(LS_FLOW);
			} catch { /* storage blocked: the keys are inert */ }
		}

		const numOr = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

		/** Current prefs: the namespace's resolved value once served, with the
		 * legacy localStorage keys as the pre-Host fallback. Shared by the
		 * runtime reapply and the card render. */
		function prefsFrom(snap) {
			if (snap !== undefined && snap.status === "ready"
				&& typeof snap.value === "object" && snap.value !== null) {
				const v = snap.value;
				return {
					effect: EFFECT_IDS.includes(v.effect) ? v.effect : DEFAULTS.effect,
					speedMode: v.speedMode === "follow" ? "follow"
						: v.speedMode === "constant" ? "constant" : DEFAULTS.speedMode,
					mult: MULTS.includes(v.mult) ? v.mult : DEFAULTS.mult,
					forceFlow: typeof v.forceFlow === "boolean" ? v.forceFlow : DEFAULTS.forceFlow,
					glow: typeof v.glow === "boolean" ? v.glow : DEFAULTS.glow,
					intensity: numOr(v.intensity, DEFAULTS.intensity),
					statusText: typeof v.statusText === "string" ? v.statusText : DEFAULTS.statusText,
					depth: numOr(v.depth, DEFAULTS.depth),
					span: numOr(v.span, DEFAULTS.span),
					trail: numOr(v.trail, DEFAULTS.trail),
					swing: numOr(v.swing, DEFAULTS.swing),
				};
			}
			return {
				effect: DEFAULTS.effect,
				speedMode: readSpeedMode(),
				mult: readMult(),
				forceFlow: readForceFlow(),
				glow: DEFAULTS.glow,
				intensity: DEFAULTS.intensity,
				statusText: DEFAULTS.statusText,
				depth: DEFAULTS.depth,
				span: DEFAULTS.span,
				trail: DEFAULTS.trail,
				swing: DEFAULTS.swing,
			};
		}

		/* Bilingual copy, selected off the locale service's active id. Kept
		 * terse — one line per role, the settings-section house style. */
		const COPY = {
			zh: {
				title: "Deep diving",
				description: "「Deep diving…」状态条的动效与文字。",
				expand: "展开", collapse: "收起",
				effectLabel: "动效",
				effects: {
					flow: "水流",
					stock: "原版扫光",
					breath: "呼吸辉光",
					rainbow: "虹彩流转",
					ecg: "电波掠过",
					aurora: "极光缓摆",
				},
				speedLabel: "流动速度",
				speedConstant: "恒定",
				speedFollow: "跟随生成速度",
				multLabel: "速度倍速",
				intensityLabel: "强度",
				glowLabel: "流动辉光",
				glowHint: "文字后方的柔光。",
				textLabel: "状态文字",
				textPlaceholder: "深度求索中...",
				textHint: "留空时使用官方文案。",
				params: { span: "色相跨度", depth: "呼吸深度", trail: "光晕宽度", swing: "摆动幅度" },
				forceLabel: "减弱动态时仍流动",
				forceHint: "忽略浏览器的减弱动态请求。",
				reset: "恢复默认",
				unavailable: "设置服务不可用，暂时只读。",
			},
			en: {
				title: "Deep diving",
				description: "Effects and wording for the “Deep diving…” status line.",
				expand: "Expand", collapse: "Collapse",
				effectLabel: "Effect",
				effects: {
					flow: "Water flow",
					stock: "Stock sweep",
					breath: "Breathing glow",
					rainbow: "Rainbow shimmer",
					ecg: "Pulse sweep",
					aurora: "Aurora sway",
				},
				speedLabel: "Flow speed",
				speedConstant: "Constant",
				speedFollow: "Follow generation speed",
				multLabel: "Speed",
				intensityLabel: "Intensity",
				glowLabel: "Glowing aura",
				glowHint: "The soft halo behind the glyphs.",
				textLabel: "Status text",
				textPlaceholder: "Deep diving...",
				textHint: "Empty keeps the official wording.",
				params: { span: "Hue span", depth: "Breath depth", trail: "Halo width", swing: "Sway range" },
				forceLabel: "Flow under reduced motion",
				forceHint: "Ignore the browser's reduced-motion request.",
				reset: "Reset to defaults",
				unavailable: "Settings service unavailable — read-only for now.",
			},
		};
		function copyFor(active) { return COPY[active === "en" ? "en" : "zh"]; }

		const CSS = `
		/* Palette: official DeepSeek static tokens, resolved live with fallbacks.
		 * The two highlight stops are also exposed through color-mix so the
		 * intensity knob can pull them toward transparency over the opaque
		 * bed layer — the base color never thins out. */
		:root {
			--dv-d500: var(--dsw-static-deepseek-500, rgb(65 118 230));
			--dv-d450: var(--dsw-static-deepseek-450, rgb(86 134 254));
			--dv-d400: var(--dsw-static-deepseek-400, rgb(103 158 254));
			--dv-d300: var(--dsw-static-deepseek-300, rgb(183 200 254));
			--dv-d200: var(--dsw-static-deepseek-200, rgb(211 226 255));
			--dv-hi2: color-mix(in srgb, var(--dv-d200, rgb(211 226 255)) calc(var(--dv-int, 1) * 100%), transparent);
			--dv-hi3: color-mix(in srgb, var(--dv-d300, rgb(183 200 254)) calc(var(--dv-int, 1) * 100%), transparent);
		}
		/* Dark theme: lift the two darkest stops so the river bed stays
		 * visible on dark surfaces (same signal the host ThemePresenter writes;
		 * the card chrome below reads host tokens directly, so it re-themes
		 * itself without plugin-side rules). */
		body[data-ds-dark-theme], :root[data-ds-dark-theme] {
			--dv-d500: var(--dsw-static-deepseek-450, rgb(86 134 254));
			--dv-d450: var(--dsw-static-deepseek-400, rgb(103 158 254));
		}

		/* Shared base for every effect: repaint containment (the animated
		 * gradients repaint this row only; size is a fixed 26px row) and the
		 * glow aura, togglable through --dv-glow. */
		${SEL} {
			contain: layout paint;
			text-shadow: var(--dv-glow, 0 0 12px rgb(103 158 254 / 0.25));
		}
		/* the elapsed clock keeps its own caption fill; no inherited aura */
		${SEL} [class$="_turnStatusClock"] {
			text-shadow: none;
		}

		/* ---- effect presets, generated from the registry ---- */
		${EFFECTS.map((e) => e.css).join("\n\n")}

		/* ---- custom wording ----
		 * The stock text node collapses (its glyphs vanish at font-size 0) and
		 * the attribute's content takes the stage; the restored size matches
		 * the host's axis variable. Glyph clipping (background-clip: text from
		 * the stock rule) and the glow shadow inherit onto the ::before, so
		 * every effect animates the custom wording identically. The clock span
		 * keeps its own explicit font-size from the host rule. */
		${gate('[data-dv-text]')} {
			font-size: 0;
		}
		${gate('[data-dv-text]::before')} {
			content: attr(data-dv-text);
			font-size: var(--dsh-content-font-size, 14px);
		}

		@media (prefers-reduced-motion: reduce) {
			/* Accessibility hold: without the force-flow opt-in every effect
			 * freezes at its base declarations (the gradients stay). Kept
			 * AFTER the registry blocks so the cascade wins at equal
			 * specificity; no per-effect resets needed because each preset's
			 * still state IS its base state. forceFlow defaults ON — flip it
			 * in Settings, Plugins, Plugin configuration. */
			${prefix('body:not([data-dv-flow])')} {
				animation: none;
				text-shadow: none;
			}
		}

		/* Settings card: a token-faithful replica of the shipped PluginCard
		 * chrome. Every color/spacing reads a --dsw-alias token, so light/dark
		 * re-theming is the host's job — no [data-ds-dark-theme] rules needed
		 * here. Only the two literals below (switch track + knob) have no
		 * matching public token; they get explicit dark companions. */
		.dv-card {
			list-style: none;
			border: 1px solid var(--dsw-alias-border-l2);
			border-radius: 12px;
			background: var(--dsw-alias-bg-layer-3);
			transition: border-color .16s, background .16s;
		}
		.dv-card:hover { border-color: var(--dsw-alias-label-dimmed); }
		.dv-card.dv-open {
			background: var(--dsw-alias-bg-layer-2);
			border-color: var(--dsw-alias-label-dimmed);
		}
		.dv-header {
			width: 100%; appearance: none; border: 0; background: none;
			font: inherit; color: inherit; text-align: left; cursor: pointer;
			display: flex; align-items: center; gap: 12px;
			padding: 14px 16px; border-radius: 12px;
		}
		.dv-header:focus-visible {
			outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px;
		}
		.dv-headText {
			flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;
		}
		.dv-name {
			font-size: 15px; font-weight: 600; line-height: 1.4;
			color: var(--dsw-alias-label-primary);
		}
		.dv-description {
			font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-tertiary);
		}
		.dv-chevron {
			flex: none; color: var(--dsw-alias-label-tertiary); transition: transform .16s;
		}
		.dv-chevron.dv-chevronOpen { transform: rotate(180deg); }
		.dv-body {
			border-top: 1px solid var(--dsw-alias-border-l2);
			margin: 0 16px; padding-bottom: 8px;
		}
		.dv-field {
			display: flex; flex-direction: column; gap: 6px; padding: 12px 0;
		}
		.dv-field + .dv-field { border-top: 1px solid var(--dsw-alias-border-l2); }
		.dv-fieldHead { display: flex; align-items: center; gap: 8px; }
		.dv-label {
			flex: 1; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.5;
			color: var(--dsw-alias-label-primary);
		}
		.dv-hint {
			margin: 0; font-size: 12px; line-height: 1.5;
			color: var(--dsw-alias-label-tertiary);
		}
		/* Reset-to-defaults row: quiet text button in brand color. */
		.dv-reset {
			appearance: none; border: 0; background: none; font: inherit;
			font-size: 13px; line-height: 1.5; padding: 0;
			align-self: flex-start; cursor: pointer;
			color: var(--dsw-alias-brand-primary);
		}
		.dv-reset:focus-visible {
			outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px;
		}
		.dv-select:disabled, .dv-switch:disabled, .dv-input:disabled { opacity: .5; cursor: default; }
		/* Selector pill (figma 'Setting-Cell' selector: h36 r18 platform fill). */
		.dv-select {
			display: inline-flex; align-items: center; align-self: flex-start;
			height: 36px; padding: 0 14px; border: none; border-radius: 18px;
			background: var(--dsw-alias-bg-module-platform);
			font: inherit; font-size: 14px; line-height: 22px;
			color: var(--dsw-alias-label-primary); cursor: pointer;
		}
		.dv-select:focus-visible {
			outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px;
		}
		/* Text input for the custom wording: same platform fill and radius
		 * family as the selector pill, full field width. */
		.dv-input {
			width: 100%; height: 36px; padding: 0 12px;
			border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px;
			background: var(--dsw-alias-bg-module-platform);
			font: inherit; font-size: 14px; line-height: 22px;
			color: var(--dsw-alias-label-primary);
		}
		.dv-input::placeholder { color: var(--dsw-alias-label-tertiary); }
		.dv-input:focus-visible {
			outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px;
			border-color: var(--dsw-alias-brand-primary);
		}
		/* Segmented scales (speed / intensity / per-effect knobs): the official
		 * Pill idiom (view-switcher tabs) laid out one per row-width cell. */
		.dv-scale {
			display: flex; gap: 6px; width: 100%;
		}
		.dv-scale > * {
			flex: 1; justify-content: center;
			height: 28px; border-radius: 14px;
		}

		/* Switch row (label + pill on one line, hint under). */
		.dv-switchRow {
			display: flex; align-items: center; gap: 8px;
		}
		.dv-switch {
			flex: none; width: 36px; height: 20px; border-radius: 10px;
			border: none; cursor: pointer; position: relative;
			background: var(--dsw-alias-fill-tertiary, #e3e4e6);
			transition: background .2s;
		}
		body[data-ds-dark-theme] .dv-switch {
			background: var(--dsw-alias-fill-tertiary, rgb(72 74 79));
		}
		.dv-switch::after {
			content: ""; position: absolute; top: 2px; left: 2px;
			width: 16px; height: 16px; border-radius: 50%;
			background: #fff; transition: left .2s;
			box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
		}
		body[data-ds-dark-theme] .dv-switch::after {
			background: rgb(233 234 236);
			box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
		}
		.dv-switch[aria-checked="true"] {
			background: var(--dsw-static-deepseek-500, rgb(65 118 230));
		}
		.dv-switch[aria-checked="true"]::after { left: 18px; }
		.dv-switch:focus-visible {
			outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px;
		}
		`;

		/** Segmented scale: official Pill chips (view-switcher idiom), one per
		 * cell, laid out edge to edge across the field width. Used for the
		 * speed multiplier, the intensity knob and every per-effect param.
		 * @param props - value, ticks ([value, label] pairs), onChange.
		 */
		function PillScale({ value, ticks, onChange }) {
			return h("div", { className: "dv-scale", role: "group" },
				ticks.map(([v, label]) =>
					h(Pill, {
						key: String(v), active: v === value,
						onClick: () => { onChange(v); },
						"aria-pressed": v === value,
						"aria-label": String(label),
					}, String(label)),
				),
			);
		}

		/* Chevron replica: the shipped IconChevronDownOutline14's 14px outline
		 * chevron, inlined so the plugin owns every byte it injects. */
		function Chevron({ open }) {
			return h("svg", {
				className: "dv-chevron" + (open ? " dv-chevronOpen" : ""),
				width: 14, height: 14, viewBox: "0 0 14 14", fill: "none",
				"aria-hidden": true,
			},
				h("path", {
					d: "M3.5 5.25L7 8.75L10.5 5.25",
					stroke: "currentColor", "stroke-width": 1.2,
					"stroke-linecap": "round", "stroke-linejoin": "round",
				}),
			);
		}

		/** Selector-pill-shaped dropdown anchor (the Language row's idiom),
		 * parameterized by the open state, items and the write it performs.
		 * @param props - id, copy label, items, value, open, setOpen, onPick.
		 */
		function Dropdown({ id, label, items, value, open, setOpen, onPick }) {
			return h(Menu, {
				open,
				onClose: () => { setOpen(false); },
				items,
				selectedId: value,
				onSelect: (picked) => { setOpen(false); onPick(picked); },
				align: "start",
				anchor: h("button", {
					type: "button", id, className: "dv-select",
					"aria-haspopup": "menu", "aria-expanded": open,
					onClick: () => { setOpen(!open); },
				},
					items.find((it) => it.id === value)?.label ?? items[0].label,
					h(Chevron, { open }),
				),
			});
		}

		/**
		 * The preferences card: fold-out chrome + effect picker + speed, look
		 * and wording controls + the selected effect's own knobs. Preference
		 * state is the settingsScope snapshot (the host namespace the Host
		 * half registers); writes are revision-fenced scope.set/unset calls,
		 * so the card holds no preference state of its own — only the
		 * fold-out, menu and input-draft flags are local.
		 * @param props - the live locale copy and the bound settings scope. */
		function DeepdivingCard({ copy, scope }) {
			const { useState, useEffect, useRef, useSyncExternalStore } = React;
			const t = (key) => copy[key];
			const [open, setOpen] = useState(false);
			const [speedOpen, setSpeedOpen] = useState(false);
			const [effectOpen, setEffectOpen] = useState(false);
			const snap = useSyncExternalStore(
				(listener) => scope.subscribe(listener),
				() => scope.getSnapshot(),
			);
			const ready = snap.status === "ready";
			const writable = ready && snap.writable !== false;
			const overridden = ready && snap.user !== undefined
				&& KEYS.some((k) => k in snap.user);
			const p = prefsFrom(snap);
			const fx = findEffect(p.effect);
			/* Tick labels fast-to-slow: 3x .. 0.5x. */
			const TICKS = MULTS.map((m) => [m, String(m).replace(".", ".")]).reverse();
			/* Writes carry the snapshot's revision; the controller re-reads on
			 * conflict, and the next snapshot re-renders card and runtime in
			 * one step. */
			const onSpeed = (id) => {
				if (writable) void scope.set("speedMode", id === "follow" ? "follow" : "constant");
			};
			const onEffect = (id) => {
				if (writable) void scope.set("effect", id);
			};
			const applyMult = (m) => {
				/* Applies only in constant mode (the scale is hidden in follow). */
				if (writable) void scope.set("mult", m);
			};
			const onForce = () => {
				if (writable) void scope.set("forceFlow", !p.forceFlow);
			};
			const onGlow = () => {
				if (writable) void scope.set("glow", !p.glow);
			};
			const onReset = () => {
				for (const k of KEYS) void scope.unset(k);
			};

			/* Wording draft: local editing state over the snapshot value. The
			 * input commits debounced (300ms) so typing does not spam the
			 * revision-fenced write queue; while focused (or mid-debounce) the
			 * draft is the user's, otherwise external changes (reset, another
			 * browser) sync back in. */
			const [draft, setDraft] = useState(p.statusText);
			const debounce = useRef(null);
			const focused = useRef(false);
			useEffect(() => {
				if (!focused.current && debounce.current === null) setDraft(p.statusText);
			}, [p.statusText]);
			useEffect(() => () => {
				if (debounce.current !== null) clearTimeout(debounce.current);
			}, []);
			const onTextInput = (e) => {
				const v = e.target.value;
				setDraft(v);
				if (debounce.current !== null) clearTimeout(debounce.current);
				debounce.current = setTimeout(() => {
					debounce.current = null;
					if (writable) void scope.set("statusText", v.trim());
				}, 300);
			};

			return h("li", { className: "dv-card" + (open ? " dv-open" : "") },
				h("button", {
					type: "button", className: "dv-header", "aria-expanded": open,
					"aria-label": `${t(open ? "expand" : "collapse")}: ${t("title")}`,
					onClick: () => { setOpen(!open); },
				},
					h("span", { className: "dv-headText" },
						h("span", { className: "dv-name" }, t("title")),
						h("span", { className: "dv-description" }, t("description")),
					),
					h(Chevron, { open }),
				),
				open ? h("div", { className: "dv-body" },
					h("div", { className: "dv-field" },
						h("div", { className: "dv-fieldHead" },
							h("label", { className: "dv-label", htmlFor: "dv-effect" }, t("effectLabel")),
						),
						h(Dropdown, {
							id: "dv-effect", label: t("effectLabel"),
							items: EFFECTS.map((e) => ({ id: e.id, label: t("effects")[e.id] })),
							value: p.effect,
							open: effectOpen, setOpen: setEffectOpen,
							onPick: onEffect,
						}),
					),
					h("div", { className: "dv-field" },
						h("div", { className: "dv-fieldHead" },
							h("label", { className: "dv-label", htmlFor: "dv-speed" }, t("speedLabel")),
						),
						/* Official Menu dropdown (the same primitive the Language row
						 * uses): themed rows, selected check, keyboard and outside-click
						 * close — instead of a native select whose OS-styled popup
						 * ignores the app theme. */
						h(Dropdown, {
							id: "dv-speed", label: t("speedLabel"),
							items: [
								{ id: "constant", label: t("speedConstant") },
								{ id: "follow", label: t("speedFollow") },
							],
							value: p.speedMode,
							open: speedOpen, setOpen: setSpeedOpen,
							onPick: onSpeed,
						}),
					),
					p.speedMode === "constant"
						? h("div", { className: "dv-field" },
							h("div", { className: "dv-fieldHead" },
								h("label", { className: "dv-label", id: "dv-mult-label" }, t("multLabel")),
							),
							h(PillScale, { value: p.mult, ticks: TICKS, onChange: applyMult }),
						)
						: null,
					h("div", { className: "dv-field" },
						h("div", { className: "dv-fieldHead" },
							h("label", { className: "dv-label", id: "dv-int-label" }, t("intensityLabel")),
						),
						h(PillScale, {
							value: p.intensity,
							ticks: [[0.3, "30%"], [0.5, "50%"], [0.8, "80%"], [1, "100%"]],
							onChange: (v) => { if (writable) void scope.set("intensity", v); },
						}),
					),
					h("div", { className: "dv-field" },
						h("div", { className: "dv-switchRow" },
							h("span", { className: "dv-label", id: "dv-glow-label" }, t("glowLabel")),
							h("button", {
								type: "button", className: "dv-switch", role: "switch",
								"aria-checked": String(p.glow), "aria-labelledby": "dv-glow-label",
								onClick: onGlow,
							}),
						),
						h("p", { className: "dv-hint" }, t("glowHint")),
					),
					h("div", { className: "dv-field" },
						h("div", { className: "dv-fieldHead" },
							h("label", { className: "dv-label", htmlFor: "dv-text" }, t("textLabel")),
						),
						h("input", {
							type: "text", id: "dv-text", className: "dv-input",
							value: draft, maxLength: 30,
							placeholder: t("textPlaceholder"), disabled: !writable,
							"aria-label": t("textLabel"),
							onFocus: () => { focused.current = true; },
							onBlur: () => { focused.current = false; },
							onChange: onTextInput,
						}),
						h("p", { className: "dv-hint" }, t("textHint")),
					),
					fx.params.map((q) =>
						h("div", { className: "dv-field", key: q.key },
							h("div", { className: "dv-fieldHead" },
								h("label", { className: "dv-label", id: `dv-${q.key}-label` }, t("params")[q.key]),
							),
							h(PillScale, {
								value: p[q.key],
								ticks: q.ticks.map((v) => [v, q.fmt(v)]),
								onChange: (v) => { if (writable) void scope.set(q.key, v); },
							}),
						),
					),
					h("div", { className: "dv-field" },
						h("div", { className: "dv-switchRow" },
							h("span", { className: "dv-label", id: "dv-force-label" }, t("forceLabel")),
							h("button", {
								type: "button", className: "dv-switch", role: "switch",
								"aria-checked": String(p.forceFlow), "aria-labelledby": "dv-force-label",
								onClick: onForce,
							}),
						),
						h("p", { className: "dv-hint" }, t("forceHint")),
					),
					snap.status === "unavailable" ? h("p", { className: "dv-hint" }, t("unavailable")) : null,
					overridden ? h("div", { className: "dv-field" },
						h("button", { type: "button", className: "dv-reset", onClick: onReset }, t("reset")),
					) : null,
				) : null,
			);
		}

		/**
		 * Follow-mode pace sampler. Watches the conversation flow (the DOM
		 * container dsh marks [data-conversation-scroll]; reasoning and
		 * assistant streams both append there while a turn runs), converts a
		 * sliding character count into a smoothed chars/s, and maps that onto
		 * --dv-dur: 0 → 12s (still water), ≥750 cps → 2s (rapids). Updates
		 * are throttled to whole tenths of a second so the running animation
		 * is not re-timed mid-cycle by noise. The active effect's floor is
		 * applied on top (setFloor), so slow presets like aurora never jitter.
		 */
		function PaceSampler() {
			let observer = null;
			let ticker = null;
			let chars = 0;
			let rate = 0; // EMA of chars/s
			let lastDur = 0;
			let floor = 1;
			const countText = (nodes) => {
				let n = 0;
				for (const node of nodes) {
					if (node.nodeType === Node.TEXT_NODE) n += Math.max(0, node.textContent.length);
					else if (node.nodeType === Node.ELEMENT_NODE) n += node.textContent.length;
				}
				return n;
			};
			const onMutate = (records) => {
				for (const r of records) {
					chars += countText(r.addedNodes);
					if (r.type === "characterData" && r.oldValue !== null) {
						chars += Math.max(0, r.target.textContent.length - r.oldValue.length);
					}
				}
			};
			const tick = () => {
				bind(); // cheap no-op once attached
				const cps = chars * 2; // 500ms window -> per second
				chars = 0;
				/* Asymmetric EMA: rise fast (0.5) so a burst of tokens reads
				 * within a second; fall slow (0.82) so the water glides back
				 * to stillness instead of snapping between paragraphs. */
				const a = cps > rate ? 0.5 : 0.18;
				rate = rate === 0 ? cps : rate * (1 - a) + cps * a;
				/* Calibrated to real usage: typical API turns stream at
				 * ~40-60 tok/s (Zhipu GLM ~50, DeepSeek V3 60; ~3 chars per
				 * token -> ~150 cps), which is where the user actually lives.
				 * Follow curve: 0 -> 12s, 150cps(~50tok/s) -> 4s official
				 * cadence, 750cps ceiling -> 2s. No user multiplier here —
				 * follow mode's pace is owned by the token stream itself; the
				 * speed scale applies to constant mode only. The active
				 * effect's floor clamps underneath (aurora >= 6s, breath
				 * >= 1.5s) so fast streams never jitter a slow preset. */
				let dur;
				if (rate <= 150) {
					dur = 12 - (rate / 150) * 8;
				} else {
					const t = Math.pow(
						Math.min(1, Math.log(rate / 150) / Math.log(750 / 150)), 0.7);
					dur = 4 + (2 - 4) * t;
				}
				dur = Math.max(floor, dur);
				dur = Math.round(dur * 10) / 10;
				if (dur !== lastDur) {
					lastDur = dur;
					document.documentElement.style.setProperty("--dv-dur", `${dur}s`);
				}
			};
			/** Duration floor for the active effect; reapplied on every scope
			 * change so an effect switch re-clamps immediately. */
			this.setFloor = (m) => { floor = typeof m === "number" && m > 0 ? m : 1; };
			this.start = () => {
				this.stop();
				bind();
				ticker = setInterval(tick, 500);
				tick();
			};
			/** Attach the observer to the conversation flow host. The host may
			 * mount after plugin activation (session switch, first render), so
			 * a 2s re-bind watchdog keeps trying until it exists — the outline
			 * plugin's discovery pattern. No-ops once bound. */
			const bind = () => {
				if (observer !== null) return;
				const host = document.querySelector("[data-conversation-scroll]");
				if (host === null) return;
				observer = new MutationObserver(onMutate);
				observer.observe(host, {
					childList: true, subtree: true, characterData: true, characterDataOldValue: true,
				});
			};
			this.stop = () => {
				if (observer !== null) { observer.disconnect(); observer = null; }
				if (ticker !== null) { clearInterval(ticker); ticker = null; }
				chars = 0; rate = 0;
				/* --dv-dur stays: switching to constant re-applies it via
				 * applyConstant; the unload disposer clears it instead. */
			};
		}

		/**
		 * Custom-wording pinner. Projects the statusText preference onto the
		 * status element as a data-dv-text attribute (the CSS turns it into a
		 * ::before replacement; see the stylesheet). React never reclaims
		 * attributes outside its vdom, so one write survives the per-second
		 * re-renders; the element remounts with every running turn though, so
		 * while a custom wording is active a 1s watchdog re-pins it (the same
		 * discovery philosophy as the pace sampler's re-bind). An empty
		 * wording stops the watchdog and strips the attribute, restoring the
		 * official locale text.
		 */
		function TextPinner() {
			let timer = null;
			let want = "";
			const sync = () => {
				for (const el of document.querySelectorAll(SEL)) {
					if (want === "") {
						if (el.hasAttribute("data-dv-text")) el.removeAttribute("data-dv-text");
					} else if (el.getAttribute("data-dv-text") !== want) {
						el.setAttribute("data-dv-text", want);
					}
				}
			};
			this.set = (text) => {
				want = (text ?? "").trim();
				sync();
				if (want !== "" && timer === null) timer = setInterval(sync, 1000);
				if (want === "") this.stop();
			};
			this.stop = () => {
				if (timer !== null) { clearInterval(timer); timer = null; }
			};
			/** Unload path: stop watching and strip every pinned attribute. */
			this.clear = () => {
				this.stop();
				want = "";
				sync();
			};
		}

		/** Services required: the slot registry (runtime) for the card, the
		 * locale service for bilingual copy, and the settings transport trio —
		 * the settingsScope binder plus the connection/remote its invalidation
		 * rides on (docs/cookbook/adding-a-settings-card.md). */
		const inject = ["slots", "locale", "connection", "remote", "settingsScope"];

		/**
		 * Bind the namespace scope, inject the stylesheet, keep the runtime
		 * (force-flow projection, effect attribute, --dv-* knobs, pace
		 * sampler, wording pinner) in step with every settings change, and
		 * register the card under its keyed slot. ctx.effect runs the body
		 * immediately and adopts its return as the unload disposer.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			/* The official plugin-settings path: the Host half registers the
			 * `deepdiving` namespace (lib/index.js); this scope fences every
			 * read/write with the revision it read and follows
			 * settings/document-updated invalidations on our own lifecycle. */
			const scope = ctx.settingsScope.bind({ namespace: "deepdiving" });

			/* One-shot migration of the pre-0.4 localStorage preferences into
			 * the host document: values that differ from the schema defaults
			 * become user-layer overrides, then the legacy keys are dropped. A
			 * settings document that already has an opinion wins. */
			let migrated = false;
			const migrate = (snap) => {
				if (migrated || snap.status !== "ready") return;
				migrated = true;
				const user = snap.user;
				const owned = user !== undefined && KEYS.some((k) => k in user);
				if (owned) { clearLegacy(); return; }
				const legacy = prefsFrom(undefined); // reads the localStorage fallback
				if (legacy.speedMode !== DEFAULTS.speedMode) void scope.set("speedMode", legacy.speedMode);
				if (legacy.mult !== DEFAULTS.mult) void scope.set("mult", legacy.mult);
				if (legacy.forceFlow !== DEFAULTS.forceFlow) void scope.set("forceFlow", legacy.forceFlow);
				clearLegacy();
			};

			ctx.effect(() => {
				const st = document.createElement("style");
				st.textContent = CSS;
				document.head.appendChild(st);

				const sampler = new PaceSampler();
				const pinner = new TextPinner();
				/* Every scope change re-projects: the force-flow flag onto
				 * body[data-dv-flow], the effect pick onto body[data-dv-effect],
				 * the shared knobs and the selected effect's params onto --dv-*
				 * custom properties, the wording onto data-dv-text, and either
				 * the sampler (follow) or the constant duration (--dv-dur =
				 * base / mult, floored by the effect) onto the timing. */
				const reapply = () => {
					const snap = scope.getSnapshot();
					migrate(snap);
					const p = prefsFrom(snap);
					const root = document.documentElement;
					const fx = findEffect(p.effect);
					if (p.forceFlow) document.body.setAttribute("data-dv-flow", "");
					else document.body.removeAttribute("data-dv-flow");
					document.body.setAttribute("data-dv-effect", fx.id);
					if (p.glow) root.style.removeProperty("--dv-glow");
					else root.style.setProperty("--dv-glow", "none");
					root.style.setProperty("--dv-int", String(p.intensity));
					for (const q of fx.params) {
						root.style.setProperty(q.cssVar, projectParam(q, p[q.key]));
					}
					pinner.set(p.statusText);
					if (p.speedMode === "follow") {
						sampler.setFloor(fx.followMin);
						sampler.start();
					} else {
						sampler.stop();
						/* constant mode: duration = base / multiplier, floored
						 * by the effect (1x = 4s official cadence; 3x -> 1.33s,
						 * 0.5x -> 8s; aurora never below its 6s floor) */
						const dur = Math.max(fx.followMin, BASE_S / p.mult);
						root.style.setProperty("--dv-dur", dur + "s");
					}
				};
				const off = scope.subscribe(reapply);
				reapply();

				return () => {
					off();
					sampler.stop();
					pinner.clear();
					st.remove();
					document.body.removeAttribute("data-dv-flow");
					document.body.removeAttribute("data-dv-effect");
					document.documentElement.style.removeProperty("--dv-dur");
					document.documentElement.style.removeProperty("--dv-int");
				};
			}, "deepdiving: style + effects + pace sampler");

			ctx.effect(() => {
				const locale = ctx.get("locale");
				let copy = copyFor(locale === undefined ? "zh" : locale.getSnapshot().active);
				let disposer = null;
				if (locale !== undefined) {
					disposer = locale.subscribe(() => {
						copy = copyFor(locale.getSnapshot().active);
						notify();
					});
				}
				const notify = () => bump((n) => n + 1);
				let n = 0;
				const bump = (fn) => { n = fn(n); rerender(); };
				let listeners = new Set();
				const rerender = () => { for (const l of listeners) l(); };
				// A tiny external-store bridge so the card re-renders on locale flips.
				const subscribe = (l) => {
					listeners.add(l);
					return () => { listeners.delete(l); };
				};
				const getCopy = () => copy;
				const card = () => h(LocaleBridge, { subscribe, getCopy, scope });
				function LocaleBridge({ subscribe: sub, getCopy: gc, scope: sc }) {
					const { useSyncExternalStore } = React;
					const c = useSyncExternalStore(sub, gc);
					return h(DeepdivingCard, { copy: c, scope: sc });
				}
				/* rc.7 keyed slot: the card claims the `deepdiving` namespace the
				 * Host half registers, and the Plugin-configuration tab pairs the
				 * two halves by that key — "a plugin that registers both halves is
				 * paired up automatically". slots.inject waits for the parent's
				 * children declaration, so ordering against ui-settings-plugins
				 * never matters. */
				const unregister = ctx.slots.inject("settings.plugin.item", () =>
					ctx.slots.register({ name: "settings.plugin.item", key: "deepdiving" }, card));
				return () => { if (disposer !== null) disposer(); unregister(); };
			}, "deepdiving: settings card");
		}

		return { inject, apply };
	},
});
