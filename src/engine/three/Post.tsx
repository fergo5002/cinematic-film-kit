import {useFrame, useThree} from '@react-three/fiber';
import {BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect} from 'postprocessing';
import React, {useLayoutEffect, useMemo} from 'react';
import {useVideoConfig} from 'remotion';
import {HalfFloatType, NoToneMapping} from 'three';

// postprocessing driven by hand inside a Remotion <ThreeCanvas>.
// The composer is sized from the VIDEO config, never from R3F's measured canvas size.
// Tone mapping happens at the END of the chain (ToneMappingEffect), with the renderer's own
// tone mapping off, so bloom works on HDR values and nothing is clamped early.

export type PostProps = {
	bloom?: {intensity: number; threshold: number; smoothing?: number; levels?: number; radius?: number};
	vignette?: {offset: number; darkness: number};
	tone?: 'agx' | 'neutral' | 'aces';
	multisampling?: number;
};

export const Post: React.FC<PostProps> = ({bloom, vignette, tone = 'agx', multisampling = 4}) => {
	const {gl, scene, camera} = useThree();
	const {width, height} = useVideoConfig();

	// Key on the VALUES, so inline prop objects do not rebuild the composer every frame.
	const key = JSON.stringify({bloom, vignette, tone, multisampling});
	const composer = useMemo(() => {
		gl.toneMapping = NoToneMapping;
		const c = new EffectComposer(gl, {frameBufferType: HalfFloatType, multisampling});
		c.addPass(new RenderPass(scene, camera));
		const effects = [];
		// Fewer mip levels and a smaller radius than the defaults (8, 0.85): the default halo spreads
		// far enough to tint a dark ground towards the colour of a bright object beside it. After any
		// bloom change, sample the ground in a still and compare it with the hex you asked for.
		if (bloom) effects.push(new BloomEffect({intensity: bloom.intensity, luminanceThreshold: bloom.threshold, luminanceSmoothing: bloom.smoothing ?? 0.2, mipmapBlur: true, levels: bloom.levels ?? 5, radius: bloom.radius ?? 0.6}));
		if (vignette) effects.push(new VignetteEffect({offset: vignette.offset, darkness: vignette.darkness}));
		const mode = tone === 'neutral' ? ToneMappingMode.NEUTRAL : tone === 'aces' ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.AGX;
		effects.push(new ToneMappingEffect({mode}));
		c.addPass(new EffectPass(camera, ...effects));
		return c;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gl, scene, camera, key]);

	useLayoutEffect(() => {
		composer.setSize(width, height);
		return () => composer.dispose();
	}, [composer, width, height]);

	// Priority 1 takes over rendering from R3F. R3F's delta is wall-clock, so it is ignored, and the
	// composer gets an explicit 0: with no argument postprocessing reads its own wall-clock timer,
	// which would make any time-based effect differ between renders.
	useFrame(() => {
		composer.render(0);
	}, 1);

	return null;
};
