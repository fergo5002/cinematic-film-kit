import React, {useLayoutEffect} from 'react';
import {AbsoluteFill} from 'remotion';
import {ShaderCanvas} from '../engine/gl/ShaderCanvas';
import {GLSL_COMMON} from '../engine/gl/glsl';

// The doctor's probe (tools/doctor.mjs renders it once per --gl backend). It proves three things:
//   1. WebGL2 exists, and which renderer actually runs it: the string is logged as "GLPROBE {...}"
//      and the doctor reads it from the browser log. "SwiftShader" means the CPU did the work.
//   2. The pixels reach the screenshot: the outer quarters are flat reference colours whose bytes
//      the doctor checks, (204, 51, 102) and (51, 102, 204). A dead backend gives black instead.
//   3. How fast: a fixed, deliberately heavy workload (six full-frame passes of warped noise) is
//      drawn off screen before the frame is captured. A GPU does it in tens of milliseconds and a
//      CPU in seconds, so the doctor's timing separates real hardware from a software fallback.

const PROBE_FRAG = /* glsl */ `
vec4 shade(vec2 uv, vec2 px) {
  if (uv.x < 0.25) return vec4(0.8, 0.2, 0.4, 1.0);
  if (uv.x > 0.75) return vec4(0.2, 0.4, 0.8, 1.0);
  return vec4(vec3(0.5 + 0.1 * fbm(vec3(uv * 6.0, 0.0), 4)), 1.0);
}
`;

const WORKLOAD = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_seed;
out vec4 o;
${GLSL_COMMON}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float n = 0.0;
  for (int i = 0; i < 4; i++) n += warped(vec3(uv * 4.0, u_seed + float(i)), 6);
  o = vec4(vec3(0.5 + 0.05 * n), 1.0);
}`;

type Info = {webgl2: boolean; renderer?: string; vendor?: string; version?: string; maxTextureSize?: number; workload?: number};

const probe = (): Info => {
	const canvas = document.createElement('canvas');
	canvas.width = 1280;
	canvas.height = 720;
	const gl = canvas.getContext('webgl2', {preserveDrawingBuffer: true, antialias: false});
	if (!gl) return {webgl2: false};
	const debug = gl.getExtension('WEBGL_debug_renderer_info');
	const info: Info = {
		webgl2: true,
		renderer: String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
		vendor: String(debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
		version: String(gl.getParameter(gl.VERSION)),
		maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
	};
	const shader = (type: number, src: string) => {
		const s = gl.createShader(type);
		if (!s) throw new Error('createShader failed');
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`probe shader: ${gl.getShaderInfoLog(s)}`);
		return s;
	};
	const prog = gl.createProgram();
	if (!prog) throw new Error('createProgram failed');
	gl.attachShader(prog, shader(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;\nvoid main() { gl_Position = vec4(p, 0.0, 1.0); }'));
	gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, WORKLOAD));
	gl.linkProgram(prog);
	gl.useProgram(prog);
	const buf = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	const loc = gl.getAttribLocation(prog, 'p');
	gl.enableVertexAttribArray(loc);
	gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
	gl.viewport(0, 0, 1280, 720);
	gl.uniform2f(gl.getUniformLocation(prog, 'u_res'), 1280, 720);
	for (let k = 0; k < 6; k++) {
		gl.uniform1f(gl.getUniformLocation(prog, 'u_seed'), k * 1.7);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}
	// Reading a pixel back makes the browser wait until every pass has really been drawn.
	const px = new Uint8Array(4);
	gl.readPixels(640, 360, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
	info.workload = px[0];
	gl.deleteProgram(prog);
	gl.deleteBuffer(buf);
	return info;
};

export const GlProbe: React.FC = () => {
	useLayoutEffect(() => {
		console.log(`GLPROBE ${JSON.stringify(probe())}`);
	}, []);
	return (
		<AbsoluteFill style={{backgroundColor: '#000000'}}>
			<ShaderCanvas fragment={PROBE_FRAG} />
		</AbsoluteFill>
	);
};
