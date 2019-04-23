'use strict'

const admin = require('../firebase')
const db = admin.database()
const schedule = require('node-schedule')
const seasonUpdate = require('./season-ncaaf')
const weeklyUpdate = require('./weekly-ncaaf')
const liveUpdate = require('./live-ncaaf')
// const teamsUpdate = require('./teams-ncaaf')
const simulation = require('./simulation-ncaaf')

if (process.env.SPORTS_ENV === 'debug') {
  // NCAAF DAILY SIMULATION
  // 9:35AM every day
  schedule.scheduleJob('35 9 * * *', function() {
    simulation()
  })
}

// NCAAF SEASON UPDATE
// 8:00AM August 1st Once a year
schedule.scheduleJob('0 8 1 8 *', function() {
  var date = new Date()
  seasonUpdate(date)
})

// NCAAF WEEKLY UPDATE (LAST WEEK, THIS WEEK, & NEXT WEEK)
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
  db.ref('ncaaf/live')
    .orderByValue()
    .equalTo(true)
    .on('child_added', function(snapshot, prevChildKey) {
      let ncaafGameId = snapshot.key
      liveUpdate(ncaafGameId)
    })
}

module.exports.start = startLiveUpdates
