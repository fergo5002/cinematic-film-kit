// slop-lint regression: every rule must still fire on the slop fixture, the clean fixture must stay
// clean, and the template film must lint clean, because new films start as a copy of it.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lint = path.join(here, '..', 'slop-lint.mjs');
const run = (target) => {
	const r = spawnSync(process.execPath, [lint, target, '--json'], {encoding: 'utf8'});
	return {code: r.status, report: JSON.parse(r.stdout)};
};

const RULES = [
	'no-math-random',
	'no-wall-clock',
	'em-dash',
	'suppression-without-reason',
	'too-many-families',
	'no-linear-motion',
	'overused-font',
	'ai-gradient',
	'glassmorphism',
	'neon-glow',
	'no-scale-zero-entrance',
	'tilted-cards',
	'gradient-text',
	'slop-copy',
	'emoji-in-copy',
	'orbit-camera',
];

test('every rule fires on the slop fixture', (t) => {
	const tmp = mkdtempSync(path.join(os.tmpdir(), 'slop-lint-'));
	t.after(() => rmSync(tmp, {recursive: true, force: true}));
	cpSync(path.join(here, 'fixtures', 'slop'), tmp, {recursive: true});
	// The em dash rule needs an em dash, and no file that ships may contain one, so the line that
	// carries it is written here, at run time, into a copy of the fixture.
	const dash = String.fromCharCode(0x2014);
	writeFileSync(path.join(tmp, 'src', 'Dash.tsx'), `export const Dash = () => <p>Book now ${dash} it fills up</p>;\n`);

	const {code, report} = run(tmp);
	const fired = new Set(report.findings.map((f) => f.rule));
	for (const rule of RULES) assert.ok(fired.has(rule), `rule ${rule} did not fire`);
	const fonts = report.findings.filter((f) => f.rule === 'overused-font').length;
	assert.equal(fonts, 3, 'expected 3 overused-font findings (Inter, Poppins, Space Grotesk)');
	const dashHit = report.findings.find((f) => f.rule === 'em-dash');
	assert.equal(dashHit.file, 'src/Dash.tsx');
	assert.equal(dashHit.sev, 'error');
	assert.equal(code, 1, 'errors must fail the lint');
});

test('the clean fixture has no findings', () => {
	const {code, report} = run(path.join(here, 'fixtures', 'clean'));
	assert.deepEqual(report.findings, []);
	assert.equal(code, 0);
});

// A throwaway project: {relative path: text}. Returns its root.
const project = (t, files, under = '') => {
	const tmp = mkdtempSync(path.join(os.tmpdir(), 'slop-lint-'));
	t.after(() => rmSync(tmp, {recursive: true, force: true}));
	const root = path.join(tmp, under);
	for (const [rel, text] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, rel)), {recursive: true});
		writeFileSync(path.join(root, rel), text);
	}
	return root;
};
const rulesAt = (report, rule) => report.findings.filter((f) => f.rule === rule).map((f) => `${f.file}:${f.line}`);

test('a project that happens to live in a folder called scripts is still render code', (t) => {
	const root = project(t, {'src/Scene.tsx': 'export const a = Math.random();\n'}, path.join('scripts', 'my-film'));
	const {report} = run(root);
	assert.deepEqual(rulesAt(report, 'no-math-random'), ['src/Scene.tsx:1']);
});

test('the wall clock is caught through useFrame state, a delta by any name, the R3F clock and the composer timer', (t) => {
	const root = project(t, {
		'src/Spin.tsx': [
			'useFrame((s) => { mesh.rotation.y = s.clock.elapsedTime; });',
			'useFrame((_, dt) => { x += dt; });',
			'const t = state.clock.getElapsedTime();',
			'composer.render();',
			'useFrame(() => { composer.render(0); }, 1);',
		].join('\n'),
	});
	const {report} = run(root);
	assert.deepEqual(rulesAt(report, 'no-wall-clock').sort(), ['src/Spin.tsx:1', 'src/Spin.tsx:2', 'src/Spin.tsx:3', 'src/Spin.tsx:4']);
});

test('fonts are seen through loadFont urls and FONT constants, and counted as families', (t) => {
	const root = project(t, {
		'src/fonts.ts': [
			"export const FONT = {display: 'Inter', body: 'Poppins', mono: 'Space Grotesk'};",
			'export const ready = loadFont({',
			'  family: FONT.display,',
			"  url: staticFile('fonts/Inter-Variable.woff2'),",
			'});',
		].join('\n'),
		'src/Scene.tsx': ['<h1 style={{fontFamily: FONT.display}} />', '<p style={{fontFamily: FONT.body}} />', '<code style={{fontFamily: FONT.mono}} />'].join('\n'),
	});
	const {report} = run(root);
	const fonts = report.findings.filter((f) => f.rule === 'overused-font');
	assert.ok(fonts.some((f) => f.file === 'src/fonts.ts' && f.line === 4), 'the face in the loadFont url was missed');
	assert.ok(fonts.some((f) => f.file === 'src/Scene.tsx'), 'a default face reached through FONT was missed');
	assert.equal(rulesAt(report, 'too-many-families').length, 1, 'three families through FONT constants were not counted');
});

test('the AI-gradient rule needs blue and violet, not blue and any colour', (t) => {
	const root = project(t, {
		'src/Warm.tsx': "const a = {background: 'linear-gradient(90deg, #2563eb, #f97316)'};\n",
		'src/Violet.tsx': "const b = {background: 'linear-gradient(90deg, #2563eb, #c026d3)'};\n",
	});
	const {report} = run(root);
	assert.deepEqual(rulesAt(report, 'ai-gradient'), ['src/Violet.tsx:1']);
});

test('the engine lints clean: no error-level finding in src/engine', () => {
	const {report} = run(path.join(here, '..', '..', 'src', 'engine'));
	assert.deepEqual(report.findings.filter((f) => f.sev === 'error'), []);
});

test('a film id lints src/films/<id>, and the template is clean', () => {
	const {code, report} = run('template');
	assert.match(report.root.replaceAll('\\', '/'), /src\/films\/template$/);
	assert.ok(report.files > 0, 'no files linted');
	const serious = report.findings.filter((f) => f.sev !== 'note');
	assert.deepEqual(serious, [], 'the template must have no errors or warnings: new films are copies of it');
	assert.equal(code, 0);
});
