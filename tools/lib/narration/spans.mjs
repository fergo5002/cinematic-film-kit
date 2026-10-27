// Spoken words joined into phrases: a gap shorter than `join` seconds stays inside the phrase.
// Shared by the bed's duck (audio/voice.mjs) and the release gate's voice-lead measurement.
export const speechSpans = (words, {join = 0.35} = {}) => {
	const spans = [];
	for (const x of [...words].sort((a, b) => a.start - b.start)) {
		const last = spans.at(-1);
		if (last && x.start - last.end < join) last.end = Math.max(last.end, x.end);
		else spans.push({start: x.start, end: x.end});
	}
	return spans;
};
