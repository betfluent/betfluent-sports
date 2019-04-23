'use strict'

const request = require('request-promise').defaults({
  json: true
})
const teamIds = require('./teamIds-nfl')
const admin = require('../firebase')

const db = admin.database()
const eventUpdatedMap = {}
const simulationTimes = {}

async function updateNflPlayByPlay(bettorGame) {
  if (bettorGame.league === 'NFL' && bettorGame.scheduledTimeUnix < Date.now()) {
    const gameEnv = bettorGame.broadcastNetwork === 'BettorHalf'
      ? 'sim2'
      : 'ot2'

    if (
      gameEnv === 'sim2' &&
      simulationTimes[bettorGame.id] !== bettorGame.scheduledTimeUnix
    ) {
      simulationTimes[bettorGame.id] = bettorGame.scheduledTimeUnix
      deleteGamePlayByPlays(bettorGame.id)
    }

    const nflPlayByPlayUrl = `https://api.sportradar.us/nfl-${gameEnv}/games/${bettorGame.sportRadarId}/pbp.json?api_key=${process.env.NFL_TRIAL_KEY}`

    request.get({ url: nflPlayByPlayUrl })
      .then(body => {
        let eventSequence = 0
        let forceUpdate = false

        const game = body
        let homeTeamScore = 0
        let awayTeamScore = 0

        const createEvent = (srEvent, quarter) => {
          const updatedTimeUnix = new Date(srEvent.wall_clock).getTime()
          let scoringPlay = false

          if (srEvent.score) {
            scoringPlay = true
            homeTeamScore = srEvent.score.home_points
            awayTeamScore = srEvent.score.away_points
          }

          if (eventUpdatedMap[srEvent.id] < updatedTimeUnix) {
            forceUpdate = true
          }

          if (!eventUpdatedMap[srEvent.id] || forceUpdate) {
            eventUpdatedMap[srEvent.id] = updatedTimeUnix

            const pbp = {
              gameId: bettorGame.id,
              clock: srEvent.clock,
              period: quarter,
              sequence: eventSequence,
              type: srEvent.event_type || srEvent.play_type,
              description: parseEventDescription(srEvent),
              homeTeamScore,
              awayTeamScore
            }

            if (srEvent.end_situation && srEvent.end_situation.possession) {
              pbp.teamId = teamIds[srEvent.end_situation.possession.id]
            }

            if (scoringPlay) {
              pbp.scoringPlay = true
            }

            setEvent(pbp, srEvent.id)
          }
          eventSequence++
        }

        if (game.periods) {
          game.periods
            .sort((q1, q2) => q1.sequence - q2.sequence)
            .forEach(quarter => {
              quarter.pbp
                .sort((p1, p2) => p1.sequence - p2.sequence)
                .forEach(play => {
                  if (play.type === 'drive' && play.events) {
                    play.events
                      .sort(sortByClockAndSequence)
                      .forEach(event => {
                        createEvent(event, quarter.sequence)
                      })
                  } else {
                    createEvent(play, quarter.sequence)
                  }
                })
            })
        }

        if (game.status === 'closed' && game.periods) {
          game.periods.forEach(quarter => {
            quarter.pbp.forEach(play => {
              if (play.type === 'drive' && play.events) {
                play.events.forEach(event => {
                  delete eventUpdatedMap[event.id]
                })
              } else {
                delete eventUpdatedMap[play.id]
              }
            })
          })
        }
      })
      .catch(err => console.log('---------- ERROR:', err))
  }
}

function setEvent(pbp, eventId) {
  db.ref('nfl/pbp')
    .child(eventId)
    .set(pbp)
    .then(() => {
      console.log('PBP:', pbp.gameId, pbp.description)
    })
}

function deleteEvent(eventId) {
  db.ref('nfl/pbp')
    .child(eventId)
    .remove()
    .then(() => {
      console.log('PBP DELETED:', eventId)
    })
}

function deleteGamePlayByPlays(gameId) {
  db.ref('nfl/pbp')
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

function parseEventClock(event) {
  if (event.clock.charAt(0) === ':') {
    event.clock = '00' + event.clock
  }
  return event.clock ? parseInt(event.clock.replace(':', '')) : NaN
}

function parseEventDescription(event) {
  const endIndex = event.alt_description.indexOf(') ') + 1
  return event.alt_description.substring(endIndex).trim()
}

const sortByClockAndSequence = (p1, p2) => {
  const clock1 = parseEventClock(p1)
  const clock2 = parseEventClock(p2)
  if (clock1 && clock2 && clock1 !== clock2) {
    return clock2 - clock1
  }
  if (p1.sequence && p2.sequence) {
    return p1.sequence - p2.sequence
  }
  if (p1.sequence && !p2.sequence) return -1
  if (!p1.sequence && p2.sequence) return 1
  return 0
}

module.exports = updateNflPlayByPlay
