'use strict'

const { convertStatus } = require('../utils')
const donBest = require('../apis/DonBestApi')
const betManager = require('../betManager')
const admin = require('../firebase')
const db = admin.database()

const intervalUpdates = {}
const startedGames = []
const completedGames = []

const fifaLiveUpdate = function (fifaGameId) {
  if (typeof intervalUpdates[fifaGameId] === 'undefined') {
    db.ref('fifa/games')
      .child(fifaGameId)
      .once('value', function (snapshot) {
        const bettorGame = snapshot.val()

        prepopulateScoringArrays(bettorGame)
        updateFifaGame(bettorGame)

        intervalUpdates[fifaGameId] = setInterval(function () {
          fetchLiveGame(bettorGame)
        }, 10000)
      })
  }
}

function fetchLiveGame(bettorGame) {
  if (bettorGame.league === 'FIFA' && bettorGame.scheduledTimeUnix < Date.now()) {
    donBest.getScore(bettorGame.donBestId)
      .catch(err => console.log(err.message))
      .then(response => response.don_best_sports.event[0])
      .then(game => {
        const current = game.current_score[0].$
        const periods = game.period_summary[0].period

        bettorGame.awayTeamScore = current.away_score
        bettorGame.homeTeamScore = current.home_score
        bettorGame.status = convertStatus(current.description)

        if (periods) {
          periods.forEach(period => {
            let periodName
            if (/\d/.test(period.$.name)) {
              // period name includes a number (e.g. 1st H)
              periodName = period.$.name.match(/\d+/)[0]
              bettorGame.period = parseInt(periodName)
            } else if (period.type === 'penalties') {
              periodName = 'PK'
              bettorGame.period = 4
            } else {
              periodName = 'OT'
              bettorGame.period = 3
            }
            const awayPoints = period.score.find(score => score.$.rot === game.$.away_rot).$.value
            const awayPeriodPoints = {
              period: periodName,
              points: parseInt(awayPoints)
            }
            const homePoints = period.score.find(score => score.$.rot === game.$.home_rot).$.value
            const homePeriodPoints = {
              period: periodName,
              points: parseInt(homePoints)
            }
            bettorGame.awayScoring[bettorGame.period - 1] = awayPeriodPoints
            bettorGame.homeScoring[bettorGame.period - 1] = homePeriodPoints
          })
        }

        if (Number.isInteger(parseInt(current.description.replace(':', '')))) {
          // current description is a game clock
          bettorGame.clock = current.description.replace(':00', "'")
        }

        if (current.description === 'HALF') {
          bettorGame.clock = "45'"
        }

        if (current.description === 'FINAL') {
          bettorGame.clock = "90'"
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

        updateFifaGame(bettorGame)

        if (bettorGame.status === 'closed') {
          startedGames.splice(startedGames.indexOf(bettorGame.id), 1)
          completedGames.splice(completedGames.indexOf(bettorGame.id), 1)
          closeFifaGame(bettorGame)
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

  for (let i = 0; i < 2; i++) {
    const period = futurePeriod(i + 1)
    bettorGame.awayScoring[i] = period
    bettorGame.homeScoring[i] = period
  }
}

function updateFifaGame(bettorGame) {
  db.ref('fifa/games')
    .child(bettorGame.id)
    .update(bettorGame)
    .then(() => {
      console.log('LIVE:', bettorGame.description, `${bettorGame.awayTeamScore}:${bettorGame.homeTeamScore}`, `(${bettorGame.status})`)
    })
}

function closeFifaGame(bettorGame) {
  clearInterval(intervalUpdates[bettorGame.id])
  delete intervalUpdates[bettorGame.id]
  db.ref('fifa/live')
    .child(bettorGame.id)
    .set(false)
    .then(() => {
      console.log('CLOSED:', bettorGame.description)
    })
}

module.exports = fifaLiveUpdate
