'use strict'

const { convertStatus } = require('../utils')
const donBest = require('../apis/DonBestApi')
const betManager = require('../betManager')
const admin = require('../firebase')
const db = admin.database()

const intervalUpdates = {}
const startedGames = []
const completedGames = []

const periodsPerGamePerLeague = Object.freeze({
  FIFA: 2,
  NBA: 4,
  NCAAMB: 2,
  NFL: 4
})

const liveUpdate = function (leagueName, gameId) {
  if (typeof intervalUpdates[gameId] === 'undefined') {
    db.ref(`${leagueName.toLowerCase()}/games`)
      .child(gameId)
      .once('value', function (snapshot) {
        const bettorGame = snapshot.val()

        const { homeScoring, awayScoring } = bettorGame
        if (!homeScoring || !awayScoring) {
          prepopulateScoringArrays(leagueName, bettorGame)
          updateGame(leagueName, bettorGame)
        }

        intervalUpdates[gameId] = setInterval(function () {
          fetchLiveGame(leagueName, bettorGame)
        }, 10000)
      })
  }
}

function fetchLiveGame(leagueName, bettorGame) {
  if (bettorGame.scheduledTimeUnix < Date.now()) {
    donBest.getScore(bettorGame.donBestId)
      .catch(err => console.log(err.message))
      .then(response => response.don_best_sports.event[0])
      .then(game => {
        const current = game.current_score[0].$
        const periods = game.period_summary[0].period

        bettorGame.awayTeamScore = parseInt(current.away_score, 10) || null
        bettorGame.homeTeamScore = parseInt(current.home_score, 10) || null
        bettorGame.status = convertStatus(current.description)

        if (periods) {
          const periodsPerGame = periodsPerGamePerLeague[leagueName.toUpperCase()]

          periods.forEach((period, i) => {
            bettorGame.period = i + 1
            let periodName
            if (/\d/.test(period.$.name)) {
              // period name includes a number (e.g. 1st H)
              periodName = period.$.name.match(/\d+/)[0]
              bettorGame.period = parseInt(periodName, 10)
            } else if (period.type === 'penalties') {
              periodName = 'PK'
            } else if (bettorGame.period > periodsPerGame) {
              const overtimeCount = bettorGame.period - periodsPerGame
              periodName = overtimeCount === 1 ? 'OT' : `${overtimeCount}OT`
            } else {
              periodName = period.$.name
              console.log(`DONBEST ${leagueName} PERIOD NOT ACCOUNTED FOR: `, period)
            }
            const awayPoints = period.score.find(score => score.$.rot === game.$.away_rot).$.value
            const awayPeriodPoints = {
              period: periodName,
              points: parseInt(awayPoints, 10)
            }
            const homePoints = period.score.find(score => score.$.rot === game.$.home_rot).$.value
            const homePeriodPoints = {
              period: periodName,
              points: parseInt(homePoints, 10)
            }
            bettorGame.awayScoring[bettorGame.period - 1] = awayPeriodPoints
            bettorGame.homeScoring[bettorGame.period - 1] = homePeriodPoints
          })
        }

        if (Number.isInteger(parseInt(current.description.replace(':', '')))) {
          // current description is a game clock
          bettorGame.clock = current.description
          if (leagueName.toLowerCase() === 'fifa') {
            bettorGame.clock = current.description.replace(':00', "'")
          }
        }

        if (current.description === 'HALF') {
          bettorGame.clock = '00:00'
          if (leagueName.toLowerCase() === 'fifa') {
            bettorGame.clock = "45'"
          }
        }

        if (current.description === 'FINAL') {
          bettorGame.clock = '00:00'
          if (leagueName.toLowerCase() === 'fifa') {
            bettorGame.clock = "90'"
          }
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

        updateGame(leagueName, bettorGame)

        if (bettorGame.status === 'closed') {
          startedGames.splice(startedGames.indexOf(bettorGame.id), 1)
          completedGames.splice(completedGames.indexOf(bettorGame.id), 1)
          closeGame(leagueName, bettorGame)
        }
      })
  }
}

function prepopulateScoringArrays(leagueName, bettorGame) {
  bettorGame.awayScoring = {}
  bettorGame.homeScoring = {}

  function futurePeriod(period) {
    return { period: `${period}`, points: -1 }
  }

  for (let i = 0; i < periodsPerGamePerLeague[leagueName]; i++) {
    const period = futurePeriod(i + 1)
    bettorGame.awayScoring[i] = period
    bettorGame.homeScoring[i] = period
  }
}

function updateGame(leagueName, bettorGame) {
  db.ref(`${leagueName.toLowerCase()}/games`)
    .child(bettorGame.id)
    .update(bettorGame)
    .then(() => {
      console.log('LIVE:', bettorGame.description, `${bettorGame.awayTeamScore}:${bettorGame.homeTeamScore}`, `(${bettorGame.status})`)
    })
}

function closeGame(leagueName, bettorGame) {
  clearInterval(intervalUpdates[bettorGame.id])
  delete intervalUpdates[bettorGame.id]
  db.ref(`${leagueName.toLowerCase()}/live`)
    .child(bettorGame.id)
    .set(false)
    .then(() => {
      console.log('CLOSED:', bettorGame.description)
    })
}

module.exports = liveUpdate
