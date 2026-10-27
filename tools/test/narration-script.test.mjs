// The narration script format: one phrase per line, pause marks, comments, {display|spoken}
// groups, and numbers, money and years spoken in full the British way.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {numberToWords, parseScript, spokenFor} from '../lib/narration/script.mjs';

const quiet = {warn: () => {}};

test('one speech item per line, and pause marks become pause items', () => {
	const s = parseScript('The sea keeps its own time.\n[pause 0.6]\nTwice a day, it stops.', quiet);
	assert.deepEqual(s.items.map((i) => i.type), ['speech', 'pause', 'speech']);
	assert.equal(s.items[1].seconds, 0.6);
	assert.equal(s.items[0].line, 1);
	assert.equal(s.items[2].line, 3);
});

test('an inline pause mark splits a line into two speech items', () => {
	const s = parseScript('Between the tides, [pause 0.3] the water rests.', quiet);
	assert.deepEqual(s.items.map((i) => i.type), ['speech', 'pause', 'speech']);
	assert.equal(s.items[0].text, 'Between the tides,');
	assert.equal(s.items[2].text, 'the water rests.');
	assert.equal(s.items[1].seconds, 0.3);
});

test('blank lines and # comments are left out', () => {
	const s = parseScript('# a note for the editor\n\nHello there, harbour.\n   \n', quiet);
	assert.equal(s.items.length, 1);
	assert.equal(s.items[0].text, 'Hello there, harbour.');
});

test('a malformed or out-of-range pause mark fails with its line number', () => {
	assert.throws(() => parseScript('Fine words here.\n[pause soon]', quiet), /line 2/);
	assert.throws(() => parseScript('[pause 9]', quiet), /line 1/);
	assert.throws(() => parseScript('[pause 0]', quiet), /line 1/);
});

test('display words keep the written form and carry a spoken form', () => {
	const w = parseScript('from $50k to $5m.', quiet).items[0].words;
	assert.deepEqual(w.map((x) => x.text), ['from', '$50k', 'to', '$5m.']);
	assert.deepEqual(w.map((x) => x.spoken), ['from', 'fifty thousand dollars', 'to', 'five million dollars.']);
});

test('{display|spoken} sets how a phrase is said and stays one display unit', () => {
	const w = parseScript('Meet {Hark Labs|Hark Laboratories} or read the {FAQ|F A Q}.', quiet).items[0].words;
	assert.equal(w[1].text, 'Hark Labs');
	assert.equal(w[1].spoken, 'Hark Laboratories');
	assert.equal(w[5].text, 'FAQ.');
	assert.equal(w[5].spoken, 'F A Q.');
});

test('the text sent to the voice is the spoken forms joined', () => {
	assert.equal(parseScript('from $50k to $5m.', quiet).items[0].spokenText, 'from fifty thousand dollars to five million dollars.');
});

test('currency, percentages and years are spoken in full, British style', () => {
	assert.equal(spokenFor('$50k'), 'fifty thousand dollars');
	assert.equal(spokenFor('$5m'), 'five million dollars');
	assert.equal(spokenFor('$1.5m'), 'one point five million dollars');
	assert.equal(spokenFor('$2bn'), 'two billion dollars');
	assert.equal(spokenFor('£250'), 'two hundred and fifty pounds');
	assert.equal(spokenFor('€1'), 'one euro');
	assert.equal(spokenFor('$1,250'), 'one thousand, two hundred and fifty dollars');
	assert.equal(spokenFor('12%'), 'twelve per cent');
	assert.equal(spokenFor('2026'), 'twenty twenty-six');
	assert.equal(spokenFor('2000'), 'two thousand');
	assert.equal(spokenFor('harbour,'), 'harbour,');
});

test('numberToWords says "and" after hundreds', () => {
	assert.equal(numberToWords(0), 'zero');
	assert.equal(numberToWords(105), 'one hundred and five');
	assert.equal(numberToWords(1001), 'one thousand and one');
	assert.equal(numberToWords(3400000), 'three million, four hundred thousand');
});

test('money with pence or cents is read as a price, not a decimal', () => {
	assert.equal(spokenFor('$12.50'), 'twelve dollars fifty');
	assert.equal(spokenFor('$1.00'), 'one dollar');
	assert.equal(spokenFor('£2.50'), 'two pounds fifty');
	assert.equal(spokenFor('£1.05'), 'one pound five');
	assert.equal(spokenFor('€3.20'), 'three euros twenty');
	assert.equal(spokenFor('$0.50'), 'fifty cents');
	assert.equal(spokenFor('£0.01'), 'one penny');
	assert.equal(spokenFor('£0.99'), 'ninety-nine pence');
	assert.equal(spokenFor('$1,250.75'), 'one thousand, two hundred and fifty dollars seventy-five');
	assert.equal(spokenFor('$12.50.'), 'twelve dollars fifty.');
});

test('a {display|spoken} group glued to the text before it keeps that text in both forms', () => {
	const s = parseScript('Pay{ment|ments} clear, see ({FAQ|F A Q}).', quiet);
	const w = s.items[0].words;
	assert.equal(w[0].text, 'Payment');
	assert.equal(w[0].spoken, 'Payments');
	assert.equal(w.at(-1).text, '(FAQ).');
	assert.equal(w.at(-1).spoken, '(F A Q).');
	assert.equal(s.items[0].spokenText, 'Payments clear, see (F A Q).');
	for (const x of w) assert.doesNotMatch(x.text + x.spoken, /[{}]/);
});

test('braces that cannot become one display word fail with the line number', () => {
	assert.throws(() => parseScript('Fine words here.\nA {b|c}{d|e} f.', quiet), /line 2/);
});

test('only "# " (hash then space) starts a comment, so "#1 choice" is spoken', () => {
	const s = parseScript('# a note\n#1 choice for sailors.\n#\nHello there, harbour.', quiet);
	assert.deepEqual(s.items.map((i) => i.text), ['#1 choice for sailors.', 'Hello there, harbour.']);
});

test('every line skipped as a comment is reported, so nothing vanishes silently', () => {
	const warnings = [];
	parseScript('# a note for the editor\nHello there, harbour.\n#\n', {warn: (m) => warnings.push(m)});
	assert.equal(warnings.length, 2);
	assert.match(warnings[0], /line 1\b.*comment.*a note for the editor/);
	assert.match(warnings[1], /line 3\b/);
});

test('very short and very long lines are flagged, because the voice is weakest on both', () => {
	const warnings = [];
	const long = Array.from({length: 32}, (_, i) => `word${i}`).join(' ');
	parseScript(`It stops.\nThe sea keeps its own time.\n${long}.`, {warn: (m) => warnings.push(m)});
	assert.equal(warnings.length, 2, warnings.join('\n'));
	assert.match(warnings[0], /line 1\b.*2 words/);
	assert.match(warnings[1], /line 3\b.*32 words/);
});

test('an em or en dash in the script is flagged: captions show it, and it reads as machine-written', () => {
	const warnings = [];
	parseScript('The tide turns \u2014 then rests.\nSix \u2013 seven.', {warn: (m) => warnings.push(m)});
	assert.equal(warnings.filter((m) => /dash/.test(m)).length, 2, warnings.join('\n'));
});
