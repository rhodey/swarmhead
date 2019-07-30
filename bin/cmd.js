const minimist   = require('minimist')
const fs         = require('fs')
const proc       = require('child_process')
const mkdirp     = require('mkdirp')
const crypto     = require('crypto')
const path       = require('path')
const memdb      = require('memdb')
const umkv       = require('unordered-materialized-kv')
const hyperdrive = require('hyperdrive')
const Discovery  = require('hyperdiscovery')
const Cabal      = require('cabal-core')
const BotState   = require('../index.js').BotState
const states     = require('../index.js').states

function error (err) {
  if (err) {
    console.error(err)
    process.exit(1)
  }
}

var argv = minimist(process.argv.slice(2), {
  alias: { s : 'state' },
  default: { state : '/app' },
  string: [ '_' ]
})

mkdirp.sync(argv.state)

let addr = argv._[0].replace(/^cabal:\/*/,'')
let db = memdb()
let cabal = Cabal(path.join(argv.state, 'cabal'), addr, { db })
let pathshare = path.resolve(path.join(argv.state, 'share'))
let archive = hyperdrive(pathshare)
let datkey = undefined
let cabalkey = undefined
let state = undefined
let job = undefined

const peerCount = () => Object.keys(job.peers).length

const peerOrder = () => {
  let arr = Object.keys(job.peers)
  arr.sort()
  return arr.indexOf(cabalkey)
}

function fetchMail(channel, cb) {
  let arr = []
  cabal.messages.read(channel, { limit : 100 })
    .on('data', (msg) => arr.push(msg))
    .once('end', () => cb(null, arr.reverse()))
}

function readAll(state, mail, idx, cb) {
  if (idx >= mail.length) return cb(null, state)
  state.next(mail[idx], (err, s) => {
    if (err && err.notFound) console.error(err)
    if (err && !err.notFound) return cb(err)
    else readAll(state, mail, idx + 1, cb)
  })
}

function publish (text) {
  console.log('publish>', text)
  cabal.publish({
    type: 'chat/text',
    content: { channel: 'bots', text }
  })
}

function doJob() {
  let pathjob = path.join(argv.state, 'job')
  publish(`!stdout> begin job ${job.uri}.`)
  proc.exec(`rm -rf ${pathjob}`, (err, stdout, stderr) => {
    if (err) return error(err)
    publish('!stdout> cloning job...')
    proc.exec(`dat clone ${job.uri} ${pathjob}`, (err, stdout, stderr) => {
      if (err) return error(err)
      publish('!stdout> npm install...')
      proc.exec('npm install', { cwd : pathjob }, (err) => {
        if (err) return error(err)
        let config = Object.assign({ }, job, { cabalkey, share : pathshare })
        let configFile = path.join(pathjob, 'config.json')
        fs.writeFileSync(configFile, JSON.stringify(config))

        job.child = proc.spawn('node', ['index.js'], { cwd : pathjob })
        job.child.stdout.on('data', (data) => publish('!stdout> ' + data.toString().trim()))
        job.child.stderr.on('data', (data) => publish('!stderr> ' + data.toString().trim()))
        job.child.once('close', (code) => {
          if (code === 0) {
            publish(`!done ${job.uri}`)
          } else {
            publish(`!error ${job.uri}`)
          }
          job = undefined
        })
      })
    })
  })
}

function awaitContent(archive, cb) {
  archive.on('ready', () => {
    let timer = setInterval(() => {
      if (archive.content) {
        clearInterval(timer)
        cb()
      }
    }, 125)
  })
}

function doSeed() {
  let pubkey = job.uri.replace(/^dat:\/*/,'')
  let pathseed = path.join(argv.state, pubkey)
  archive = hyperdrive(pathseed, pubkey, {sparse : true})
  job.discovery = Discovery(archive)
  let download = undefined

  publish('!stdout> awaiting peers...')
  awaitContent(archive, () => {
    publish('!stdout> awaiting length...')
    archive.content.update(1, ready)
  })

  function ready() {
    if (!job) return
    if (download) {
      archive.content.undownload(download)
    }

    let length = archive.content.length
    let chunkSize = Math.ceil(length / peerCount())
    let chunkStart = peerOrder() * chunkSize
    let chunkEnd = chunkStart + chunkSize

    archive.content.clear(0, chunkStart)
    archive.content.clear(chunkEnd, length)

    download = { start: chunkStart, end: chunkEnd }
    publish(`!stdout> begining download ${chunkStart} to ${chunkEnd} of ${length}...`)
    archive.content.download(download, () => {
      publish('!stdout> download complete, seeding...')
    })

    archive.content.update(ready)
  }
}

function work() {
  let bdb = memdb()
  let kv = umkv(bdb)
  let botstate = BotState(cabalkey, bdb, kv)
  let next = () => setTimeout(work, 2500)

  fetchMail('bots', ((err, mail) => {
    if (err) return error(err)
    readAll(botstate, mail, 0, (err, bs) => {
      if (err) return error(err)
      if (state !== botstate.state()) {
        state = botstate.state()
        console.log('bot state ->', state)
      }

      switch (state) {
        case states.ACK_ROLL:
          kv.get('head', (err, ids) => {
            let nonce = crypto.randomBytes(2).toString('hex')
            let ack = `!ok ${nonce} ${ids.join(',')} dat://${datkey}`
            publish(ack)
            next()
          })
          break;

        case states.DO_JOB:
          if (job) return next()
          job = botstate.job()
          if (!job.seed) {
            doJob()
          } else {
            doSeed()
          }
          next()
          break;

        case states.CANCEL:
          let cancelled = botstate.job().uri
          if (job && job.child && job.uri === cancelled) {
            job.child.kill()
          } else if (job && job.seed && job.uri === cancelled) {
            archive.close()
            job.discovery.close()
            publish(`!done ${job.uri}`)
            job = undefined
          }
          next()
          break

        default:
          next()
      }
    })
  }))
}

cabal.swarm(error)
archive.once('error', error)
archive.once('ready', () => {
  datkey = archive.key.toString('hex')
  console.log('dat pubkey ->', datkey)
  archive.close()
  cabal.getLocalKey((err, key) => {
    if (err) return error(err)
    cabalkey = key
    console.log('cabal pubkey ->', cabalkey)
    work()
  })
})

process.on('SIGINT', () => process.exit(0))
