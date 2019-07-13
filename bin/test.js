const path       = require('path')
const minimist   = require('minimist')
const mkdirp     = require('mkdirp')
const level      = require('level')
const hyperdrive = require('hyperdrive')
const Cabal      = require('cabal-core')
const swarmhead  = require('../test.js')

function error (err) {
  console.error(err)
  process.exit(1)
}

var argv = minimist(process.argv.slice(2), {
  alias: { d : 'datadir', c : 'channel' },
  default: { datadir : '.datadir', channel : 'bots' },
  string: [ '_' ]
})

mkdirp.sync(argv.datadir)

let addr = argv._[0].replace(/^cabal:\/*/,'')
let db = level(path.join(argv.datadir, 'db'), { valueEncoding : 'json' })
let cabal = Cabal(path.join(argv.datadir, 'cabal'), addr, { db })
let drive = hyperdrive(path.join(argv.datadir, 'dat'))

let sh = swarmhead({ db, cabal, drive })
sh.ready()
  .then(sh.join)
  .then(sh.listen)
  .catch(error)
