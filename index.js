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

const b64DecodeUnicode = str =>
  decodeURIComponent(
    Array.prototype.map
      .call(atob(str), c => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
      .join("")
  );

// fifaFile.start()
// mlbFile.start()
// nbaFile.start()
// ncaafFile.start()
// ncaambFile.start()
// nflFile.start()

donbest.start()

firebase.auth().onAuthStateChanged(async authUser => {
    const idToken = await authUser.getIdToken()
    const userToken = JSON.parse(b64DecodeUnicode(idToken.split(".")[1]));
    console.log(userToken)
})

admin.auth().createCustomToken(process.env.ADMIN_KEY)
    .then(customToken => {
        firebase.auth().signInWithCustomToken(customToken)
            .catch(error => console.log(error))
    })