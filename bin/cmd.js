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
  alias: { d : 'datadir' },
  default: { datadir : '/app' },
  string: [ '_' ]
})

mkdirp.sync(argv.datadir)

let addr = argv._[0].replace(/^cabal:\/*/,'')
let db = memdb()
let cabal = Cabal(path.join(argv.datadir, 'cabal'), addr, { db })
let datout = hyperdrive(path.join(argv.datadir, 'datout'))
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
          let pathin = path.join(argv.datadir, 'datin')
          console.log('do job ->', job.uri)
          proc.exec(`rm -rf ${pathin}`, (err, stdout, stderr) => {
            if (err) return error(err)
            proc.exec(`dat clone ${job.uri} ${pathin}`, (err, stdout, stderr) => {
              if (err) return error(err)
              proc.exec('npm install', { cwd : pathin }, (err) => {
                if (err) return error(err)
                let pathout = path.resolve(path.join(argv.datadir, 'datout'))
                let config = Object.assign({ }, job, { cabalkey, hyperdrive : pathout })
                let configFile = path.join(pathin, 'config.json')
                fs.writeFileSync(configFile, JSON.stringify(config))

                let child = proc.spawn('npm', ['start'], { cwd : pathin })
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
datout.once('error', error)
datout.once('ready', () => {
  datkey = datout.key.toString('hex')
  console.log('dat pubkey ->', datkey)
  datout.close()
  cabal.getLocalKey((err, key) => {
    if (err) { error(err) }
    else {
      console.log('cabal pubkey ->', key)
      cabalkey = key
      work()
    }
  })
})

process.on('SIGINT', () => process.exit(0))
