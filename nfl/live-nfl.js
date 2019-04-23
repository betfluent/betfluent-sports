'use strict'

const request = require('request-promise').defaults({
  json: true
})
const livePlayByPlay = require('./playbyplay-nfl')
const betManager = require('../betManager')
const admin = require('../firebase')
const db = admin.database()

const intervalUpdates = {}
const startedGames = []
const completedGames = []

const nflLiveUpdate = function (nflGameId) {
  if (typeof intervalUpdates[nflGameId] === 'undefined') {
    db.ref('nfl/games')
      .child(nflGameId)
      .once('value', function (snapshot) {
        const bettorGame = snapshot.val()

        prepopulateScoringArrays(bettorGame)
        updateNflGame(bettorGame)

        intervalUpdates[nflGameId] = setInterval(function () {
          fetchLiveGame(bettorGame)
          livePlayByPlay(bettorGame)
        }, 3000)
      })
  }
}

async function fetchLiveGame(bettorGame) {
  if (bettorGame.league === 'NFL' && bettorGame.scheduledTimeUnix < Date.now()) {
    bettorGame = Object.assign({}, bettorGame)

    const gameEnv = bettorGame.broadcastNetwork === 'BettorHalf'
      ? 'sim2'
      : 'ot2'

    const nflUrl = `https://api.sportradar.us/nfl-${gameEnv}/games/${bettorGame.sportRadarId}/boxscore.json?api_key=${process.env.NFL_TRIAL_KEY}`

    request.get({ url: nflUrl })
      .then(body => {
        const game = body

        bettorGame.awayTeamScore = game.summary.away.points
        bettorGame.homeTeamScore = game.summary.home.points
        bettorGame.status = game.status

        if (game.quarter) {
          bettorGame.period = game.quarter
        }

        if (game.scoring) {
          game.scoring.forEach(period => {
            let periodName
            if (period.sequence < 5) {
              periodName = `${period.sequence}`
            } else if (period.sequence === 5) {
              periodName = 'OT'
            } else {
              periodName = `${period.sequence - 4}OT`
            }
            const awayPeriodPoints = { period: periodName, points: period.away_points }
            const homePeriodPoints = { period: periodName, points: period.home_points }
            bettorGame.awayScoring[period.sequence - 1] = awayPeriodPoints
            bettorGame.homeScoring[period.sequence - 1] = homePeriodPoints
          })
        }

        if (game.situation) {
          bettorGame.situation = {
            possession: game.situation.possession.alias,
            ballLocation: game.situation.location.alias,
            ballYardLine: game.situation.location.yardline,
            down: game.situation.down || null,
            yfd: game.situation.yfd || null
          }
        }

        if (game.status === 'inprogress') {
          bettorGame.clock = game.clock
        }

        if (game.status === 'complete' || game.status === 'closed' || game.status === 'halftime') {
          bettorGame.clock = '00:00'
          bettorGame.situation = null
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

        updateNflGame(bettorGame)

        if (bettorGame.status === 'closed') {
          startedGames.splice(startedGames.indexOf(bettorGame.id), 1)
          completedGames.splice(completedGames.indexOf(bettorGame.id), 1)
          closeNflGame(bettorGame)
        }
      })
      .catch(err => console.log('---------- ERROR:', err))
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

function updateNflGame(bettorGame) {
  db.ref('nfl/games')
    .child(bettorGame.id)
    .update(bettorGame)
    .then(() => {
      console.log('LIVE:', bettorGame.description, `${bettorGame.awayTeamScore}:${bettorGame.homeTeamScore}`, `(${bettorGame.status})`)
    })
}

function closeNflGame(bettorGame) {
  clearInterval(intervalUpdates[bettorGame.id])
  delete intervalUpdates[bettorGame.id]
  db.ref('nfl/live')
    .child(bettorGame.id)
    .set(false)
    .then(() => {
      console.log('CLOSED:', bettorGame.description)
    })
}

module.exports = nflLiveUpdate
