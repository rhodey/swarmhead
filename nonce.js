const level = require('level-mem')
const umkv = require('unordered-materialized-kv')
const BotState = require('./state.js').BotState
const states = require('./state.js').states

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

let inboxA = inbox
let inboxB = [inbox[1], inbox[2], inbox[3], inbox[4], inbox[5], inbox[6], inbox[7], inbox[8], inbox[9]]
let inboxC = [inbox[2], inbox[3], inbox[5], inbox[6], inbox[7], inbox[8]]
let inboxD = inbox
let inboxE = [inbox[0], inbox[1], inbox[2], inbox[3], inbox[4]]

let db = level()
let kv = umkv(db)
let state = BotState('B', db, kv)

next(0, inboxB, (err, state) => {
  console.error(err)
  console.log('done')
})

function next(idx, inbox, cb) {
  if (idx >= inbox.length) return cb(null)
  console.log(idx, inbox[idx])
  state.next(inbox[idx], (err, state) => {
    if (err) return cb(err)
    console.log(state)
    switch (state) {
      case states.ACK_ROLL:
        break;

      case states.DO_JOB:
        break;
    }
    next(idx + 1, inbox, cb)
  })
}

console.log(states)
