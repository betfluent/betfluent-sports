'use strict'

const admin = require('../firebase')
const db = admin.database()
const schedule = require('node-schedule')
const seasonUpdate = require('./season-ncaamb')
const dailyUpdate = require('./daily-ncaamb')
const liveUpdate = require('./live-ncaamb')

// NCAAMB SEASON UPDATE
// 8:00AM OCT 1st Once a year
schedule.scheduleJob('0 8 1 10 *', function() {
  var date = new Date()
  seasonUpdate(date)
})

// NCAAMB DAILY UPDATE (YESTERDAY & TODAY)
// 11:55AM Everyday from Jan-March Nov-Dec
schedule.scheduleJob('55 11 * 1-4,11-12 *', function() {
  let date = new Date()
  for (let i = -1; i < 1; i++) {
    let gameDay = new Date(date)
    gameDay.setDate(date.getDate() + i)
    dailyUpdate(gameDay)
  }
})

const startLiveUpdates = function() {
  db.ref('ncaamb/live')
    .orderByValue()
    .equalTo(true)
    .on('child_added', function(snapshot, prevChildKey) {
      let ncaambGameId = snapshot.key
      liveUpdate(ncaambGameId)
    })
}

module.exports.start = startLiveUpdates
