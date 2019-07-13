let inbox = [
  { key : 'A', seq : 0, value : { content : { channel : 'bots', text : '!rollcall' }}},
  { key : 'Z', seq : 0, value : { content : { channel : 'bots', text : '!ok A:0 dat://zzz' }}},
  { key : 'A', seq : 1, value : { content : { channel : 'bots', text : '!job E:0,D:0 dat://abc666' }}},
  { key : 'A', seq : 0, value : { content : { channel : 'bots', text : '!rollcall' }}},
  { key : 'B', seq : 0, value : { content : { channel : 'bots', text : '!ok A:0 dat://bbb' }}},
  { key : 'C', seq : 0, value : { content : { channel : 'bots', text : '!ok A:0 dat://ccc' }}},
  { key : 'D', seq : 0, value : { content : { channel : 'bots', text : '!ok B:0,C:0 dat://ddd' }}},
  { key : 'E', seq : 0, value : { content : { channel : 'bots', text : '!ok B:0 dat://eee' }}},
  { key : 'A', seq : 1, value : { content : { channel : 'bots', text : '!job E:0,D:0 dat://abc777' }}},
]

let inboxA = { key : 'A', inbox }
let inboxB = { key : 'B', inbox : [inbox[1], inbox[2], inbox[3], inbox[4], inbox[5], inbox[6], inbox[7], inbox[8]] }
let inboxC = { key : 'C', inbox : [inbox[2], inbox[3], inbox[5], inbox[6], inbox[7], inbox[8]] }
let inboxD = { key : 'D', inbox }
let inboxE = { key : 'E', inbox : [inbox[0], inbox[1], inbox[2], inbox[3], inbox[4]] }

function swarmstate(id, inbox) {
  const WAIT_ROLLCALL = 0
  const ACK_ROLLCALL = 1
  const WAIT_JOB = 2
  let state = WAIT
  let lookup = { }

  function filter(msg) {
    if (!msg.value) return
    if (!msg.value.content) return
    if (msg.value.content.channel !== 'bots') return
    if (typeof msg.value.content.text !== 'string') return
    return true
  }

  function storeRef(msg) {
    let key = msg.key + ':' + msg.seq
    let val = msg.content.text.split(' ')

  }

  function next() {
    inbox.filter(filter).forEach((msg) => {
      let text = msg.content.text
      if (/^!rollcall\b/.test(text)) {
        state = ACK_ROLLCALL
      } else if (/^!ok\b/.test(text)) {
        let refs = text.split(' ')
        if (id === msg.key) {
          state = WAIT_JOB
        }
      } else if (/^!job\b/.test(text)) {

      }
    })
  }

  return { next }
}

swarmstate(inboxA).next()
