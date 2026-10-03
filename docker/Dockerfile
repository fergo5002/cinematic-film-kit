# A Linux render box for the kit: Node, ffmpeg, the libraries Chrome Headless Shell needs, and the
# kit's own packages, run as a normal user. There is no GPU in here, so WebGL runs in software
# (FILM_GL=swangle): correct pixels, slower than a desktop GPU.
#
# Build it from the kit's own folder (the unzipped cinematic-film-kit):
#   docker build -f docker/Dockerfile -t cinematic-film-kit .
# The default command runs the doctor. See docker/README.md for rendering.

FROM node:22.23.3-bookworm-slim

# The shared libraries Remotion documents for Chrome Headless Shell on Debian, plus ffmpeg (the
# tools measure and master with it), git (the manual asks agents to keep films in git) and unzip.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ca-certificates \
		ffmpeg \
		git \
		unzip \
		libnss3 \
		libdbus-1-3 \
		libatk1.0-0 \
		libgbm-dev \
		libasound2 \
		libxrandr2 \
		libxkbcommon-dev \
		libxfixes3 \
		libxcomposite1 \
		libxdamage1 \
		libatk-bridge2.0-0 \
		libpango-1.0-0 \
		libcairo2 \
		libcups2 \
	&& rm -rf /var/lib/apt/lists/*

ENV FILM_GL=swangle
ENV NODE_ENV=development

# The node image already has an unprivileged user called node.
RUN mkdir /kit && chown node:node /kit
WORKDIR /kit
USER node

# Packages first, so editing a film does not reinstall them.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .
RUN npx remotion browser ensure

CMD ["npm", "run", "doctor"]
