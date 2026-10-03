#!/usr/bin/env node
/**
 * slop-lint: the executable half of the anti-slop taxonomy.
 *
 * A quality criterion left as prose beside enforced ones gets traded away. So every slop tell
 * that can be detected statically is detected here, and the serious ones fail the build. What
 * it cannot see (ideas, composition, truth) stays with the critic.
 *
 * Usage: npm run lint:slop -- <film-id> [--strict] [--json]
 *        node tools/slop-lint.mjs <folder> [--strict] [--json]
 *   A film id lints src/films/<id>. Exit 1 on any error, or on any warning with --strict.
 *
 * Suppress one finding on a line (and the line after) with a REASON:
 *   // slop-lint-ignore no-linear-motion -- progress bar must read as linear
 * A suppression without a reason is itself an error.
 *
 * Optional slop-lint.config.json in the linted folder:
 *   { "allowFonts": {"Inter": "brand-mandated, client style guide p.4"},
 *     "maxFamilies": 2, "ignore": ["vendor/"] }
 */
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {FILMS_DIR, isFilmId} from './lib/kit.mjs';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) ?? '.';
const root = !existsSync(target) && isFilmId(target) ? path.join(FILMS_DIR, target) : path.resolve(target);
if (!existsSync(root) || !statSync(root).isDirectory()) {
	console.error(`slop-lint: no folder or film "${target}"`);
	process.exit(2);
}
const STRICT = args.includes('--strict');
const JSON_OUT = args.includes('--json');

const cfgPath = path.join(root, 'slop-lint.config.json');
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
const allowFonts = cfg.allowFonts ?? {};
const maxFamilies = cfg.maxFamilies ?? 2;
const ignore = cfg.ignore ?? [];

const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.json', '.glsl', '.frag', '.md', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'build', 'dist', '.remotion', 'public']);

const files = [];
const walk = (dir) => {
	for (const name of readdirSync(dir).sort()) {
		const p = path.join(dir, name);
		const rel = path.relative(root, p).replaceAll('\\', '/');
		if (ignore.some((g) => rel.startsWith(g))) continue;
		const st = statSync(p);
		if (st.isDirectory()) {
			if (!SKIP_DIRS.has(name)) walk(p);
		} else if (EXT.has(path.extname(name)) && st.size < 2_000_000 && !name.endsWith('.lock') && name !== 'package-lock.json') {
			files.push(p);
		}
	}
};
const srcDir = path.join(root, 'src');
walk(existsSync(srcDir) ? srcDir : root);

const findings = [];
const add = (rule, sev, file, line, msg) => findings.push({rule, sev, file: path.relative(root, file).replaceAll('\\', '/'), line, msg});

