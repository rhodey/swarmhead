const umkv = require('unordered-materialized-kv')
let db = require('level')('./kv.db')
let kv = umkv(db)

let inbox = [
  { key : 'A', seq : 0, value : { content : { channel : 'bots', text : '!rollcall AA00' }}},
  { key : 'Z', seq : 0, value : { content : { channel : 'bots', text : '!ok ZZ00 AA00 dat://Z' }}},
  { key : 'A', seq : 1, value : { content : { channel : 'bots', text : '!job ZZ00 dat://abc666' }}},
  { key : 'A', seq : 2, value : { content : { channel : 'bots', text : '!rollcall AA11' }}},
  { key : 'B', seq : 0, value : { content : { channel : 'bots', text : '!ok BB00 AA11 dat://B' }}},
  { key : 'C', seq : 0, value : { content : { channel : 'bots', text : '!ok CC00 AA11 dat://C' }}},
  { key : 'D', seq : 0, value : { content : { channel : 'bots', text : '!ok DD00 BB00,CC00 dat://D' }}},
  { key : 'E', seq : 0, value : { content : { channel : 'bots', text : '!ok EE00 BB00 dat://E' }}},
  { key : 'A', seq : 3, value : { content : { channel : 'bots', text : '!job DD00,EE00 dat://abc777' }}},
  { key : 'B', seq : 1, value : { content : { channel : 'bots', text : '!done dat://abc777' }}},
]

let inboxA = { key : 'A', inbox }
let inboxB = { key : 'B', inbox : [inbox[1], inbox[2], inbox[3], inbox[4], inbox[5], inbox[6], inbox[7], inbox[8], inbox[9]] }
let inboxC = { key : 'C', inbox : [inbox[2], inbox[3], inbox[5], inbox[6], inbox[7], inbox[8]] }
let inboxD = { key : 'D', inbox }
let inboxE = { key : 'E', inbox : [inbox[0], inbox[1], inbox[2], inbox[3], inbox[4]] }

function SwarmState(id, inbox) {
  const WAIT_ROLLCALL = 0
  const ACK_ROLLCALL = 1
  const WAIT_JOB = 2
  const DO_JOB = 3

  let nonces = { }
  let peers = { }
  let state = WAIT_ROLLCALL

  function clearDb(cb) {
    db.createKeyStream()
      .on('data', (key) => db.del(key))
      .once('end', cb)
  }

  function filter(msg) {
    if (!msg.value) return
    if (!msg.value.content) return
    if (msg.value.content.channel !== 'bots') return
    if (typeof msg.value.content.text !== 'string') return
    return true
  }

  function followPointer(ptr, bots, cb) {
    let val = nonces[ptr]
    if (val === undefined) {
      cb('message ' + ptr + ' not found.')
    } else if (val === 0) {
      cb(null)
    } else {
      let bot = val.id
      bots.add(bot)
      followPointers(0, val.prev.split(','), bots, cb)
    }
  }

  function followPointers(idx, ptrs, bots, cb) {
    if (idx >= ptrs.length) { return cb(null, bots) }
    let ptr = ptrs[idx]

    followPointer(ptr, bots, (err) => {
      if (err) cb(err)
      else followPointers(idx + 1, ptrs, bots, cb)
    })
  }

  function next(idx, cb) {
    if (idx >= inbox.length) { return cb(null, state) }
    let msg = inbox[idx]
    console.log(idx, msg)
    let text = msg.value.content.text

    if (/^!rollcall\b/.test(text)) {
      if (state === WAIT_ROLLCALL) {
        state = ACK_ROLLCALL
      }

      let parts = text.split(' ')
      if (parts.length != 2) return next(idx + 1, cb)
      let nonce = parts[1]
      nonces[nonce] = 0

      clearDb(() => {
        let doc = { id : nonce, key : 'head', links : [] }
        kv.batch([doc], (err) => {
          if (err) cb(err)
          else next(idx + 1, cb)
        })
      })
    } else if (/^!ok\b/.test(text)) {
      if (state === ACK_ROLLCALL && id === msg.key) {
        state = WAIT_JOB
      }

      let parts = text.split(' ')
      if (parts.length != 4) return next(idx + 1, cb)
      let nonce = parts[1]
      let prev = parts[2]
      let archive = parts[3]

      nonces[nonce] = { id : msg.key, prev }
      peers[msg.key] = archive

      let doc = { id : nonce, key : 'head', links : prev.split(',') }
      kv.batch([doc], (err) => {
        if (err) cb(err)
        else next(idx + 1, cb)
      })
    } else if (state === WAIT_JOB && /^!job\b/.test(text)) {
      let parts = text.split(' ')
      if (parts.length != 3) return next(idx + 1, cb)
      let prev = parts[1].split(',')
      let job = parts[2]

      followPointers(0, prev, new Set(), (err, bots) => {
        if (err) {
          state = WAIT_ROLLCALL
          console.error('unable to start job', job, 'because error:', err)
        } else if (bots.has(id) >= 0) {
          state = DO_JOB
          let archives = Array.from(bots).map((key) => peers[key])
          console.log('do job w/', bots, archives)
        } else {
          console.log('skip job w/', bots)
        }
        next(idx + 1, cb)
      })
    } else if (/^!done\b/.test(text)) {
      if (state === DO_JOB && id === msg.key) {
        state = WAIT_ROLLCALL
      }
      next(idx + 1, cb)
    } else {
      next(idx + 1, cb)
    }
  }

  return { next }
}

SwarmState(inboxB.key, inboxB.inbox)
  .next(0, (err, state) => {
    console.error('error', err)
    console.log(state)

    kv.get('head', (err, ids) => {
      console.error('error', err)
      console.log('head ->', ids)
    })
  })
