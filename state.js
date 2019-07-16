const umkv = require('unordered-materialized-kv')
let db = require('level')('./kv.db')
var kv = umkv(db)

let inbox = [
  { key : 'A', seq : 0, value : { content : { channel : 'bots', text : '!rollcall' }}},
  { key : 'Z', seq : 0, value : { content : { channel : 'bots', text : '!ok A:0 dat://Z' }}},
  { key : 'A', seq : 1, value : { content : { channel : 'bots', text : '!job Z:0 dat://abc666' }}},
  { key : 'A', seq : 2, value : { content : { channel : 'bots', text : '!rollcall' }}},
  { key : 'B', seq : 0, value : { content : { channel : 'bots', text : '!ok A:2 dat://B' }}},
  { key : 'C', seq : 0, value : { content : { channel : 'bots', text : '!ok A:2 dat://C' }}},
  { key : 'D', seq : 0, value : { content : { channel : 'bots', text : '!ok B:0,C:0 dat://D' }}},
  { key : 'E', seq : 0, value : { content : { channel : 'bots', text : '!ok B:0 dat://E' }}},
  { key : 'A', seq : 3, value : { content : { channel : 'bots', text : '!job E:0,D:0 dat://abc777' }}},
  { key : 'B', seq : 1, value : { content : { channel : 'bots', text : '!done A:3' }}},
]

let inboxA = { key : 'A', inbox }
let inboxB = { key : 'B', inbox : [inbox[1], inbox[2], inbox[3], inbox[4], inbox[5], inbox[6], inbox[7], inbox[8], inbox[9]] }
let inboxC = { key : 'C', inbox : [inbox[2], inbox[3], inbox[5], inbox[6], inbox[7], inbox[8]] }
let inboxD = { key : 'D', inbox }
let inboxE = { key : 'E', inbox : [inbox[0], inbox[1], inbox[2], inbox[3], inbox[4]] }

function swarmstate(id, inbox) {
  const WAIT_ROLLCALL = 0
  const ACK_ROLLCALL = 1
  const WAIT_JOB = 2
  const DO_JOB = 3

  let pointers = { }
  let archives = { }
  let state = WAIT_ROLLCALL

  function filter(msg) {
    if (!msg.value) return
    if (!msg.value.content) return
    if (msg.value.content.channel !== 'bots') return
    if (typeof msg.value.content.text !== 'string') return
    return true
  }

  function next(idx, cb) {
    if (idx >= inbox.length) { return cb(null, state) }

    let msg = inbox[idx]
    console.log(idx, msg)
    let text = msg.value.content.text
    if (/^!rollcall\b/.test(text)) {
      state = ACK_ROLLCALL
      let mid = msg.key + ':' + msg.seq
      pointers[mid] = 0

      let doc = { id : mid, key : 'head', links : [] }
      kv.batch([doc], (err) => {
        if (err) cb(err)
        else next(idx + 1, cb)
      })
    } else if (/^!ok\b/.test(text)) {
      if (id === msg.key) {
        state = WAIT_JOB
      }
      let mid = msg.key + ':' + msg.seq
      let parts = text.split(' ')
      if (parts.length != 3) return next(idx + 1, cb)

      pointers[mid] = parts[1]
      archives[msg.key] = parts[2]

      let doc = { id : mid, key : 'head', links : parts[1].split(',') }
      kv.batch([doc], (err) => {
        if (err) cb(err)
        else next(idx + 1, cb)
      })
    } else if (/^!job\b/.test(text)) {
      let parts = text.split(' ')
      if (parts.length != 3) return next(idx + 1, cb)
      let ptrs = parts[1].split(',')

      followPtrs(0, ptrs, [], (err, bots) => {
        if (err) {
          console.error('skipping job', parts[2], 'because error', err)
        } else if (bots.indexOf(id) >= 0) {
          state = DO_JOB
          console.log('do job w/', bots)
        } else {
          console.log('skip job w/', bots)
        }
        next(idx + 1, cb)
      })
    } else if (/^!done\b/.test(text)) {
      if (id === msg.key) {
        state = WAIT_ROLLCALL
      }
    } else {
      next(idx + 1, cb)
    }
  }

  function followPtr(ptr, bots, cb) {
    let val = pointers[ptr]
    if (val === undefined) {
      cb(new Error('message ' + ptr + ' not found.'))
    } else if (val === 0) {
      cb(null)
    } else {
      followPtrs(0, val.split(','), bots, cb)
    }
  }

  function followPtrs(idx, ptrs, bots, cb) {
    if (idx >= ptrs.length) { return cb(null, bots) }
    let ptr = ptrs[idx]
    let bot = ptr.split(':')[0]
    bots.push(bot)

    followPtr(ptr, bots, (err) => {
      if (err) cb(err)
      else followPtrs(idx + 1, ptrs, bots, cb)
    })
  }

  return { next }
}

swarmstate(inboxC.key, inboxC.inbox)
  .next(0, (err, state) => {
    console.error('error', err)
    console.log(state)
  })
