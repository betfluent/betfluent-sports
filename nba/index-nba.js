'use strict'

const admin = require('../firebase')
const db = admin.database()
const schedule = require('node-schedule')
const seasonUpdate = require('./season-nba')
const dailyUpdate = require('./daily-nba')
const liveUpdate = require('./live-nba')
const simulation = require('./simulation-nba')

if (process.env.SPORTS_ENV === 'debug') {
  // NBA DAILY SIMULATION
  // 9:30AM every day
  schedule.scheduleJob('30 9 * * *', function() {
    simulation()
  })
}

// NBA SEASON UPDATE
// 8:00AM Sept 1st Once a year
schedule.scheduleJob('0 8 1 9 *', function() {
  var date = new Date()
  seasonUpdate(date)
})

// NBA DAILY UPDATE (YESTERDAY & TODAY)
// 9:00AM Everyday from Jan-Feb Sept-Dec
schedule.scheduleJob('0 9 * 1-2,9-12 *', function() {
  let date = new Date()
  for (let i = -1; i < 1; i++) {
    let gameDay = new Date(date)
    gameDay.setDate(date.getDate() + i)
    dailyUpdate(gameDay)
  }
})

// NBA DAILY POSTSEASON UPDATE (7 days, from yesterday)
// 9:00AM Everyday from Mar-June
schedule.scheduleJob('0 9 * 3-6 *', function() {
  let date = new Date()
  for (let i = -1; i < 7; i++) {
    let gameDay = new Date(date)
    gameDay.setDate(date.getDate() + i)
    dailyUpdate(gameDay)
  }
})

const startLiveUpdates = function() {
  db.ref('nba/live')
    .orderByValue()
    .equalTo(true)
    .on('child_added', function(snapshot, prevChildKey) {
      let nbaGameId = snapshot.key
      liveUpdate(nbaGameId)
    })
}

module.exports.start = startLiveUpdates
