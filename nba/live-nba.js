'use strict'

const admin = require('../firebase')
const betManager = require('../betManager')
const livePlayByPlay = require('./playbyplay-nba')
const db = admin.database()
const request = require('request').defaults({
  json: true
})
const intervalUpdates = {}
const startedGames = []
const completedGames = []

const nbaLiveUpdate = function (nbaGameId) {
  if (typeof intervalUpdates[nbaGameId] === 'undefined') {
    db.ref('nba/games')
      .child(nbaGameId)
      .once('value', function (snapshot) {
        const bettorGame = snapshot.val()

        prepopulateScoringArrays(bettorGame)
        updateNbaGame(bettorGame)

        intervalUpdates[nbaGameId] = setInterval(function () {
          fetchLiveGame(bettorGame)
          livePlayByPlay(bettorGame)
        }, 3000)
      })
  }
}

function fetchLiveGame(bettorGame) {
  if (bettorGame.league === 'NBA' && bettorGame.scheduledTimeUnix < Date.now()) {
    const gameEnv = bettorGame.broadcastNetwork === 'BettorHalf'
      ? 'simulation'
      : 'production'

    let nbaUrl = `https://api.sportradar.us/nba/${gameEnv}/v4/en/games/` +
      `${bettorGame.sportRadarId}/boxscore.json?api_key=${process.env.NBA_KEY}`

    request.get({
      url: nbaUrl
    }, function (err, response, body) {
      if (err) {
        console.log('---------- ERROR:', err)
        return
      }

      let game = body

      bettorGame.awayTeamScore = game.away.points
      bettorGame.homeTeamScore = game.home.points
      bettorGame.status = game.status

      if (game.quarter) {
        bettorGame.period = game.quarter
      }

      if (game.away && game.away.scoring) {
        game.away.scoring.forEach(period => {
          let periodName
          if (period.sequence < 5) {
            periodName = `${period.sequence}`
          } else if (period.sequence === 5) {
            periodName = 'OT'
          } else {
            periodName = `${period.sequence - 4}OT`
          }
          const periodPoints = { period: periodName, points: period.points }
          bettorGame.awayScoring[period.sequence - 1] = periodPoints
        })
      }

      if (game.home && game.home.scoring) {
        game.home.scoring.forEach(period => {
          let periodName
          if (period.sequence < 5) {
            periodName = `${period.sequence}`
          } else if (period.sequence === 5) {
            periodName = 'OT'
          } else {
            periodName = `${period.sequence - 4}OT`
          }
          const periodPoints = { period: periodName, points: period.points }
          bettorGame.homeScoring[period.sequence - 1] = periodPoints
        })
      }

      if (game.status === 'inprogress') {
        bettorGame.clock = game.clock
      }

      if (game.status === 'complete' || game.status === 'closed' || game.status === 'halftime') {
        bettorGame.clock = '00:00'
      }

      if (bettorGame.status === 'inprogress' && !startedGames.includes(bettorGame.id)) {
        startedGames.push(bettorGame.id)
        bettorGame.startTimeMillis = admin.database.ServerValue.TIMESTAMP
      }

      if (
        (bettorGame.status === 'complete' || bettorGame.status === 'closed') &&
        !completedGames.includes(bettorGame.id)
      ) {
        completedGames.push(bettorGame.id)
        betManager.closeBetsForGame(bettorGame)
        bettorGame.completedTimeMillis = admin.database.ServerValue.TIMESTAMP
      }

      updateNbaGame(bettorGame)

      if (bettorGame.status === 'closed') {
        startedGames.splice(startedGames.indexOf(bettorGame.id), 1)
        completedGames.splice(completedGames.indexOf(bettorGame.id), 1)
        closeNbaGame(bettorGame)
      }
    })
  }
}

function prepopulateScoringArrays(bettorGame) {
  bettorGame.awayScoring = {}
  bettorGame.homeScoring = {}

  function futurePeriod(period) {
    return { period: `${period}`, points: -1 }
  }

  for (let i = 0; i < 4; i++) {
    const period = futurePeriod(i + 1)
    bettorGame.awayScoring[i] = period
    bettorGame.homeScoring[i] = period
  }
}

function updateNbaGame(bettorGame) {
  db.ref('nba/games')
    .child(bettorGame.id)
    .update(bettorGame)
    .then(() => {
      console.log('LIVE:', bettorGame.description, `${bettorGame.awayTeamScore}:${bettorGame.homeTeamScore}`, `(${bettorGame.status})`)
    })
}

function closeNbaGame(bettorGame) {
  clearInterval(intervalUpdates[bettorGame.id])
  delete intervalUpdates[bettorGame.id]
  db.ref('nba/live')
    .child(bettorGame.id)
    .set(false)
    .then(() => {
      console.log('CLOSED:', bettorGame.description)
    })
}

module.exports = nbaLiveUpdate
