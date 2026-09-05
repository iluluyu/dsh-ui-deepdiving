/**
 * Host loader entry for dsh-ui-deepdiving: registers the `deepdiving`
 * settings namespace (schemastery schema) so the Web client's Plugin
 * configuration tab serves this plugin's card.
 *
 * dsh 0.1.0-rc.7 removed the api-proxy allowlist that kept third-party
 * namespaces off the wire — the Host now serves every registered namespace,
 * and the Plugins section keys its cards on the namespace they edit, "so a
 * plugin that registers both halves is paired up automatically"
 * (docs/cookbook/adding-a-settings-card.md). The browser half (lib/client.js)
 * binds a settingsScope on this namespace; preferences persist in the
 * host's settings document instead of per-browser localStorage.
 */
import z from "@deepseek-ai/schemastery";

/**
 * Namespace fields — every card control. All `applies: 'live'` (the
 * default): the browser half re-projects on every scope change, no restart.
 * The browser half's DEFAULTS (lib/client.js) must mirror these defaults.
 *
 * Shared knobs (any effect):
 *   effect     which animation preset runs; the browser half keeps a
 *              registry (EFFECTS) keyed by these ids and gates each
 *              effect's CSS on body[data-dv-effect]
 *   speedMode  constant | follow — follow hands --dv-dur to the pace
 *              sampler (the default: the water breathes with the turn)
 *   mult       constant-mode multiplier (1x = 4s official shimmer cadence)
 *   forceFlow  keep animating under prefers-reduced-motion
 *   glow       the soft text-shadow aura behind the glyphs
 *   intensity  0.3–1 — mixes the two lightest highlight stops toward
 *              transparency (the river bed stays put, text stays readable)
 *   statusText custom wording for the status line, defaulting to
 *              "Deep Diving" (the plugin's own name); an explicit empty
 *              string keeps the official locale text. Projected as a
 *              data-dv-text attribute the CSS turns into a ::before
 *              replacement (React never reclaims attributes it does not
 *              know about).
 *
 * Per-effect knobs (all registered, only the selected effect's are rendered
 * and projected — unselected keys keep their user values):
 *   depth   breath  breathing amplitude (opacity dips to 1 − depth)
 *   span    rainbow hue-rotate swing angle per cycle (alternate, seamless)
 *   trail   ecg     halo width around the sweeping beam
 *   swing   aurora  travel distance of the slow diagonal swing
 */
const DEEPDIVING_SCHEMA = z.object({
	effect: z.union(["flow", "stock", "breath", "rainbow", "ecg", "aurora"]).default("flow"),
	speedMode: z.union(["constant", "follow"]).default("follow"),
	mult: z.number().step(0.5).min(0.5).max(3).default(1),
	forceFlow: z.boolean().default(true),
	glow: z.boolean().default(true),
	intensity: z.number().step(0.1).min(0.3).max(1).default(1),
	statusText: z.string().default("Deep Diving"),
	depth: z.number().step(0.05).min(0.1).max(0.6).default(0.35),
	span: z.number().step(15).min(30).max(180).default(90),
	trail: z.number().step(5).min(5).max(30).default(15),
	swing: z.number().step(5).min(5).max(30).default(15),
});

/**
 * Register the namespace while a settings provider is composed.
 * @param ctx - host plugin context.
 */
export function apply(ctx) {
	ctx.inject(["settings"], (sctx) => {
		sctx.settings.register("deepdiving", DEEPDIVING_SCHEMA);
	});
}
