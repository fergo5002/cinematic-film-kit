import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {continueRender, delayRender, useCurrentFrame, useVideoConfig} from 'remotion';
import {GLSL_COMMON} from './glsl';

// A full-frame WebGL2 fragment shader, driven ONLY by the Remotion frame, so every render of a
// frame produces identical pixels. Draws synchronously in useLayoutEffect, before Remotion
// captures the frame. Shader compile errors throw, so a broken shader fails the render loudly
// instead of shipping black frames.

export type UniformValue =
	| number
	| [number, number]
	| [number, number, number]
	| [number, number, number, number];

export type ShaderCanvasProps = {
	// GLSL ES 3.00 body. Must define: vec4 shade(vec2 uv, vec2 px). uv is 0..1 with y up,
	// px is in output pixels. Available uniforms: u_time (seconds), u_frame, u_resolution,
	// plus anything in `uniforms`. GLSL_COMMON helpers are prepended.
	fragment: string;
	uniforms?: Record<string, UniformValue>;
	// Render at this multiple of the output size and let the compositor downsample.
	// 1.5 to 2 removes shimmer on fine noise; it costs supersample^2 in time.
	supersample?: number;
	style?: React.CSSProperties;
};

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const glslType = (v: UniformValue) => (typeof v === 'number' ? 'float' : `vec${v.length}`);

const compile = (gl: WebGL2RenderingContext, type: number, src: string) => {
	const s = gl.createShader(type);
	if (!s) throw new Error('createShader failed');
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
		const log = (gl.getShaderInfoLog(s) ?? '').trim();
		const numbered = src
			.split('\n')
			.map((l, i) => `${String(i + 1).padStart(4)} ${l}`)
			.join('\n');
		// The compiler log goes on the FIRST line: renderers often keep only the first line of an
		// error message, and an empty "compile failed" is undiagnosable.
		console.error(`Shader source:\n${numbered}`);
		throw new Error(`Shader compile failed: ${log.replace(/\s+/g, ' ')}`);
	}
	return s;
};

type GLState = {
	gl: WebGL2RenderingContext;
	prog: WebGLProgram;
	loc: Record<string, WebGLUniformLocation | null>;
};

export const ShaderCanvas: React.FC<ShaderCanvasProps> = ({fragment, uniforms = {}, supersample = 1, style}) => {
	const frame = useCurrentFrame();
	const {width, height, fps} = useVideoConfig();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const glRef = useRef<GLState | null>(null);
	const continued = useRef(false);
	const [handle] = useState(() => delayRender('Compiling shader'));

	// A string signature keeps the program stable across frames even when `uniforms` is a new
	// object every render. Recompiling per frame is the classic way to make a shader film crawl.
	const signature = Object.keys(uniforms)
		.sort()
		.map((n) => `${n}:${glslType(uniforms[n])}`)
		.join(',');
	const fragSrc = useMemo(() => {
		// Declare each prop uniform unless the fragment already declares it: a redeclared uniform
		// is a compile error.
		const declared = (n: string) => new RegExp(`uniform\\s+\\w+\\s+${n}\\s*;`).test(fragment);
		const decls = signature
			? signature
					.split(',')
					.map((p) => {
						const [n, t] = p.split(':');
						return declared(n) ? '' : `uniform ${t} ${n};`;
					})
					.join('\n')
			: '';
		return `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_frame;
uniform vec2 u_resolution;
${decls}
out vec4 outColor;
${GLSL_COMMON}
${fragment}
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / u_resolution;
  outColor = shade(uv, px);
}`;
	}, [fragment, signature]);

	const W = Math.round(width * supersample);
	const H = Math.round(height * supersample);

	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext('webgl2', {
			preserveDrawingBuffer: true,
			antialias: false,
			alpha: false,
			premultipliedAlpha: false,
			powerPreference: 'high-performance',
		});
		if (!gl) throw new Error('WebGL2 unavailable with this --gl backend. Run npm run doctor: it tries each backend and keeps one that works (swangle is the slow software fallback).');
		const prog = gl.createProgram();
		if (!prog) throw new Error('createProgram failed');
		gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
		gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Link failed: ${gl.getProgramInfoLog(prog)}`);
		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		const aPos = gl.getAttribLocation(prog, 'a_pos');
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
		const names = ['u_time', 'u_frame', 'u_resolution', ...(signature ? signature.split(',').map((p) => p.split(':')[0]) : [])];
		const loc: Record<string, WebGLUniformLocation | null> = {};
		for (const n of names) loc[n] = gl.getUniformLocation(prog, n);
		glRef.current = {gl, prog, loc};
		if (!continued.current) {
			continued.current = true;
			continueRender(handle);
		}
		return () => {
			gl.deleteProgram(prog);
			gl.deleteBuffer(buf);
			glRef.current = null;
		};
	}, [fragSrc, handle, signature]);

	useLayoutEffect(() => {
		const g = glRef.current;
		if (!g) return;
		const {gl, prog, loc} = g;
		gl.viewport(0, 0, W, H);
		gl.useProgram(prog);
		gl.uniform1f(loc.u_time, frame / fps);
		gl.uniform1f(loc.u_frame, frame);
		gl.uniform2f(loc.u_resolution, W, H);
		for (const [n, v] of Object.entries(uniforms)) {
			const l = loc[n];
			if (typeof v === 'number') gl.uniform1f(l, v);
			else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
			else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
			else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
		}
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		// Block until the GPU is done so the pixels exist when Remotion takes the screenshot.
		gl.finish();
	});

	return <canvas ref={canvasRef} width={W} height={H} style={{width, height, display: 'block', ...style}} />;
};
