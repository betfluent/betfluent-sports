/* jshint esversion: 6 */
'use strict'

require('dotenv').config()
const fifaFile = require('./fifa/index-fifa')
const mlbFile = require('./mlb/index-mlb')
const nbaFile = require('./nba/index-nba')
const ncaafFile = require('./ncaaf/index-ncaaf')
const ncaambFile = require('./ncaamb/index-ncaamb')
const nflFile = require('./nfl/index-nfl')

const donbest = require('./donbest/index-donbest')

// fifaFile.start()
// mlbFile.start()
// nbaFile.start()
// ncaafFile.start()
// ncaambFile.start()
// nflFile.start()

donbest.start()
