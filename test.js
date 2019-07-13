module.exports = Swarmhead

function Swarmhead (opts) {
  let cabal = opts.cabal
  let drive = opts.drive
  let db = opts.db
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

  function publish (msg) {
    cabal.publish({
      type: 'chat/text',
      content: {
        channel: 'bots',
        text: msg
      }
    })
  }

  function ok(cb) {
    db.get('lastmsg', (err, msg) => {
      if (err) return cb(err)
      publish('!OK ' + msg.key + ':' + msg.seq)
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
          setTimeout(ok.bind(null, rej), Math.floor(Math.random() * 2250))
        }
      })
    })
  }

  function rollcall() {
    cabal.publish({
      type: 'chat/text',
      content: {
        channel: 'bots',
        text: '!rollcall'
      }
    })
  }

  function jobs() {

  }

  return { ready, join, listen, rollcall, jobs }

}
