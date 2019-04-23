'use strict'

const admin = require('../firebase')
const db = admin.database()
const teamIds = require('./teamIds-mlb')
const request = require('request').defaults({
  json: true
})
const eventUpdatedMap = {}

function updateNbaPlayByPlay(bettorGame) {
  if (bettorGame.league === 'MLB' && bettorGame.scheduledTimeUnix < Date.now()) {
    const mlbPlayByPlayUrl = `https://api.sportradar.us/mlb/trial/v6.5/` +
      `en/games/${bettorGame.sportRadarId}/pbp.json?api_key=${process.env.MLB_TRIAL_KEY}`

    request.get({
      url: mlbPlayByPlayUrl
    }, function (err, response, body) {
      if (err) {
        console.log('---------- ERROR:', err)
        return
      }

      let eventSequence = 0
      let forceUpdate = false

      const game = body.game
      let homeTeamScore = 0
      let awayTeamScore = 0

      if (game.coverage === 'full' && game.innings) {
        game.innings
          .sort((inning1, inning2) => inning1.sequence - inning2.sequence)
          .forEach(inning => {
            inning.halfs
              .sort(({ half }) => half === 'T' ? -1 : 1)
              .forEach(({ half, events }) => {
                events.forEach(event => {
                  if (event.at_bat) {
                    let updatedTimeUnix
                    let scoringPlay = false

                    event.at_bat.events.forEach(atBatEvent => {
                      updatedTimeUnix = new Date(atBatEvent.updated_at).getTime()

                      if (atBatEvent.runners) {
                        atBatEvent.runners.forEach(runner => {
                          if (runner.out === false && runner.ending_base === 4) {
                            scoringPlay = true
                            if (half === 'T') awayTeamScore += 1
                            else homeTeamScore += 1
                          }
                        })
                      }
                    })

                    if (eventUpdatedMap[event.at_bat.id] < updatedTimeUnix) {
                      forceUpdate = true
                    }

                    if (!event.at_bat.description) return

                    if (!eventUpdatedMap[event.at_bat.id] || forceUpdate) {
                      eventUpdatedMap[event.at_bat.id] = updatedTimeUnix

                      const pbp = {
                        gameId: bettorGame.id,
                        period: inning.sequence,
                        sequence: eventSequence,
                        description: event.at_bat.description,
                        homeTeamScore,
                        awayTeamScore,
                        teamId: half === 'T'
                          ? teamIds[game.away_team]
                          : teamIds[game.home_team]
                      }

                      if (scoringPlay) {
                        pbp.scoringPlay = true
                      }

                      createEvent(pbp, event.at_bat.id)
                    }
                    eventSequence++
                  }
                })
              })
          })

        if (game.deleted_events) {
          game.deleted_events.forEach(event => {
            if (eventUpdatedMap[event.at_bat.id]) {
              delete eventUpdatedMap[event.at_bat.id]
              deleteEvent(event.at_bat.id)
            }
          })
        }
      }

      if (game.status === 'closed') {
        game.innings.forEach(inning => {
          inning.halfs.forEach(half => {
            half.events.forEach(event => {
              if (event.at_bat) delete eventUpdatedMap[event.at_bat.id]
            })
          })
        })
      }
    })
  }
}

function createEvent(pbp, eventId) {
  db.ref('mlb/pbp')
    .child(eventId)
    .set(pbp)
    .then(() => {
      console.log('PBP:', pbp.gameId, pbp.description)
    })
}

function deleteEvent(eventId) {
  db.ref('mlb/pbp')
    .child(eventId)
    .remove()
    .then(() => {
      console.log('PBP DELETED:', eventId)
    })
}

module.exports = updateNbaPlayByPlay
