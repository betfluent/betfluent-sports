'use strict'

const admin = require('../firebase')
const db = admin.database()
const teamIds = require('./teamIds-nba')
const request = require('request').defaults({
  json: true
})
const eventUpdatedMap = {}
const simulationTimes = {}

function updateNbaPlayByPlay(bettorGame) {
  if (bettorGame.league === 'NBA' && bettorGame.scheduledTimeUnix < Date.now()) {
    const gameEnv = bettorGame.broadcastNetwork === 'BettorHalf'
      ? 'simulation'
      : 'production'

    if (
      gameEnv === 'simulation' &&
      simulationTimes[bettorGame.id] !== bettorGame.scheduledTimeUnix
    ) {
      simulationTimes[bettorGame.id] = bettorGame.scheduledTimeUnix
      deleteGamePlayByPlays(bettorGame.id)
    }

    const nbaPlayByPlayUrl = `https://api.sportradar.us/nba/${gameEnv}/v4/` +
      `en/games/${bettorGame.sportRadarId}/pbp.json?api_key=${process.env.NBA_KEY}`

    request.get({
      url: nbaPlayByPlayUrl
    }, function (err, response, body) {
      if (err) {
        console.log('---------- ERROR:', err)
        return
      }

      let eventSequence = 0
      let forceUpdate = false

      const game = body
      let homeTeamScore = 0
      let awayTeamScore = 0

      if (game.coverage === 'full' && game.periods) {
        game.periods
          .sort((period1, period2) => period1.sequence - period2.sequence)
          .forEach(period => {
            period.events
              .filter(event => event.event_type !== 'lineupchange')
              .sort((event1, event2) => {
                const clock1 = parseEventClock(event1)
                const clock2 = parseEventClock(event2)
                if (clock1 && clock2 && clock1 !== clock2) {
                  return clock2 - clock1
                }
                return event1.number - event2.number
              })
              .forEach(event => {
                const updatedTimeUnix = new Date(event.updated).getTime()
                let scoringPlay = false

                if (event.statistics) {
                  event.statistics.forEach(stat => {
                    if (stat.points) {
                      scoringPlay = true

                      if (event.attribution.id === game.home.id) {
                        homeTeamScore += stat.points
                      } else if (event.attribution.id === game.away.id) {
                        awayTeamScore += stat.points
                      }
                    }
                  })
                }

                if (eventUpdatedMap[event.id] < updatedTimeUnix) {
                  forceUpdate = true
                }

                if (!eventUpdatedMap[event.id] || forceUpdate) {
                  eventUpdatedMap[event.id] = updatedTimeUnix

                  const pbp = {
                    gameId: bettorGame.id,
                    clock: event.clock,
                    period: period.sequence,
                    sequence: eventSequence,
                    type: event.event_type,
                    description: event.description,
                    homeTeamScore,
                    awayTeamScore
                  }

                  if (event.attribution) {
                    pbp.teamId = teamIds[event.attribution.id]
                  }

                  if (scoringPlay) {
                    pbp.scoringPlay = true
                  }

                  createEvent(pbp, event.id)
                }
                eventSequence++
              })
          })

        if (game.deleted_events) {
          game.deleted_events.forEach(event => {
            if (eventUpdatedMap[event.id]) {
              delete eventUpdatedMap[event.id]
              deleteEvent(event.id)
            }
          })
        }
      }

      if (game.status === 'closed') {
        game.periods.forEach(period => {
          period.events.forEach(event => {
            delete eventUpdatedMap[event.id]
          })
        })
      }
    })
  }
}

function createEvent(pbp, eventId) {
  db.ref('nba/pbp')
    .child(eventId)
    .set(pbp)
    .then(() => {
      console.log('PBP:', pbp.gameId, pbp.description)
    })
}

function deleteEvent(eventId) {
  db.ref('nba/pbp')
    .child(eventId)
    .remove()
    .then(() => {
      console.log('PBP DELETED:', eventId)
    })
}

function parseEventClock(event) {
  return event.clock ? parseInt(event.clock.replace(':', '')) : NaN
}

function deleteGamePlayByPlays(gameId) {
  db.ref('nba/pbp')
    .orderByChild('gameId')
    .equalTo(gameId)
    .once('value', snapshot => {
      if (snapshot.exists() && snapshot.hasChildren()) {
        Object.keys(snapshot.val()).forEach(eventId => {
          deleteEvent(eventId)
          delete eventUpdatedMap[eventId]
        })
      }
    })
}

module.exports = updateNbaPlayByPlay