// ---------- colour helpers ----------
const hexToRgb = (h) => {
	h = h.replace('#', '');
	if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
	if (h.length === 8) h = h.slice(0, 6);
	const n = parseInt(h, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHsl = ([r, g, b]) => {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h;
	if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	return [h * 60, s, l];
};
const colorsIn = (text) => {
	const out = [];
	for (const m of text.matchAll(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b/g)) out.push(rgbToHsl(hexToRgb(m[0])));
	for (const m of text.matchAll(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/g)) out.push(rgbToHsl([+m[1], +m[2], +m[3]]));
	for (const m of text.matchAll(/hsla?\(\s*(-?[\d.]+)(?:deg)?[ ,]+([\d.]+)%[ ,]+([\d.]+)%/g)) out.push([((+m[1] % 360) + 360) % 360, +m[2] / 100, +m[3] / 100]);
	return out;
};
const isSaturated = ([, s, l]) => s > 0.35 && l > 0.18 && l < 0.85;
const isBlueViolet = ([h]) => h >= 215 && h <= 300;

// ---------- font lists ----------
// The distributional centre in 2026: model defaults, framework defaults and the "designer default"
// faces that every template picks. Any of them can be right for a reason; none may be a default.
const OVERUSED_FONTS = [
	'Inter', 'Inter Tight', 'Roboto', 'Arial', 'Helvetica Neue', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
	'Space Grotesk', 'Space Mono', 'JetBrains Mono', 'DM Sans', 'DM Mono', 'Plus Jakarta Sans', 'Manrope',
	'Outfit', 'Sora', 'Raleway', 'Nunito', 'Work Sans', 'Geist', 'Geist Mono', 'Satoshi', 'General Sans',
	'Clash Display', 'Cabinet Grotesk', 'Bricolage Grotesque', 'Playfair Display', 'IBM Plex Sans', 'Urbanist',
];

const COPY_SLOP = [
	[/\bintroducing\b/i, '"Introducing X" is the template reveal'],
	[/\brevolutioni[sz]e/i, 'revolutionise'],
	[/\bseamless(ly)?\b/i, 'seamless'],
	[/\bunlock\b/i, 'unlock'],
	[/\bempower/i, 'empower'],
	[/\belevate\b/i, 'elevate'],
	[/\bsupercharge/i, 'supercharge'],
	[/\bnext[- ]level\b/i, 'next-level'],
	[/\bgame[- ]chang/i, 'game-changer'],
	[/\bcutting[- ]edge\b/i, 'cutting-edge'],
	[/\ball[- ]in[- ]one\b/i, 'all-in-one'],
	[/\beffortless(ly)?\b/i, 'effortless'],
	[/\bAI[- ]powered\b/i, 'AI-powered'],
	[/\bdelve\b/i, 'delve'],
	[/\b(it'?s|this is|isn'?t) not just\b/i, '"not just X, it\'s Y"'],
	[/\bsay goodbye to\b/i, 'say goodbye to'],
	[/\bthe future of\b/i, 'the future of'],
	[/\bstreamline/i, 'streamline'],
	[/\bleverag/i, 'leverage'],
];

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
// Written as escapes so this file never contains the characters it bans.
const DASH = /\u2014|\s\u2013\s/;

// balanced-paren extraction starting at index of '('
const callBody = (text, open) => {
	let depth = 0;
	for (let i = open; i < text.length && i < open + 4000; i++) {
		if (text[i] === '(') depth++;
		else if (text[i] === ')') {
			depth--;
			if (depth === 0) return text.slice(open, i + 1);
		}
	}
	return text.slice(open, open + 4000);
};
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// ---------- font constants ----------
// Films name faces through constants (fontFamily: FONT.serif), so the font rules resolve them.
// The maps come from the linted files and, for a film inside this kit, from src/engine.
const CONST_MAP = /(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=\s*\{([^}]*)\}/g;
const fontConstants = new Map();
const collectConstants = (text) => {
	for (const m of text.matchAll(CONST_MAP)) {
		for (const kv of m[2].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*['"`]([^'"`]+)['"`]/g)) fontConstants.set(`${m[1]}.${kv[1]}`, kv[2]);
	}
};
const engineDir = path.resolve(root, '..', '..', 'engine');
const extraSources = path.basename(path.dirname(root)) === 'films' && existsSync(engineDir) ? readdirSync(engineDir).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(engineDir, f)) : [];
for (const f of [...files, ...extraSources]) collectConstants(readFileSync(f, 'utf8'));
const FONT_REF = /(?:fontFamily|family)\s*:\s*([A-Z][A-Z0-9_]*\.[A-Za-z_$][\w$]*)/g;
const FONT_FILE = /fonts?\/([A-Za-z0-9_-]+)\.(?:woff2?|ttf|otf)\b/g;
const overusedIn = (name) =>
	OVERUSED_FONTS.filter((face) => face.replace(/ /g, '').toLowerCase() === name.replace(/[ _-]/g, '').toLowerCase() || new RegExp(`^${face.replace(/ /g, '[ _-]?')}(?![A-Za-z])`, 'i').test(name));

for (const file of files) {
	const text = readFileSync(file, 'utf8');
	const lines = text.split('\n');
	const ext = path.extname(file);
	const isCode = ['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext);
	// Relative to the linted folder: a project that happens to sit under a folder called scripts
	// is still render code.
	const relFile = path.relative(root, file);
	const isRenderCode = isCode && !/(^|[\\/])scripts[\\/]/.test(relFile) && !/\.test\./.test(file);

	// suppressions
	const suppressed = new Map(); // line number -> Set(rule)
	lines.forEach((l, i) => {
		const m = l.match(/slop-lint-ignore\s+([a-z-]+)(\s+--\s+(.+))?/);
		if (!m) return;
		if (!m[3] || m[3].trim().length < 4) add('suppression-without-reason', 'error', file, i + 1, `slop-lint-ignore ${m[1]} needs "-- <reason>"`);
		for (const n of [i + 1, i + 2]) {
			if (!suppressed.has(n)) suppressed.set(n, new Set());
			suppressed.get(n).add(m[1]);
		}
	});
	const report = (rule, sev, line, msg) => {
		if (suppressed.get(line)?.has(rule)) return;
		add(rule, sev, file, line, msg);
	};

	lines.forEach((l, i) => {
		const n = i + 1;
		const isComment = /^\s*(\/\/|\*|\/\*)/.test(l);

		if (isRenderCode && /Math\.random\s*\(/.test(l) && !isComment)
			report('no-math-random', 'error', n, 'Math.random() makes renders non-deterministic; use a seeded PRNG (src/engine/lib/prng.ts).');
		// The wall clock in its several disguises, reported once per line at the worst severity.
		if (isRenderCode && !isComment) {
			const clock = [];
			if (/\b(Date\.now|performance\.now)\s*\(|new Date\s*\(\s*\)/.test(l)) clock.push(['error', 'Wall-clock time in render code: every frame must be a pure function of the frame number.']);
			if (/\.clock\b|\bclock\s*\.\s*(elapsedTime|getElapsedTime|getDelta|oldTime|startTime)\b/.test(l)) clock.push(['error', "R3F's clock runs on the wall clock under Remotion: derive time from useCurrentFrame()."]);
			if (/\bcomposer\s*\.\s*render\s*\(\s*\)/.test(l)) clock.push(['error', "postprocessing's composer.render() with no delta reads its own wall-clock timer: pass 0 and drive effects from the frame."]);
			if (/useFrame\s*\(\s*(?:async\s*)?(?:\(\s*[^)\s]|[A-Za-z_$][\w$]*\s*=>)/.test(l)) clock.push(['warn', "A useFrame callback that takes R3F's state or delta reads the wall clock under Remotion; derive motion from useCurrentFrame()."]);
			if (clock.length) {
				const worst = clock.find((c) => c[0] === 'error') ?? clock[0];
				report('no-wall-clock', worst[0], n, worst[1]);
			}
		}
		if (isCode && /<Noise\b/.test(l) && /postprocessing/.test(text))
			report('nondeterministic-grain', 'warn', n, 'postprocessing <Noise> advances on the composer clock (wall-clock); use a frame-seeded grain pass (src/engine/Grain.tsx).');
		if (/Easing\.linear\b/.test(l) || /(transition|animation)(-timing-function)?\s*[:=][^;\n]*\blinear\b/.test(l))
			report('no-linear-motion', 'warn', n, 'Linear motion: only continuous loops and progress may be linear. Suppress with a reason if this is one.');
		if (/(transition|animation)(-timing-function|TimingFunction)?\s*[:=]\s*['"`]?[^;'"`\n]*\b(ease|ease-in-out|ease-out|ease-in)\b(?!-)/.test(l) && !/cubic-bezier/.test(l))
			report('default-css-ease', 'warn', n, 'Browser default ease keywords: use the easing presets in src/engine/lib/motion.ts.');
		if (/scale\(\s*0\s*\)|scale\s*:\s*0(?![.\d])|scale=\{?\s*0\s*\}?(?![.\d])/.test(l) && !isComment)
			report('no-scale-zero-entrance', 'warn', n, 'Entering from scale(0) is the template pop; enter at 0.9 to 0.97 with opacity.');
		if (DASH.test(l))
			report('em-dash', isComment ? 'warn' : 'error', n, 'Em dash (or spaced en dash): banned in all copy. Use a full stop, comma or brackets.');
		if (/backdrop-?filter\s*[:=]?\s*['"`]?\s*blur|backdropFilter\s*:/.test(l))
			report('glassmorphism', 'warn', n, 'Backdrop blur glass: saturated in 2026 (glass and Liquid Glass imitation). Only if the brand is literally glass.');
		if (/background-?clip\s*[:=]\s*['"`]?text|backgroundClip\s*:\s*['"`]text|WebkitBackgroundClip\s*:\s*['"`]text/.test(l))
			report('gradient-text', 'warn', n, 'Gradient headline text: a top vibe-coded tell. Let size, weight and timing do the work.');
		if (/OrbitControls|autoRotate/.test(l))
			report('orbit-camera', 'note', n, 'Orbit/auto-rotate camera is the code version of the drone orbit. Script the camera like a character.');
		if (/LensFlare|lens-?flare/i.test(l)) report('lens-flare', 'warn', n, 'Lens flares: only with a motivated light source in frame.');
		if (/[\u258C\u2588]/.test(l) && /slice\(/.test(text)) report('typewriter', 'note', n, 'Typewriter caret reveal: template grammar unless typing is the story.');
		if (isCode && /rotateX\(\s*(-?\d+(\.\d+)?)deg/.test(l)) {
			const deg = Math.abs(Number(l.match(/rotateX\(\s*(-?\d+(\.\d+)?)deg/)[1]));
			if (deg >= 25 && /perspective/.test(text))
				report('tilted-cards', 'warn', n, `rotateX(${deg}deg) under perspective: tilted floating UI cards are a 2024-2026 SaaS cliché. Show the real product flat and true.`);
		}

		// shadows and glows
		const glow = l.match(/(box-?shadow|text-?shadow|textShadow|boxShadow|drop-shadow)[^;\n]*/i);
		if (glow) {
			const blurs = [...glow[0].matchAll(/(\d+(\.\d+)?)px/g)].map((m) => +m[1]);
			const cols = colorsIn(glow[0]);
			if (blurs.some((b) => b >= 24) && cols.some(isSaturated))
				report('neon-glow', 'warn', n, 'Large saturated glow: unprompted neon glow is a top AI-made tell. Light only what emits light.');
		}

		// gradients: purple/blue AI gradient
		if (/(linear|radial|conic)-gradient\s*\(/.test(l)) {
			const idx = l.search(/(linear|radial|conic)-gradient\s*\(/);
			const body = l.slice(idx, idx + 400);
			const cols = colorsIn(body).filter(isSaturated);
			if (cols.filter(isBlueViolet).length >= 2 || (cols.some(isBlueViolet) && cols.some(([h]) => h >= 280 && h <= 330)))
				report('ai-gradient', 'warn', n, 'Purple/blue gradient: the single most recognisable AI default ("AI purple"). Take colour from a real referent in the brand world.');
		}

		// fonts: named on the line, reached through a constant, or loaded from a file
		const fontMsg = (face) => `"${face}" is a default face (the distributional centre). Choose a face for a reason in the brand's world, or justify it in slop-lint.config.json allowFonts.`;
		const flagged = new Set();
		const fontCtx = /font-?family|fontFamily|family\s*:|loadFont|google-fonts\/|@font-face|fonts\.googleapis/i.test(l);
		if (fontCtx) {
			for (const face of OVERUSED_FONTS) {
				const re = new RegExp(`(?:^|[^A-Za-z])${face.replace(/ /g, '[ _-]?')}(?![A-Za-z]|[ _-]?(Tight|Mono|Display))`, 'i');
				if (!re.test(l) || face in allowFonts) continue;
				flagged.add(face);
			}
		}
		for (const m of l.matchAll(FONT_REF)) {
			const name = fontConstants.get(m[1]);
			if (name) for (const face of overusedIn(name)) if (!(face in allowFonts)) flagged.add(face);
		}
		for (const m of l.matchAll(FONT_FILE)) for (const face of overusedIn(m[1])) if (!(face in allowFonts)) flagged.add(face);
		// "Inter Tight" also matches "Inter": keep only the longest face named on a line
		for (const face of flagged) if ([...flagged].some((o) => o !== face && o.startsWith(face))) flagged.delete(face);
		for (const face of flagged) report('overused-font', 'warn', n, fontMsg(face));

		// copy (string literals and JSX text only, roughly)
		const isCopyFile = ['.json', '.md'].includes(ext) || isCode;
		if (isCopyFile && !isComment) {
			const strings = isCode ? [...l.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1|>([^<>{}]{3,})</g)].map((m) => m[2] ?? m[3] ?? '') : [l];
			// bare JSX text on its own line: words and spaces, no code punctuation
			if (isCode && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(l) && !/[=;(){}<>]|^\s*(import|export|const|let|return|if|for)\b/.test(l)) strings.push(l);
			for (const s of strings) {
				for (const [re, label] of COPY_SLOP) if (re.test(s)) report('slop-copy', 'warn', n, `Copy tell: ${label}. Concrete nouns, one product truth, a line only this brand could say.`);
				if (EMOJI.test(s)) report('emoji-in-copy', 'warn', n, 'Emoji in on-screen copy reads as template.');
			}
		}
	});

	// interpolate() without easing: linear by default
	if (isRenderCode) {
		for (const m of text.matchAll(/\binterpolate\s*\(/g)) {
			const open = m.index + m[0].length - 1;
			const body = callBody(text, open);
			// an easing key, including the shorthand property form `{easing, ...}`
			if (!/\beasing\b\s*[:,}]/.test(body)) {
				const n = lineOf(text, m.index);
				// colour/opacity ramps on a single linear progress value are common and fine when suppressed with a reason
				report('no-linear-motion', 'warn', n, 'interpolate() without an easing is linear. Add an easing preset, or suppress with a reason (loop, progress, already-eased input).');
			}
		}
	}

	// particle swarm heuristic
	for (const m of text.matchAll(/Array\.from\(\s*\{\s*length\s*:\s*(\d+)/g)) {
		if (+m[1] >= 300) add('particle-swarm', 'note', file, lineOf(text, m.index), `${m[1]} generated elements: particle swarms and plexus fields are template shorthand for "tech". Is this true data?`);
	}
}

// family count across the project: string literals and FONT-style constants alike
const families = new Set();
for (const file of files) {
	const text = readFileSync(file, 'utf8');
	for (const m of text.matchAll(/(?:fontFamily\s*:\s*|font-family\s*:\s*|family\s*:\s*)['"`]([^'"`,]+)/g)) families.add(m[1].trim());
	for (const m of text.matchAll(FONT_REF)) if (fontConstants.has(m[1])) families.add(fontConstants.get(m[1]).trim());
}
if (families.size > maxFamilies)
	findings.push({rule: 'too-many-families', sev: 'warn', file: '(project)', line: 0, msg: `${families.size} type families (${[...families].join(', ')}); the limit is ${maxFamilies}.`});

// ---------- report ----------
const order = {error: 0, warn: 1, note: 2};
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file) || a.line - b.line);
const counts = {error: 0, warn: 0, note: 0};
for (const f of findings) counts[f.sev]++;

if (JSON_OUT) {
	console.log(JSON.stringify({root, files: files.length, counts, findings}, null, 2));
} else {
	for (const f of findings) console.log(`${f.sev.toUpperCase().padEnd(5)} ${f.rule.padEnd(24)} ${f.file}:${f.line}  ${f.msg}`);
	console.log(`\nslop-lint: ${counts.error} errors, ${counts.warn} warnings, ${counts.note} notes across ${files.length} files`);
}
process.exitCode = counts.error > 0 || (STRICT && counts.warn > 0) ? 1 : 0;
