const test     = require('tape')
const memdb    = require('memdb')
const umkv     = require('unordered-materialized-kv')
const BotState = require('../index.js').BotState
const states   = require('../index.js').states


function readAll(state, mail, idx, cb) {
  if (idx >= mail.length) return cb(null, state)
  state.next(mail[idx], (err, s) => {
    if (err) return cb(err)
    else readAll(state, mail, idx + 1, cb)
  })
}

test('initial state', function (t) {
  t.plan(1)

  let db = memdb()
  let kv = umkv(db)
  let botstate = BotState('B', db, kv)

  t.equal(botstate.state(), states.WAIT_ROLL)
})

test('ack rollcall', function (t) {
  t.plan(3)

  let db = memdb()
  let kv = umkv(db)
  let botstate = BotState('B', db, kv)

  let mail = [
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA00' }}},
    { key : 'Z', value : { content : { channel : 'bots', text : '!ok ZZ00 AA00 dat://Z' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!job ZZ00 dat://abc666' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA11' }}},
  ]

  readAll(botstate, mail, 0, (err, state) => {
    t.error(err)
    t.equal(botstate.state(), states.ACK_ROLL)
    kv.get('head', (err, ids) => {
      t.deepEqual(ids, ['AA11'])
    })
  })
})

test('recall rollcall', function (t) {
  t.plan(3)

  let db = memdb()
  let kv = umkv(db)
  let botstate = BotState('B', db, kv)

  let mail = [
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA11' }}},
    { key : 'B', value : { content : { channel : 'bots', text : '!ok BB00 AA11 dat://B' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA22' }}},
  ]

  readAll(botstate, mail, 0, (err, state) => {
    t.error(err)
    t.equal(botstate.state(), states.ACK_ROLL)
    kv.get('head', (err, ids) => {
      t.deepEqual(ids, ['AA22'])
    })
  })
})

test('wait job split', function (t) {
  t.plan(3)

  let db = memdb()
  let kv = umkv(db)
  let botstate = BotState('B', db, kv)

  let mail = [
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA11' }}},
    { key : 'B', value : { content : { channel : 'bots', text : '!ok BB00 AA11 dat://B' }}},
    { key : 'C', value : { content : { channel : 'bots', text : '!ok CC00 AA11 dat://C' }}},
  ]

  readAll(botstate, mail, 0, (err, state) => {
    t.error(err)
    t.equal(botstate.state(), states.WAIT_JOB)
    kv.get('head', (err, ids) => {
      t.deepEqual(ids, ['BB00', 'CC00'])
    })
  })
})

test('wait job join', function (t) {
  t.plan(3)

  let db = memdb()
  let kv = umkv(db)
  let botstate = BotState('B', db, kv)

  let mail = [
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA11' }}},
    { key : 'B', value : { content : { channel : 'bots', text : '!ok BB00 AA11 dat://B' }}},
    { key : 'C', value : { content : { channel : 'bots', text : '!ok CC00 AA11 dat://C' }}},
    { key : 'D', value : { content : { channel : 'bots', text : '!ok DD00 BB00,CC00 dat://D' }}},
  ]

  readAll(botstate, mail, 0, (err, state) => {
    t.error(err)
    t.equal(botstate.state(), states.WAIT_JOB)
    kv.get('head', (err, ids) => {
      t.deepEqual(ids, ['DD00'])
    })
  })
})

test('do job', function (t) {
  t.plan(3)

  let db = memdb()
  let kv = umkv(db)
  let botstate = BotState('B', db, kv)

  let mail = [
    { key : 'Z', value : { content : { channel : 'bots', text : '!ok ZZ00 AA00 dat://Z' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!job ZZ00 dat://abc666' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA11' }}},
    { key : 'B', value : { content : { channel : 'bots', text : '!ok BB00 AA11 dat://B' }}},
    { key : 'C', value : { content : { channel : 'bots', text : '!ok CC00 AA11 dat://C' }}},
    { key : 'D', value : { content : { channel : 'bots', text : '!ok DD00 BB00,CC00 dat://D' }}},
    { key : 'E', value : { content : { channel : 'bots', text : '!ok EE00 BB00 dat://E' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!job DD00,EE00 dat://abc777' }}},
  ]

  readAll(botstate, mail, 0, (err, state) => {
    t.error(err)
    t.equal(botstate.state(), states.DO_JOB)
    let peers = Object.keys(botstate.job().peers)
    t.deepEqual(peers, ['D', 'B', 'C', 'E'])
  })
})

test('do job noise', function (t) {
  t.plan(3)

  let db = memdb()
  let kv = umkv(db)
  let botstate = BotState('B', db, kv)

  let mail = [
    { key : 'A', value : { content : { channel : 'bots', text : '!job ZZ00 dat://abc666' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA11' }}},
    { key : 'Z', value : { content : { channel : 'bots', text : '!ok ZZ00 AA00 dat://Z' }}},
    { key : 'B', value : { content : { channel : 'bots', text : '!ok BB00 AA11 dat://B' }}},
    { key : 'C', value : { content : { channel : 'bots', text : '!ok CC00 AA11 dat://C' }}},
    { key : 'D', value : { content : { channel : 'bots', text : '!ok DD00 BB00,CC00 dat://D' }}},
    { key : 'E', value : { content : { channel : 'bots', text : '!ok EE00 BB00 dat://E' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!job DD00,EE00 dat://abc777' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA22' }}},
  ]

  readAll(botstate, mail, 0, (err, state) => {
    t.error(err)
    t.equal(botstate.state(), states.DO_JOB)
    let peers = Object.keys(botstate.job().peers)
    t.deepEqual(peers, ['D', 'B', 'C', 'E'])
  })
})

test('done job', function (t) {
  t.plan(2)

  let db = memdb()
  let kv = umkv(db)
  let botstate = BotState('B', db, kv)

  let mail = [
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA11' }}},
    { key : 'B', value : { content : { channel : 'bots', text : '!ok BB00 AA11 dat://B' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!job BB00 dat://abc777' }}},
    { key : 'B', value : { content : { channel : 'bots', text : '!done dat://abc777' }}},
  ]

  readAll(botstate, mail, 0, (err, state) => {
    t.error(err)
    t.equal(botstate.state(), states.WAIT_ROLL)
  })
})

test('error job', function (t) {
  t.plan(2)

  let db = memdb()
  let kv = umkv(db)
  let botstate = BotState('B', db, kv)

  let mail = [
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA11' }}},
    { key : 'B', value : { content : { channel : 'bots', text : '!ok BB00 AA11 dat://B' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!job BB00 dat://abc777' }}},
    { key : 'B', value : { content : { channel : 'bots', text : '!error dat://abc777' }}},
  ]

  readAll(botstate, mail, 0, (err, state) => {
    t.error(err)
    t.equal(botstate.state(), states.WAIT_ROLL)
  })
})

test('not my job', function (t) {
  t.plan(3)

  let db = memdb()
  let kv = umkv(db)
  let botstate = BotState('B', db, kv)

  let mail = [
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA00' }}},
    { key : 'Z', value : { content : { channel : 'bots', text : '!ok ZZ00 AA00 dat://Z' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!job ZZ00 dat://abc666' }}},
  ]

  readAll(botstate, mail, 0, (err, state) => {
    t.error(err)
    t.equal(botstate.state(), states.WAIT_ROLL)
    kv.get('head', (err, ids) => {
      t.deepEqual(ids, ['ZZ00'])
    })
  })
})

test('cannot start job', function (t) {
  t.plan(2)

  let db = memdb()
  let kv = umkv(db)
  let botstate = BotState('B', db, kv)

  let mail = [
    { key : 'A', value : { content : { channel : 'bots', text : '!rollcall AA11' }}},
    { key : 'B', value : { content : { channel : 'bots', text : '!ok BB00 AA11 dat://B' }}},
    { key : 'C', value : { content : { channel : 'bots', text : '!ok CC00 AA11 dat://C' }}},
    { key : 'A', value : { content : { channel : 'bots', text : '!job EE00 dat://abc777' }}},
  ]

  readAll(botstate, mail, 0, (err, state) => {
    t.ok(err.notFound)
    t.equal(botstate.state(), states.WAIT_ROLL)
  })
})


