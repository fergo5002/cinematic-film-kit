import React from 'react';
import {Composition} from 'remotion';
import {FILMS} from './films/registry';

// One composition per film folder; the composition id is the folder name. A film may also list
// `extras` in its film.ts (test sheets, single shots), which appear in Studio under their own ids.
type Comp = {id: string; component: React.FC; durationInFrames: number; fps: number; width: number; height: number};

export const RemotionRoot: React.FC = () => (
	<>
		{FILMS.flatMap((f) => [f as Comp, ...(((f as {extras?: Comp[]}).extras ?? []) as Comp[])]).map((c) => (
			<Composition key={c.id} id={c.id} component={c.component} durationInFrames={c.durationInFrames} fps={c.fps} width={c.width} height={c.height} />
		))}
	</>
);
