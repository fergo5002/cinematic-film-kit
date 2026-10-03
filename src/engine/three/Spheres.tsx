import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useLayoutEffect, useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {EASE, lerp} from '../lib/motion';
import {Post} from './Post';

// A neutral three.js example: a matte ceramic sphere and a small polished one that circles it,
// lit by a procedural studio environment and finished by a hand-driven postprocessing chain.
// Every transform is a pure function of the frame; nothing may depend on wall-clock time or on
// R3F useFrame deltas, which run on the wall clock under Remotion.
//
// Do NOT use @react-three/postprocessing's <EffectComposer> inside <ThreeCanvas>: it rendered an
// empty frame (observed 1 October 2026). <Post> drives postprocessing directly and works.

// RoomEnvironment through PMREM: soft studio light and reflections with no HDR file to ship.
const Environment: React.FC = () => {
	const {gl, scene} = useThree();
	useLayoutEffect(() => {
		const pmrem = new THREE.PMREMGenerator(gl);
		const room = new RoomEnvironment();
		const env = pmrem.fromScene(room, 0.035);
		scene.environment = env.texture;
		return () => {
			env.dispose();
			pmrem.dispose();
		};
	}, [gl, scene]);
	return null;
};

const Spheres: React.FC<{arrive: number; t: number}> = ({arrive, t}) => {
	const sphere = useMemo(() => new THREE.SphereGeometry(1, 128, 64), []);
	const ceramic = useMemo(
		() => new THREE.MeshPhysicalMaterial({color: '#c3c8cf', roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.9}),
		[],
	);
	const steel = useMemo(() => new THREE.MeshPhysicalMaterial({color: '#c4c9d1', metalness: 1, roughness: 0.14, envMapIntensity: 1.6}), []);
	// The small sphere circles on a tilted orbit; its angle is the frame, nothing else.
	const a = t * 0.9 + 0.6;
	const orbit: [number, number, number] = [Math.cos(a) * 1.9, Math.sin(a) * 0.45, Math.sin(a) * 1.9];
	return (
		<group scale={0.94 + 0.06 * arrive} rotation={[0.18, 0, -0.08]}>
			<mesh geometry={sphere} material={ceramic} />
			<mesh geometry={sphere} material={steel} position={orbit} scale={0.28} />
		</group>
	);
};

export const SpheresScene: React.FC<{from: number; to: number; background?: string}> = ({from, to, background = '#121417'}) => {
	const frame = useCurrentFrame();
	const {width, height, fps} = useVideoConfig();
	const arrive = lerp(frame, [from, from + (to - from) * 0.4], [0, 1], EASE.out);
	// A slow push in, scripted like a camera move rather than an orbit control.
	const push = lerp(frame, [from, to], [0, 0.8], EASE.inOut);
	return (
		<ThreeCanvas width={width} height={height} camera={{fov: 30, position: [0, 0.3, 9], near: 0.1, far: 50}} gl={{antialias: false, preserveDrawingBuffer: true}}>
			{/* An opaque scene background (three converts the hex to linear), so the effect chain works
			    on real pixels instead of a transparent canvas over CSS. */}
			<color attach="background" args={[background]} />
			<Environment />
			<directionalLight position={[-3, 5, 4]} intensity={1.3} color="#ffffff" />
			<group position={[0, 0, push]}>
				<Spheres arrive={arrive} t={(frame - from) / fps} />
			</group>
			{/* High threshold: only true highlights bloom. A low threshold hazes the whole frame. */}
			<Post bloom={{intensity: 0.35, threshold: 1.1, smoothing: 0.15}} vignette={{offset: 0.3, darkness: 0.45}} tone="agx" />
		</ThreeCanvas>
	);
};
