'use strict'

const request = require('request-promise').defaults({
  json: true
})
const teamIds = require('./teamIds-ncaaf')
const admin = require('../firebase')

const db = admin.database()
const eventUpdatedMap = {}
const simulationTimes = {}

async function updateNcaafPlayByPlay(bettorGame) {
  if (bettorGame.league === 'NCAAF' && bettorGame.scheduledTimeUnix < Date.now()) {
    const gameEnv = bettorGame.broadcastNetwork === 'BettorHalf'
      ? 'sim-t1'
      : 't1'

    if (
      gameEnv === 'sim-t1' &&
      simulationTimes[bettorGame.id] !== bettorGame.scheduledTimeUnix
    ) {
      simulationTimes[bettorGame.id] = bettorGame.scheduledTimeUnix
      deleteGamePlayByPlays(bettorGame.id)
    }

    const date = new Date(bettorGame.scheduledTimeUnix)
    const month = date.getUTCMonth() + 1
    const year = bettorGame.broadcastNetwork === 'BettorHalf'
      ? 2015
      : date.getUTCFullYear() - month < 3 ? 1 : 0

    const week = bettorGame.broadcastNetwork === 'BettorHalf'
      ? 1
      : await getSeasonWeek(date)

    const ncaafPlayByPlayUrl = `https://api.sportradar.us/ncaafb-${gameEnv}/${year}/REG/${week}/` +
      `${bettorGame.awayTeamAlias}/${bettorGame.homeTeamAlias}/pbp.json?api_key=${process.env.NCAAF_TRIAL_KEY}`

    request.get({ url: ncaafPlayByPlayUrl })
      .then(body => {
        let eventSequence = 0
        let forceUpdate = false

        const game = body
        let homeTeamScore = 0
        let awayTeamScore = 0

        const createEvent = (srEvent, quarter, srTeamId) => {
          const updatedTimeUnix = new Date(srEvent.updated).getTime()
          let scoringPlay = false

          if (srEvent.score) {
            scoringPlay = true

            if (srEvent.score.team === game.home_team.id) {
              homeTeamScore += srEvent.score.points
            } else if (srEvent.score.team === game.away_team.id) {
              awayTeamScore += srEvent.score.points
            }
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
              description: srEvent.summary,
              homeTeamScore,
              awayTeamScore
            }

            if (srTeamId) {
              pbp.teamId = teamIds[srTeamId]
            }

            if (scoringPlay) {
              pbp.scoringPlay = true
            }

            setEvent(pbp, srEvent.id)
          }
          eventSequence++
        }

        if (game.coverage === 'full' && game.quarters) {
          game.quarters
            .sort((q1, q2) => q1.number - q2.number)
            .forEach(quarter => {
              quarter.pbp
                .filter(event => event.event_type !== 'lineupchange')
                .sort(sortByClockAndSequence)
                .forEach(event => {
                  if (event.type === 'drive' && event.actions) {
                    event.actions
                      .sort(sortByClockAndSequence)
                      .forEach(action => {
                        createEvent(action, quarter.number, event.team)
                      })
                  } else {
                    createEvent(event, quarter.number)
                  }
                })
            })
        }

        if (game.status === 'closed' && game.quarters) {
          game.quarters.forEach(quarter => {
            quarter.pbp.forEach(event => {
              if (event.type === 'drive' && event.actions) {
                event.actions.forEach(action => {
                  delete eventUpdatedMap[action.id]
                })
              } else {
                delete eventUpdatedMap[event.id]
              }
            })
          })
        }
      })
      .catch(err => console.log('---------- ERROR:', err))
  }
}

function setEvent(pbp, eventId) {
  db.ref('ncaaf/pbp')
    .child(eventId)
    .set(pbp)
    .then(() => {
      console.log('PBP:', pbp.gameId, pbp.description)
    })
}

function deleteEvent(eventId) {
  db.ref('ncaaf/pbp')
    .child(eventId)
    .remove()
    .then(() => {
      console.log('PBP DELETED:', eventId)
    })
}

function deleteGamePlayByPlays(gameId) {
  db.ref('ncaaf/pbp')
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

function parseEventClock(event) {
  if (event.clock.charAt(0) === ':') {
    event.clock = '00' + event.clock
  }
  return event.clock ? parseInt(event.clock.replace(':', '')) : NaN
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

module.exports = updateNcaafPlayByPlay
