const minimist      = require('minimist')
const exec          = require('child_process').exec
const mkdirp        = require('mkdirp')
const crypto        = require('crypto')
const path          = require('path')
const level         = require('memdb')
const umkv          = require('unordered-materialized-kv')
const hyperdrive    = require('hyperdrive')
const Cabal         = require('cabal-core')
const Swarm         = require('discovery-swarm')
const swarmDefaults = require('dat-swarm-defaults')
const BotState      = require('./state.js').BotState
const states        = require('./state.js').states

function error (err) {
  if (err) {
    console.error(err)
    process.exit(1)
  }
}

var argv = minimist(process.argv.slice(2), {
  alias: { d : 'datadir', c : 'channel' },
  default: { datadir : '.datadir', channel : 'bots' },
  string: [ '_' ]
})

mkdirp.sync(argv.datadir)

let addr = argv._[0].replace(/^cabal:\/*/,'')
let db = level()
let cabal = Cabal(path.join(argv.datadir, 'cabal'), addr, { db })
let datout = hyperdrive(path.join(argv.datadir, 'datout'))
let botid = undefined

function fetchMail(channel, cb) {
  let arr = []
  cabal.messages.read(channel, { limit : 100 })
    .on('data', (msg) => arr.push(msg))
    .once('end', () => cb(null, arr.reverse()))
}

function readAll(state, mail, idx, cb) {
  if (idx >= mail.length) return cb(null, state)
  state.next(mail[idx], (err, s) => {
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
  let bdb = level()
  let kv = umkv(bdb)
  let botstate = BotState(botid, bdb, kv)

  fetchMail('bots', ((err, mail) => {
    if (err) return error(err)
    readAll(botstate, mail, 0, (err, bs) => {
      if (err) return error(err)
      console.log('end state ->', botstate.state())

      switch (botstate.state()) {
        case states.ACK_ROLL:
          kv.get('head', (err, ids) => {
            let nonce = crypto.randomBytes(2).toString('hex')
            let uri = 'dat://' + datout.key.toString('hex')
            let ack = '!ok ' + nonce + ' ' + ids.join(',') + ' ' + uri
            publish(ack)
            setTimeout(work, 2500)
          })
          break;

        case states.DO_JOB:
          let job = botstate.job()
          let key = job.uri.replace(/^dat:\/*/,'')
          let pathin = path.join(argv.datadir, 'datin')
          exec('rm -rf ' + pathin, (err, stdout, stderr) => {
            if (err) return error(err)
            exec('dat clone ' + job.uri + ' ' + pathin, (err, stdout, stderr) => {
              if (err) return error(err)
              else {
                console.log(job)
                setTimeout(work, 2500)
              }
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
  cabal.getLocalKey((err, key) => {
    if (err) { error(err) }
    else {
      console.log(key)
      botid = key
      work()
    }
  })
})
