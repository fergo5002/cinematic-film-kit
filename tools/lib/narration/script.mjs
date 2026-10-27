// The narration script format, src/films/<id>/narration.txt:
//
//   one sentence or phrase per line;
//   [pause 0.6] (seconds) on its own line or inline, for an exact silence;
//   a line that starts "# " (hash then space), or a bare "#", is a comment: it is skipped and
//     reported through `warn`, so nothing vanishes silently ("#1 choice" is spoken);
//   {display|spoken} sets how a word or phrase is said while the captions keep the written form;
//     text glued to a group ("Pay{ment|ments}") belongs to both forms.
//
// Money, percentages, years and plain numbers are spoken in full, the British way ("and" after
// hundreds, "per cent"). An amount with exactly two decimals is a price: "$12.50" is "twelve
// dollars fifty". Node built-ins only.
export const PAUSE_MIN = 0.05;
export const PAUSE_MAX = 5;
const PAUSE_RE = /\[pause\b([^\]]*)\]/gi;
const COMMENT_RE = /^#(\s|$)/;
// Kokoro is weakest on very short utterances and rushes long ones (its own VOICES.md), so lines
// outside these lengths are flagged, not refused: a two-word line can be exactly right.
export const LINE_WORDS = {min: 3, max: 30};
const DASH = /\u2014|\s\u2013\s/;

export const parseScript = (text, {warn = (m) => console.warn(m)} = {}) => {
	const items = [];
	const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
	lines.forEach((raw, idx) => {
		const line = idx + 1;
		const body = raw.trim();
		if (!body) return;
		if (COMMENT_RE.test(body)) {
			warn(`line ${line}: skipped as a comment: "${body}"`);
			return;
		}
		if (DASH.test(body)) warn(`line ${line}: an em or en dash reads as machine-written and shows in the captions; use a comma, a full stop or a [pause] mark`);
		let last = 0;
		let words = 0;
		for (const m of body.matchAll(PAUSE_RE)) {
			words += pushSpeech(items, body.slice(last, m.index), line);
			const arg = m[1].trim().replace(/s$/i, '');
			const seconds = Number(arg);
			if (arg === '' || !Number.isFinite(seconds) || seconds < PAUSE_MIN || seconds > PAUSE_MAX) {
				throw new Error(`line ${line}: pause mark "${m[0]}" must give seconds between ${PAUSE_MIN} and ${PAUSE_MAX}, e.g. [pause 0.6]`);
			}
			items.push({type: 'pause', seconds, line});
			last = m.index + m[0].length;
		}
		words += pushSpeech(items, body.slice(last), line);
		if (words && words < LINE_WORDS.min) warn(`line ${line}: ${words} words; the voice is weakest on very short lines, so listen to it or join it to the next line`);
		if (words > LINE_WORDS.max) warn(`line ${line}: ${words} words; the voice rushes long lines, so split it (aim for ${LINE_WORDS.min + 5} to ${LINE_WORDS.max})`);
	});
	return {items};
};

