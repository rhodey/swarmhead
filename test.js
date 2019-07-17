module.exports = Swarmhead

const STATE = {
  LISTEN : 0,
  OK_DELAY : 1,
  JOB_WAIT : 2,
  WORKING : 3
}

function Swarmhead (opts) {
  let cabal = opts.cabal
  let drive = opts.drive
  let db = opts.db
  let state = STATE.LISTEN
  let nick = undefined
  let key = undefined

  function ready() {
    return new Promise((res, rej) => {
      drive.on('ready', () => {
        nick = drive.key.toString('hex').substr(0, 4)
        cabal.getLocalKey((err, k) => {
          if (err) return rej(err)
          console.error(nick + '@' + k)
          key = k
          res()
        })
      })
    })
  }

  function join() {
    return new Promise((res, rej) => {
      cabal.publishNick(nick, (err) => {
        if (err) rej(err)
        else {
          cabal.swarm((err, swarm) => {
            if (err) rej(err)
            else res(swarm)
          })
        }
      })
    })
  }

  function filter(msg) {
    if (!msg.value) return
    if (msg.value.type !== 'chat/text') return
    if (!msg.value.content) return
    if (msg.value.content.channel !== 'bots') return
    if (typeof msg.value.content.text !== 'string') return
    return true
  }

  function publish (text) {
    cabal.publish({
      type: 'chat/text',
      content: { channel: 'bots', text }
    })
  }

  function ok(cb) {
    db.get('lastmsg', (err, msg) => {
      if (err) return cb(err)
      publish('!OK ' + msg.key + ':' + msg.seq)
      state = STATE.JOB_WAIT
    })
  }

  function listen() {
    return new Promise((res, rej) => {
      cabal.messages.events.on('message', function (msg) {
        if (!filter(msg)) return
        db.put('lastmsg', msg).catch(rej)
        console.log(nick + '@' + key, msg)

        var txt = msg.value.content.text
        if (/^!uc\b/.test(txt)) {
          publish(txt.replace(/^!uc\s*/,'').toUpperCase())
        } else if (/^!rollcall\b/.test(txt)) {
          state = STATE.OK_DELAY
          setTimeout(ok.bind(null, rej), Math.floor(Math.random() * 2250))
        } else if (/^!job\b/.test(txt)) {
        }
      })
    })
  }

  function rollcall() {
    return publish('!rollcall')
  }

  function jobs() {

  }

  return { ready, join, listen, rollcall, jobs }

}

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
