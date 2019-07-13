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
