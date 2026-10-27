// Captions timed from the word timings. At most 42 characters a line and two lines a cue; a new
// cue after every sentence end and after any pause of 0.5 s or more; no cue longer than 7 s; when
// a cue overflows it breaks after a comma in its second half if there is one. A cue starts on its
// first word and holds up to 0.4 s past its last word, never into the next cue. A two-line cue
// breaks where it balances, preferring a clause end and never after a word that leads into the next.
const SENTENCE_END = /[.!?\u2026]["\u201D\u2019')\]]*$/;
const CLAUSE_END = /[,;:]["\u201D\u2019')\]]*$/;
// Words that lead into the next one: a line should not end on them ("between the / tides").
const LEADS_ON = /^(the|a|an|to|of|and|or|but|in|on|at|for|with|from|by|into|onto|over|under|between|through|towards|about|as|than|every|each|your|our|its|their|my|this|that)$/i;

export const layout = (texts, maxChars = 42, maxLines = 2) => {
	const one = texts.join(' ');
	if (one.length <= maxChars || texts.length === 1) return [one];
	if (maxLines < 2) return null;
	let best = null;
	for (let k = 1; k < texts.length; k++) {
		const a = texts.slice(0, k).join(' ');
		const b = texts.slice(k).join(' ');
		if (a.length > maxChars || b.length > maxChars) continue;
		const score = Math.abs(a.length - b.length) - (CLAUSE_END.test(texts[k - 1]) ? 8 : 0) + (LEADS_ON.test(texts[k - 1]) ? 12 : 0);
		if (!best || score < best.score) best = {score, lines: [a, b]};
	}
	return best ? best.lines : null;
};

export const buildCues = (words, {maxChars = 42, maxLines = 2, maxDuration = 7, pauseBreak = 0.5, linger = 0.4, minGap = 0.05} = {}) => {
	// 1. phrases: hard breaks at sentence ends and pauses
	const phrases = [];
	let cur = [];
	words.forEach((w, i) => {
		cur.push(w);
		const next = words[i + 1];
		if (!next || SENTENCE_END.test(w.text) || next.start - w.end >= pauseBreak) {
			phrases.push(cur);
			cur = [];
		}
	});
	// 2. pack each phrase into cues that fit
	const fits = (ws) => layout(ws.map((w) => w.text), maxChars, maxLines) !== null && ws.at(-1).end - ws[0].start <= maxDuration;
	const groups = [];
	for (const phrase of phrases) {
		let cue = [];
		for (const w of phrase) {
			if (!cue.length || fits([...cue, w])) {
				cue.push(w);
				continue;
			}
			let cut = cue.length;
			for (let i = cue.length - 1; i >= Math.ceil(cue.length / 2); i--) {
				if (CLAUSE_END.test(cue[i].text)) {
					cut = i + 1;
					break;
				}
			}
			groups.push(cue.slice(0, cut));
			const carry = cue.slice(cut);
			if (carry.length && !fits([...carry, w])) {
				groups.push(carry);
				cue = [w];
			} else cue = [...carry, w];
		}
		if (cue.length) groups.push(cue);
	}
	// 3. timing
	return groups.map((ws, i) => {
		const start = ws[0].start;
		const lastEnd = ws.at(-1).end;
		const next = groups[i + 1];
		const end = Math.max(Math.min(lastEnd + linger, start + maxDuration, next ? next[0].start - minGap : Infinity), lastEnd);
		const lines = layout(ws.map((w) => w.text), maxChars, maxLines);
		return {start, end, lines, text: lines.join(' '), wordCount: ws.length};
	});
};

const stamp = (sec, sep) => {
	const ms = Math.max(0, Math.round(sec * 1000));
	const pad = (n, w = 2) => String(n).padStart(w, '0');
	return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}${sep}${pad(ms % 1000, 3)}`;
};

export const toSRT = (cues) => cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.lines.join('\n')}\n`).join('\n');

// WebVTT cue text may not hold a bare "&" or "<" (both start markup) or the "-->" arrow.
const vttText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// `note` becomes a NOTE block after the header (players do not show it): the disclosure goes there.
export const toVTT = (cues, {note = null} = {}) => {
	const head = note ? `WEBVTT\n\nNOTE ${note.replace(/-->/g, '->')}\n\n` : 'WEBVTT\n\n';
	return head + cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.lines.map(vttText).join('\n')}\n`).join('\n');
};
