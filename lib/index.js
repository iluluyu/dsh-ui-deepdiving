/**
 * Host loader entry for dsh-ui-deepdiving: declares the row's Config
 * schema (schemastery, volatile fields) so the Host's settings domain
 * projects it as the `deepdiving` entry's configuration form.
 *
 * dsh 0.2.0 replaced the 0.1.x settings-namespace registry
 * (sctx.settings.register) with entry-owned Config: every volatile field
 * of a plugin row's Config becomes a live-editable form keyed by the row
 * id, values persist in the profile patch instead of settings.yaml, and
 * the browser half reaches them through ctx.configForms.get("deepdiving")
 * (same snapshot shape: status/value/base/user/revision/writable).
 *
 * The custom card (lib/client.js) renders the bundle/row config pages, so
 * this entry opts out of the auto-generated standard form
 * (settings.configure({ auto: false })).
 */
import z from "@deepseek-ai/schemastery";

/**
 * Config fields — every card control, all volatile (live): the browser
 * half re-projects on every change, no restart. The browser half's
 * DEFAULTS (lib/client.js) must mirror these defaults.
 *
 * Shared knobs (any effect):
 *   effect     which animation preset runs; the browser half keeps a
 *              registry (EFFECTS) keyed by these ids and gates each
 *              effect's CSS on body[data-dv-effect]
 *   speedMode  constant | follow — follow hands --dv-dur to the pace
 *              sampler (the default: the water breathes with the turn)
 *   mult       constant-mode multiplier (1x = 4s official shimmer cadence)
 *   forceFlow  "减弱动态时强制流动" — off by default; on keeps the
 *              current moving when the system reduces motion
 *   glow       optional text-shadow aura (default off)
 *   intensity  0.3–1 — mixes the two lightest highlight stops toward
 *              transparency (the river bed stays put, text stays readable)
 *   statusText custom wording; empty keeps the official locale text,
 *              including the elapsed-time clock
 *
 * Per-effect knobs (all registered, only the selected effect's are rendered
 * and projected — unselected keys keep their user values):
 *   depth   breath  breathing amplitude (opacity dips to 1 − depth)
 *   span    rainbow hue-rotate swing angle per cycle (alternate, seamless)
 *   trail   ecg     halo width around the sweeping beam
 *   swing   aurora  travel distance of the slow diagonal swing
 */
const Config = z.object({
	effect: z.union(["flow", "stock", "breath", "rainbow", "ecg", "aurora"]).default("flow").volatile(),
	speedMode: z.union(["constant", "follow"]).default("follow").volatile(),
	mult: z.number().step(0.5).min(0.5).max(3).default(1).volatile(),
	forceFlow: z.boolean().default(false).volatile(),
	glow: z.boolean().default(false).volatile(),
	intensity: z.number().step(0.1).min(0.3).max(1).default(1).volatile(),
	statusText: z.string().default("").volatile(),
	depth: z.number().step(0.05).min(0.1).max(0.6).default(0.35).volatile(),
	span: z.number().step(15).min(30).max(180).default(90).volatile(),
	trail: z.number().step(5).min(5).max(30).default(15).volatile(),
	swing: z.number().step(5).min(5).max(30).default(15).volatile(),
});

/**
 * Opt out of the auto-generated settings form: the browser half renders
 * the bundle's and the row's own configuration pages.
 * @param ctx - host plugin context.
 */
export function apply(ctx) {
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
	});
}

export { Config };
