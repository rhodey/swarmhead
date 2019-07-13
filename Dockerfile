FROM alpine:edge

MAINTAINER rhodey@anhonestefort.org

RUN apk add --no-cache \
  bash \
  nodejs-current \
  npm || true

RUN npm install -g dat

RUN mkdir -p /root/swarmhead/bin
WORKDIR /root/swarmhead

COPY package.json package.json
RUN npm install

COPY index.js index.js
COPY bin/cmd.js bin/cmd.js

ENTRYPOINT ["node", "bin/cmd.js"]
