'use strict'

const admin = require('../firebase')
const betManager = require('../betManager')
const livePlayByPlay = require('./playbyplay-mlb')
const db = admin.database()
const request = require('request').defaults({
  json: true
})
const intervalUpdates = {}
const startedGames = []
const completedGames = []

const mlbLiveUpdate = function (mlbGameId) {
  if (typeof intervalUpdates[mlbGameId] === 'undefined') {
    db.ref('mlb/games')
      .child(mlbGameId)
      .once('value', function (snapshot) {
        const bettorGame = snapshot.val()

        prepopulateScoringArrays(bettorGame)
        updateMlbGame(bettorGame)

        intervalUpdates[mlbGameId] = setInterval(function () {
          fetchLiveGame(bettorGame)
          livePlayByPlay(bettorGame)
        }, 5000)
      })
  }
}

function fetchLiveGame(bettorGame) {
  if (bettorGame.league === 'MLB' && bettorGame.scheduledTimeUnix < Date.now()) {
    let mlbUrl = `https://api.sportradar.us/mlb/trial/v6.5/en/games/` +
      `${bettorGame.sportRadarId}/boxscore.json?api_key=${process.env.MLB_TRIAL_KEY}`

    request.get({
      url: mlbUrl
    }, function (err, response, body) {
      if (err) {
        console.log('---------- ERROR:', err)
        return
      }

      let game = body.game

      bettorGame.awayTeamScore = game.away.runs
      bettorGame.awayTeamHits = game.away.hits
      bettorGame.awayTeamErrors = game.away.errors

      bettorGame.homeTeamScore = game.home.runs
      bettorGame.homeTeamHits = game.home.hits
      bettorGame.homeTeamErrors = game.home.errors

      bettorGame.status = game.status
      bettorGame.bases = {
        first: false,
        second: false,
        third: false
      }

      if (game.away && game.away.scoring) {
        game.away.scoring.forEach(inning => {
          const inningName = `${inning.sequence}`
          const points = typeof inning.runs === 'number'
            ? inning.runs
            : -1
          const inningPoints = { period: inningName, points }
          bettorGame.awayScoring[inning.sequence - 1] = inningPoints
        })
      }

      if (game.home && game.home.scoring) {
        game.home.scoring.forEach(inning => {
          const inningName = `${inning.sequence}`
          const points = typeof inning.runs === 'number'
            ? inning.runs
            : -1
          const inningPoints = { period: inningName, points }
          bettorGame.homeScoring[inning.sequence - 1] = inningPoints
        })
      }

      if (game.outcome) {
        bettorGame.period = game.outcome.current_inning
        if (game.outcome.count) {
          const { balls, strikes, outs } = game.outcome.count
          bettorGame.count = { balls, strikes, outs }
        }
        if (game.outcome.pitcher) {
          const pitcher = game.outcome.pitcher
          bettorGame.pitcher = `${(pitcher.preferred_name || pitcher.first_name)} ${pitcher.last_name}`
        }
        if (game.outcome.runners) {
          game.outcome.runners.forEach(runner => {
            if (runner.out === false) {
              switch (runner.ending_base) {
                case 1:
                  bettorGame.bases.first = true
                  break
                case 2:
                  bettorGame.bases.second = true
                  break
                case 3:
                  bettorGame.bases.third = true
                  break
              }
            }
          })
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

      updateMlbGame(bettorGame)

      if (bettorGame.status === 'closed') {
        startedGames.splice(startedGames.indexOf(bettorGame.id), 1)
        completedGames.splice(completedGames.indexOf(bettorGame.id), 1)
        closeMlbGame(bettorGame)
      }
    })
  }
}

function prepopulateScoringArrays(bettorGame) {
  bettorGame.awayScoring = {}
  bettorGame.homeScoring = {}

  function futureInning(inning) {
    return { period: `${inning}`, points: -1 }
  }

  for (let i = 0; i < 9; i++) {
    const inning = futureInning(i + 1)
    bettorGame.awayScoring[i] = inning
    bettorGame.homeScoring[i] = inning
  }
}

function updateMlbGame(bettorGame) {
  db.ref('mlb/games')
    .child(bettorGame.id)
    .update(bettorGame)
    .then(() => {
      console.log('LIVE:', bettorGame.description, `${bettorGame.awayTeamScore}:${bettorGame.homeTeamScore}`, `(${bettorGame.status})`)
    })
}

function closeMlbGame(bettorGame) {
  clearInterval(intervalUpdates[bettorGame.id])
  delete intervalUpdates[bettorGame.id]
  db.ref('mlb/live')
    .child(bettorGame.id)
    .set(false)
    .then(() => {
      console.log('CLOSED:', bettorGame.description)
    })
}

module.exports = mlbLiveUpdate