const pushSpeech = (items, chunk, line) => {
	const text = chunk.trim().replace(/\s+/g, ' ');
	if (!text) return 0;
	if (/\[pause/i.test(text)) throw new Error(`line ${line}: unclosed pause mark in "${text}"`);
	if (/[{}]/.test(text.replace(/\{[^{}|]+\|[^{}]+\}/g, ''))) throw new Error(`line ${line}: a {display|spoken} group is malformed in "${text}"`);
	const words = splitWords(text, line);
	items.push({type: 'speech', line, text, words, spokenText: words.map((w) => w.spoken).join(' ')});
	return words.length;
};

const splitWords = (text, line) => {
	const words = [];
	for (const m of text.matchAll(/(\S*?)\{([^{}|]+)\|([^{}]+)\}(\S*)|(\S+)/g)) {
		if (m[5] !== undefined) words.push({text: m[5], spoken: spokenFor(m[5])});
		else words.push({text: m[1] + m[2].trim() + m[4], spoken: m[1] + m[3].trim() + m[4], explicit: true});
	}
	// Two groups in one word ("{a|b}{c|d}") are not supported: raw braces must never reach the voice
	// or the captions.
	for (const w of words) {
		if (/[{}]/.test(w.text + w.spoken)) throw new Error(`line ${line}: "${w.text}" holds more than one {display|spoken} group in a single word; write it as one group`);
	}
	return words;
};

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const under100 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
const under1000 = (n) => {
	const h = Math.floor(n / 100);
	const r = n % 100;
	if (!h) return under100(r);
	return r ? `${ONES[h]} hundred and ${under100(r)}` : `${ONES[h]} hundred`;
};

export const numberToWords = (n) => {
	if (!Number.isInteger(n) || n < 0) throw new Error(`numberToWords takes a whole number, got ${n}`);
	if (n === 0) return 'zero';
	const parts = [];
	let rest = n;
	for (const [value, name] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
		if (rest >= value) {
			parts.push(`${under1000(Math.floor(rest / value))} ${name}`);
			rest %= value;
		}
	}
	if (rest > 0) parts.push(parts.length && rest < 100 ? `and ${under100(rest)}` : under1000(rest));
	return parts.reduce((s, p, i) => (i === 0 ? p : s + (p.startsWith('and ') ? ' ' : ', ') + p), '');
};

const decimalToWords = (str) => {
	const [whole, frac] = str.replace(/,/g, '').split('.');
	const w = numberToWords(Number(whole));
	return frac ? `${w} point ${[...frac].map((d) => ONES[Number(d)]).join(' ')}` : w;
};

const yearToWords = (y) => {
	if (y >= 2000 && y % 1000 < 10) return numberToWords(y);
	const hi = Math.floor(y / 100);
	const lo = y % 100;
	if (lo === 0) return `${under100(hi)} hundred`;
	if (lo < 10) return `${under100(hi)} oh ${ONES[lo]}`;
	return `${under100(hi)} ${under100(lo)}`;
};

// [one, many, one minor unit, many minor units]
const CURRENCY = {$: ['dollar', 'dollars', 'cent', 'cents'], '£': ['pound', 'pounds', 'penny', 'pence'], '€': ['euro', 'euros', 'cent', 'cents']};
const SCALE = {k: 'thousand', m: 'million', mn: 'million', b: 'billion', bn: 'billion', t: 'trillion', tn: 'trillion'};

// The spoken form of one written word, keeping its leading and trailing punctuation.
export const spokenFor = (word) => {
	const [, lead, core, trail] = word.match(/^([("\u201C\u2018'[]*)(.*?)([.,;:!?)"\u201D\u2019'\]\u2026]*)$/);
	return lead + spokenCore(core) + trail;
};

const spokenCore = (core) => {
	let m = core.match(/^([$£€])(\d[\d,]*(?:\.\d+)?)(k|mn|m|bn|b|tn|t)?$/i);
	if (m) {
		const [, sym, amount, scale] = m;
		const [one, many, minorOne, minorMany] = CURRENCY[sym];
		if (scale) return `${decimalToWords(amount)} ${SCALE[scale.toLowerCase()]} ${many}`;
		const price = amount.match(/^([\d,]+)\.(\d\d)$/);
		if (price) {
			const whole = Number(price[1].replace(/,/g, ''));
			const minor = Number(price[2]);
			const major = `${numberToWords(whole)} ${whole === 1 ? one : many}`;
			if (!minor) return major;
			if (!whole) return `${under100(minor)} ${minor === 1 ? minorOne : minorMany}`;
			return `${major} ${under100(minor)}`;
		}
		return `${decimalToWords(amount)} ${amount === '1' ? one : many}`;
	}
	m = core.match(/^(\d[\d,]*(?:\.\d+)?)%$/);
	if (m) return `${decimalToWords(m[1])} per cent`;
	if (/^\d{4}$/.test(core) && Number(core) >= 1100 && Number(core) <= 2099) return yearToWords(Number(core));
	if (/^\d{1,3}(,\d{3})+$|^\d+$/.test(core)) return numberToWords(Number(core.replace(/,/g, '')));
	if (/^\d+\.\d+$/.test(core)) return decimalToWords(core);
	return core;
};
