
'use strict'

const moment = require('moment')
const teamIds = require('./teamIds-fifa')
const donBest = require('../apis/DonBestApi')
// const dbsService = require('../services/DonBestService')
const { donBest: dbsEnum } = require('../enums')
const { convertStatus } = require('../utils')
const admin = require('../firebase')
const db = admin.database()

const fifaScheduleUpdate = function() {
  console.log('\n---------- FIFA Schedule Update:', new Date())

  donBest
    .getSchedule()
    .catch(err => console.log(err.message))
    .then(response => response.don_best_sports)
    .then(dbs => dbs.schedule ? dbs.schedule[0] : ({ sport: [] }))
    // flatten to an array of leagues
    .then(schedule => schedule.sport.reduce(
      (allLeagues, sport) => allLeagues.concat(sport.league), []
    ))
    // filter for Soccer
    .then(leagues => leagues.filter(
      league => league.$.id === dbsEnum.league.SOCCER
    ))
    // filter for FIFA soccer (no IN-GAME LINES) and reduce to an array of team events
    .then(leagues => leagues.reduce((allEvents, league) => {
      const events = league.group
        .filter(group => group.$.name.includes('FIFA') && !group.$.name.includes('IN-GAME'))
        .reduce((groupEvents, group) => groupEvents.concat(group.event), [])
        .filter(({ event_type: type }) => type[0] === 'team_event')
      return allEvents.concat(events)
    }, []))
    .then(events => {
      events.forEach(async game => {
        // Converts timestamps into unix time
        const gameTime = moment.utc(game.$.date, 'YYYY-MM-DDThh:mm:ssZ').toDate().getTime()

        // keep game.status in line with other sports
        game.status = convertStatus(game.event_state[0])

        const [awayTeamId, homeTeamId] = game.participant
          .filter(
            team => team.$.side === 'AWAY' || team.$.side === 'HOME'
          ).sort(
            team => team.$.side === 'AWAY' ? -1 : 1
          ).map(
            team => teamIds[team.team[0].$.id]
          )

        if (!awayTeamId || !homeTeamId) return

        const [awayTeam, homeTeam] = await Promise.all([
          getTeam(awayTeamId),
          getTeam(homeTeamId)
        ])

        const bettorGame = {
          awayTeamId: awayTeam.id,
          awayTeamAlias: awayTeam.abbr,
          awayTeamName: awayTeam.name,
          description: game.$.name,
          homeTeamId: homeTeam.id,
          homeTeamAlias: homeTeam.abbr,
          homeTeamName: homeTeam.name,
          league: 'FIFA',
          scheduledTimeUnix: gameTime,
          donBestId: game.$.id,
          status: game.status
        }

        db.ref('fifa/games')
          .orderByChild('donBestId')
          .equalTo(game.$.id)
          .once('value', function(data) {
            let gameRef = db.ref('fifa/games')
            if (data.val()) {
              const gameList = data.val()
              for (const id in gameList) {
                const dbGame = gameList[id]
                gameRef = gameRef.child(dbGame.id)
                bettorGame.id = dbGame.id
              }
            } else {
              gameRef = gameRef.push()
              bettorGame.id = gameRef.key
            }

            gameRef
              .update(bettorGame)
              .then(() => {
                console.log(bettorGame.description, `(${game.$.date})`)
              })
          })

        // dbsService.setCurrentGameLines(bettorGame)
      })
    })
}

const getTeam = async bettorTeamId => {
  const snapshot = await db.ref('fifa/teams').child(bettorTeamId).once('value')
  return snapshot.val()
}

module.exports = fifaScheduleUpdate
