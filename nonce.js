const crypto = require('crypto')
const level = require('memdb')
const umkv = require('unordered-materialized-kv')
const BotState = require('./state.js').BotState
const states = require('./state.js').states

const path       = require('path')
const minimist   = require('minimist')
const mkdirp     = require('mkdirp')
const hyperdrive = require('hyperdrive')
const Cabal      = require('cabal-core')

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
let drive = hyperdrive(path.join(argv.datadir, 'dat'))
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
    if (err) return cb(err)
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
            let uri = 'dat://' + drive.key.toString('hex')
            let ack = '!ok ' + nonce + ' ' + ids.join(',') + ' ' + uri
            publish(ack)
          })
          break;

        case states.DO_JOB:
          let job = botstate.job()
          console.log('do job ->', job)
          break;
      }
      setTimeout(work, 2500)
    })
  }))
}

cabal.swarm(error)
drive.once('error', error)
drive.once('ready', () => {
  cabal.getLocalKey((err, key) => {
    if (err) { error(err) }
    else {
      console.log(key)
      botid = key
      work()
    }
  })
})
