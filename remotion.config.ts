import {Config} from '@remotion/cli/config';
import {resolveGl} from './tools/lib/gl.mjs';

// Read by `npm run studio` and any `npx remotion` command. The kit's own render, stills and
// doctor tools use the same choice through tools/lib/gl.mjs.

// The WebGL backend: FILM_GL wins, then the doctor's choice in film.local.json, then a default
// (angle on Windows and macOS; swangle on Linux, where a server or container usually has no GPU).
// `npm run doctor` measures which backend really renders on the GPU here and writes the file.
Config.setChromiumOpenGlRenderer(resolveGl(process.cwd()).gl as 'angle' | 'swangle' | 'angle-egl' | 'vulkan' | 'egl' | 'swiftshader');

// Several renderer processes instead of one on Linux: Remotion recommends it there.
if (process.platform === 'linux') Config.setChromiumMultiProcessOnLinux(true);

// JPEG frames for previews are several times faster; full renders pass PNG explicitly.
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
