// meta.json: what made the narration, and the disclosure that travels with it. This module always
// writes the disclosure; callers cannot remove or replace it.
export const DISCLOSURE_PREFIX = 'AI-generated voice';

export const disclosureLine = (voice, modelName = 'Kokoro-82M') => `${DISCLOSURE_PREFIX}: narration synthesised with ${modelName} (voice ${voice}). No person's voice was recorded or cloned.`;

export const DISCLOSURE_RULE =
	'Say that anything published with this narration uses an AI-generated voice: a credit line on the end card or in the post text, and keep the machine-readable marks (this file, the WAV comment tag, the VTT NOTE and the master\'s comment tag). Rules such as the EU AI Act\'s transparency duties expect synthetic audio to be labelled.';

export const buildMeta = ({voice, engine, model, now = new Date(), ...rest}) => {
	const {disclosure: _d, ai_generated: _a, disclosure_rule: _r, ...clean} = rest;
	return {
		...clean,
		voice,
		engine,
		model,
		date: now.toISOString().slice(0, 10),
		created_at: now.toISOString(),
		ai_generated: true,
		disclosure: disclosureLine(voice, model?.name),
		disclosure_rule: DISCLOSURE_RULE,
	};
};

export const assertDisclosure = (meta) => {
	if (!meta || meta.ai_generated !== true || typeof meta.disclosure !== 'string' || !meta.disclosure.startsWith(DISCLOSURE_PREFIX)) {
		throw new Error(`meta.json must carry ai_generated: true and a disclosure line starting "${DISCLOSURE_PREFIX}"`);
	}
	return meta;
};
