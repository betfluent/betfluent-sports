'use strict'

const admin = require('../firebase')
const db = admin.database()
const schedule = require('node-schedule')
const seasonUpdate = require('./season-mlb')
const dailyUpdate = require('./daily-mlb')
const liveUpdate = require('./live-mlb')

// MLB SEASON UPDATE
// 3:00AM Mar 15th Once a year
schedule.scheduleJob('0 3 15 3 *', function() {
  var date = new Date()
  seasonUpdate(date)
})

// MLB DAILY UPDATE (YESTERDAY - NEXT WEEK)
// 8:55AM Everyday from March - November
schedule.scheduleJob('55 8 * 3-11 *', function() {
  let date = new Date()
  for (let i = -1; i < 7; i++) {
    let gameDay = new Date(date)
    gameDay.setDate(date.getDate() + i)
    dailyUpdate(gameDay)
  }
})

const startLiveUpdates = function() {
  db.ref('mlb/live')
    .orderByValue()
    .equalTo(true)
    .on('child_added', function(snapshot, prevChildKey) {
      const mlbGameId = snapshot.key
      liveUpdate(mlbGameId)
    })
}

module.exports.start = startLiveUpdates
