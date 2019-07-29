const minimist   = require('minimist')
const fs         = require('fs')
const proc       = require('child_process')
const mkdirp     = require('mkdirp')
const crypto     = require('crypto')
const path       = require('path')
const memdb      = require('memdb')
const umkv       = require('unordered-materialized-kv')
const hyperdrive = require('hyperdrive')
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
let datshare = hyperdrive(pathshare)
let datkey = undefined
let cabalkey = undefined
let state = undefined

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
  cabal.publish({
    type: 'chat/text',
    content: { channel: 'bots', text }
  })
}

function work() {
  let bdb = memdb()
  let kv = umkv(bdb)
  let botstate = BotState(cabalkey, bdb, kv)

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
            setTimeout(work, 2500)
          })
          break;

        case states.DO_JOB:
          let job = botstate.job()
          let pathjob = path.join(argv.state, 'job')
          console.log('do job ->', job.uri)
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

                let child = proc.spawn('npm', ['start'], { cwd : pathjob })
                child.stdout.on('data', (data) => publish('!stdout> ' + data.toString().trim()))
                child.stderr.on('data', (data) => publish('!stderr> ' + data.toString().trim()))
                child.once('close', (code) => {
                  if (code === 0) {
                    publish(`!done ${job.uri}`)
                  } else {
                    publish(`!error ${job.uri}`)
                  }
                  setTimeout(work, 2500)
                })
              })
            })
          })
          break;

        default:
          setTimeout(work, 2500)
      }
    })
  }))
}

cabal.swarm(error)
datshare.once('error', error)
datshare.once('ready', () => {
  datkey = datshare.key.toString('hex')
  console.log('dat pubkey ->', datkey)
  datshare.close()
  cabal.getLocalKey((err, key) => {
    if (err) { error(err) }
    else {
      cabalkey = key
      console.log('cabal pubkey ->', cabalkey)
      work()
    }
  })
})

process.on('SIGINT', () => process.exit(0))
