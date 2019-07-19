# swarmhead

## Build
```
$ docker build -t swarmhead .
```

## Run
```
$ docker volume create bot00
$ docker run --rm -it \
    --mount source=bot00,target=/app \
    swarmhead cabal://c0d1a3dbf9b605b76424a6494c47bc736351ab26e4d5c6d752b89db624edf7b3
```
