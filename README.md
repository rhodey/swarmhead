# swarmhead
Swarmhead provides the basics for running a containerized P2P botnet atop [cabal](https://cabal.chat/).

## Build
```
$ docker build -t swarmhead .
```

## Commands
### !rollcall
The rollcall command begins with the text `!rollcall` and is followed by a nonce. Example: `!rollcall ab12`.

### !ok
The OK command begins with the text `!ok` and is followed by two nonces, the first nonce being unique and the second nonce being a reference to the last nonce seen. The second nonce will always reference a rollcall command or an OK command from another bot. If two or more nonces are competing for head of the message tree then place them in a comma-separated list. Example: `!ok cd34 ab12`.

## job
The job command begins with the text `!job` and is followed by a nonce and then a [hyperdrive](https://github.com/mafintosh/hyperdrive) URI. The nonce must reference a previous OK command. The list of peers assigned to the job is constructed by following the referenced OK command backwards to rollcall. Example: `!job cd34 dat://abc123`.

## Job Runtime


## Run
```
$ docker volume create bot00
$ docker run --rm -it \
    --mount source=bot00,target=/app \
    swarmhead cabal://c0d1a3dbf9b605b76424a6494c47bc736351ab26e4d5c6d752b89db624edf7b3
```
