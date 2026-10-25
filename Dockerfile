# Dockerfile - a small image that runs MoodJournal.
#
# We use the "slim" Debian image rather than alpine on purpose: the bcrypt
# package ships a ready-made binary for it, so no compilers are needed inside
# the image and the build stays simple and quick.
FROM node:20-slim

# Tell the app it is running for real (this turns on secure cookies, etc.).
ENV NODE_ENV=production
WORKDIR /app

# Install dependencies first. Docker caches this layer, so rebuilding after a
# code change does not re-install the packages. Dev tools (jest, nodemon,
# supertest) are skipped - they are not needed to run the app.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the rest of the project (see .dockerignore for what is left out).
COPY . .

# The base image already has an unprivileged "node" user - use it.
USER node

EXPOSE 3000

# A light check that the app and its database are answering.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
