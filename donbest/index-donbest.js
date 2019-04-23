'use strict'

const liveUpdate = require('./live-donbest')
const dbsService = require('../services/DonBestService')
const { donBest: dbsEnum } = require('../enums')
const admin = require('../firebase')
const db = admin.database()

// DON BEST SPORTS SCHEDULE & LINES UPDATE
// every 3 hours on the 15th minute of the hour
dbsService.startPeriodicUpdates()
dbsService.setUpcomingGamesAndLines()

const startLiveUpdates = function() {
  Object.keys(dbsEnum.league)
    .filter(leagueName => typeof dbsEnum.league[leagueName] === 'string')
    .map(leagueName => leagueName === 'SOCCER' ? 'FIFA' : leagueName)
    .forEach(leagueName => {
      db.ref(`${leagueName.toLowerCase()}/live`)
        .orderByValue()
        .equalTo(true)
        .on('child_added', snapshot => {
          let gameId = snapshot.key
          liveUpdate(leagueName, gameId)
        })
    })
}

module.exports.start = startLiveUpdates
