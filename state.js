const states = {
  WAIT_ROLL: 0,
  ACK_ROLL : 1,
  WAIT_JOB : 2,
  DO_JOB : 3,
}

module.exports = {
  states, BotState
}

function BotState(id, db, kv) {
  let nonces = { }
  let peers = { }
  let state = states.WAIT_ROLL

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

  function next(msg, cb) {
    let text = msg.value.content.text

    if (/^!rollcall\b/.test(text)) {
      let parts = text.split(' ')
      if (parts.length != 2) return cb(null, state)
      if (state === states.WAIT_ROLL) {
        state = states.ACK_ROLL
      }

      let nonce = parts[1]
      nonces[nonce] = 0
      clearDb(() => {
        let doc = { id : nonce, key : 'head', links : [] }
        kv.batch([doc], (err) => {
          if (err) cb(err)
          else cb(null, state)
        })
      })
    } else if (/^!ok\b/.test(text)) {
      let parts = text.split(' ')
      if (parts.length != 4) return cb(null, state)
      if (state === states.ACK_ROLL && id === msg.key) {
        state = states.WAIT_JOB
      }

      let nonce = parts[1]
      let prev = parts[2]
      let archive = parts[3]

      nonces[nonce] = { id : msg.key, prev }
      peers[msg.key] = archive

      let doc = { id : nonce, key : 'head', links : prev.split(',') }
      kv.batch([doc], (err) => {
        if (err) cb(err)
        else cb(null, state)
      })
    } else if (state === states.WAIT_JOB && /^!job\b/.test(text)) {
      let parts = text.split(' ')
      if (parts.length != 3) cb(null, state)
      let prev = parts[1].split(',')
      let job = parts[2]

      followPointers(0, prev, new Set(), (err, bots) => {
        if (err) {
          state = states.WAIT_ROLL
          console.error('unable to start job', job, 'because error:', err)
        } else if (bots.has(id) >= 0) {
          state = states.DO_JOB
          let archives = Array.from(bots).map((key) => peers[key])
          console.log('do job w/', bots, archives)
        } else {
          console.log('skip job w/', bots)
        }
        cb(null, state)
      })
    } else if (/^!done\b/.test(text)) {
      if (state === states.DO_JOB && id === msg.key) {
        state = states.WAIT_ROLL
      }
      cb(null, state)
    } else {
      cb(null, state)
    }
  }

  return { next }
}
