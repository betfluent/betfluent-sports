'use strict'

const schedule = require('node-schedule')
const scheduleUpdate = require('./schedule-fifa')
const liveUpdate = require('./live-fifa')
const admin = require('../firebase')
const db = admin.database()

// WORLD CUP UPDATE
// 8:00AM Everyday in June & July
schedule.scheduleJob('0 8 * 6,7 *', function() {
  scheduleUpdate()
})

const startLiveUpdates = function() {
  db.ref('fifa/live')
    .orderByValue()
    .equalTo(true)
    .on('child_added', function(snapshot, prevChildKey) {
      let fifaGameId = snapshot.key
      liveUpdate(fifaGameId)
    })
}

module.exports.start = startLiveUpdates
