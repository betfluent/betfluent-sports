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
const admin = require('./firebase')
const firebase = require('./firebase-client')

const betManager = require('./betManager')

// fifaFile.start()
// mlbFile.start()
// nbaFile.start()
// ncaafFile.start()
// ncaambFile.start()
// nflFile.start()

donbest.start()

admin.auth().createCustomToken(process.env.ADMIN_KEY)
    .then(customToken => {
        firebase.auth().signInWithCustomToken(customToken)
            .then(async () => {
                const snap = await firebase.database().ref('mlb/games').orderByChild('status').equalTo('closed').once('value')
                const games = Object.keys(snap.val())
                games.forEach(gameId => {
                  betManager.closeBetsForGame(gameId)  
                })
            })
            .catch(error => console.log(error))
    })