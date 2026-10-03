# The Linux render box

`docker/Dockerfile` builds a Debian image with Node 22, ffmpeg, the libraries Chrome Headless Shell
needs, and the kit's packages, running as an unprivileged user. Use it when your own machine
cannot render (or to check a film renders the same on Linux). There is no GPU inside, so WebGL
runs in software (`FILM_GL=swangle`): the pixels are right, it is just slower than a desktop GPU.

## Build

From the kit's own folder (the one with `package.json` in it):

```sh
docker build -f docker/Dockerfile -t cinematic-film-kit .
```

The build copies the kit, runs `npm ci` and downloads Chrome Headless Shell (about 110 MB), so the
first build takes a few minutes and needs the network. Your `node_modules`, `out` and `.env` are
left out of the image.

## Check it

```sh
docker run --rm cinematic-film-kit
```

The default command is `npm run doctor`. Inside the container it probes only `swangle` and should
end with "every check that ran passed".

## Render a film

Mount `src` (your films), `public` (their assets) and `out` (where the renders land), and run any
kit command after the image name:

```sh
docker run --rm -v "$PWD/src:/kit/src" -v "$PWD/public:/kit/public" -v "$PWD/out:/kit/out" cinematic-film-kit npm run release -- template
```

On Windows PowerShell, write `${PWD}` instead of `$PWD`. The files in `out` belong to the
container's user (uid 1000); on Linux, `sudo chown -R "$USER" out` hands them back if you need to.

Software rendering costs time. Measured on 2 October 2026 with 8 CPU cores given to Docker: the
template film released in the container at 0.4 s a frame (270 frames in 108 s), against 0.15 to
0.26 s a frame on a laptop GPU. A heavier shader widens that gap a lot, because the GPU's work
moves onto the CPU. Preview first (`npm run preview -- <id>`) to keep the wait short.
