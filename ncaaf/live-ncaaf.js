'use strict'

const request = require('request-promise').defaults({
  json: true
})
const livePlayByPlay = require('./playbyplay-ncaaf')
const betManager = require('../betManager')
const admin = require('../firebase')
const db = admin.database()

const intervalUpdates = {}
const startedGames = []
const completedGames = []

const ncaafLiveUpdate = function (ncaafGameId) {
  if (typeof intervalUpdates[ncaafGameId] === 'undefined') {
    db.ref('ncaaf/games')
      .child(ncaafGameId)
      .once('value', function (snapshot) {
        const bettorGame = snapshot.val()

        prepopulateScoringArrays(bettorGame)
        updateNcaafGame(bettorGame)

        intervalUpdates[ncaafGameId] = setInterval(function () {
          fetchLiveGame(bettorGame)
          livePlayByPlay(bettorGame)
        }, 3000)
      })
  }
}

async function fetchLiveGame(bettorGame) {
  if (bettorGame.league === 'NCAAF' && bettorGame.scheduledTimeUnix < Date.now()) {
    bettorGame = Object.assign({}, bettorGame)

    const gameEnv = bettorGame.broadcastNetwork === 'BettorHalf'
      ? 'sim-t1'
      : 't1'

    const date = new Date(bettorGame.scheduledTimeUnix)
    const month = date.getUTCMonth() + 1
    const year = bettorGame.broadcastNetwork === 'BettorHalf'
      ? 2015
      : date.getUTCFullYear() - month < 3 ? 1 : 0

    const week = bettorGame.broadcastNetwork === 'BettorHalf'
      ? 1
      : await getSeasonWeek(date)

    const ncaafUrl = `https://api.sportradar.us/ncaafb-${gameEnv}/${year}/REG/${week}/` +
      `${bettorGame.awayTeamAlias}/${bettorGame.homeTeamAlias}/extended-boxscore.json?api_key=${process.env.NCAAF_TRIAL_KEY}`

    request.get({ url: ncaafUrl })
      .then(body => {
        const game = body

        bettorGame.awayTeamScore = game.away_team.points
        bettorGame.homeTeamScore = game.home_team.points
        bettorGame.status = game.status

        if (game.quarter) {
          bettorGame.period = game.quarter
        }

        if (game.away_team && game.away_team.scoring) {
          game.away_team.scoring.forEach(period => {
            let periodName
            if (period.quarter < 5) {
              periodName = `${period.quarter}`
            } else if (period.quarter === 5) {
              periodName = 'OT'
            } else {
              periodName = `${period.quarter - 4}OT`
            }
            const periodPoints = { period: periodName, points: period.points }
            bettorGame.awayScoring[period.quarter - 1] = periodPoints
          })
        }

        if (game.home_team && game.home_team.scoring) {
          game.home_team.scoring.forEach(period => {
            let periodName
            if (period.quarter < 5) {
              periodName = `${period.quarter}`
            } else if (period.quarter === 5) {
              periodName = 'OT'
            } else {
              periodName = `${period.quarter - 4}OT`
            }
            const periodPoints = { period: periodName, points: period.points }
            bettorGame.homeScoring[period.quarter - 1] = periodPoints
          })
        }

        if (game.possession) {
          bettorGame.situation = {
            possession: game.possession.team,
            ballLocation: game.possession.side,
            ballYardLine: game.possession.yard_line,
            down: game.possession.down || null,
            yfd: game.possession.yfd || null
          }
        }

        if (game.clock && game.clock.charAt(0) === ':') {
          game.clock = '00' + game.clock
        }

        if (game.status === 'inprogress') {
          bettorGame.clock = game.clock
        }

        if (game.quarter === 2 && game.clock === '00:00') {
          bettorGame.status = 'halftime'
          bettorGame.situation = null
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

        updateNcaafGame(bettorGame)

        if (bettorGame.status === 'closed') {
          startedGames.splice(startedGames.indexOf(bettorGame.id), 1)
          completedGames.splice(completedGames.indexOf(bettorGame.id), 1)
          closeNcaafGame(bettorGame)
        }
      })
      .catch(err => console.log('---------- ERROR:', err))
  }
}

const getSeasonWeek = async (date) => {
  const weekStartTimes = (await db
    .ref('ncaaf')
    .child('weekStartTimes')
    .once('value')).val()
  const weekTime = Object.entries(weekStartTimes).find(([week, startTime]) => {
    return date.getTime() >= startTime && date.getTime() < weekStartTimes[parseInt(week) + 1]
  })
  return weekTime ? weekTime[0] : null
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

function updateNcaafGame(bettorGame) {
  db.ref('ncaaf/games')
    .child(bettorGame.id)
    .update(bettorGame)
    .then(() => {
      console.log('LIVE:', bettorGame.description, `${bettorGame.awayTeamScore}:${bettorGame.homeTeamScore}`, `(${bettorGame.status})`)
    })
}

function closeNcaafGame(bettorGame) {
  clearInterval(intervalUpdates[bettorGame.id])
  delete intervalUpdates[bettorGame.id]
  db.ref('ncaaf/live')
    .child(bettorGame.id)
    .set(false)
    .then(() => {
      console.log('CLOSED:', bettorGame.description)
    })
}

module.exports = ncaafLiveUpdate
