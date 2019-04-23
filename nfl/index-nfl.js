'use strict'

const admin = require('../firebase')
const db = admin.database()
const schedule = require('node-schedule')
const seasonUpdate = require('./season-nfl')
const weeklyUpdate = require('./weekly-nfl')
const liveUpdate = require('./live-nfl')
// const teamsUpdate = require('./teams-nfl')
const simulation = require('./simulation-nfl')

if (process.env.SPORTS_ENV === 'debug') {
  // NFL DAILY SIMULATION
  // 11:15AM every day
  schedule.scheduleJob('15 11 * * *', function() {
    simulation()
  })
}

// NFL SEASON UPDATE
// 8:00AM July 29th Once a year
schedule.scheduleJob('0 8 29 7 *', function() {
  var date = new Date()
  seasonUpdate(date)
})

// NFL WEEKLY UPDATE (LAST WEEK, THIS WEEK, & NEXT WEEK)
// 11:00AM Every Wednesday in Jan and from Aug-Dec
schedule.scheduleJob('0 11 ? 1,8-12 3', function() {
  let date = new Date()
  for (let i = -1; i < 2; i++) {
    let gameDay = new Date(date)
    gameDay.setDate(date.getDate() + (i * 7))
    weeklyUpdate(gameDay)
  }
})

const startLiveUpdates = function() {
  db.ref('nfl/live')
    .orderByValue()
    .equalTo(true)
    .on('child_added', function(snapshot, prevChildKey) {
      let nflGameId = snapshot.key
      liveUpdate(nflGameId)
    })
}

module.exports.start = startLiveUpdates
