'use strict'

const request = require('request-promise').defaults({
  json: true
})
const teamIds = require('./teamIds-ncaaf')
const { getTeamNameWithSportRadarId } = require('../services/DbService')
const betManager = require('../betManager')
const admin = require('../firebase')
const db = admin.database()

const ncaafWeeklyUpdate = async function (date) {
  console.log('\n---------- NCAAF Weekly Update:', date)

  const month = date.getUTCMonth() + 1
  let year = date.getUTCFullYear()
  if (month < 3) year -= 1
  const week = await getSeasonWeek(date)

  if (!week) return

  let ncaafUrl = `https://api.sportradar.us/ncaafb-t1/${year}/REG/${week}/schedule.json?api_key=${process.env.NCAAF_TRIAL_KEY}`

  request.get({ url: ncaafUrl })
    .then(async body => {
      for (let id in body.games) {
        const game = body.games[id]

        // Converts timestamps into unix time
        const gameTime = new Date(game.scheduled).getTime()

        const awayTeamId = teamIds[game.away]
        const homeTeamId = teamIds[game.home]

        if (awayTeamId && homeTeamId) {
          // This game has only D1 teams (since we only retrieved division FBS & FCS teams)

          const [awayTeamName, homeTeamName] = await Promise.all([
            getTeamNameWithSportRadarId('ncaaf', awayTeamId),
            getTeamNameWithSportRadarId('ncaaf', homeTeamId)
          ])

          const bettorGame = {
            awayTeamId,
            awayTeamAlias: game.away,
            awayTeamName,
            description: awayTeamName + ' at ' + homeTeamName,
            homeTeamId,
            homeTeamAlias: game.home,
            homeTeamName,
            league: 'NCAAF',
            scheduledTimeUnix: gameTime,
            sportRadarId: game.id,
            status: game.status
          }

          if (game.broadcast && game.broadcast.network) {
            bettorGame.broadcastNetwork = game.broadcast.network
          }

          if (game.status === 'complete' || game.status === 'closed') {
            bettorGame.awayTeamScore = game.away_points
            bettorGame.homeTeamScore = game.home_points
          }

          db.ref('ncaaf/games')
            .orderByChild('sportRadarId')
            .equalTo(game.id)
            .once('value', function (data) {
              let gameRef = db.ref('ncaaf/games')
              if (data.val()) {
                let gameList = data.val()
                for (let id in gameList) {
                  let dbGame = gameList[id]
                  gameRef = gameRef.child(dbGame.id)
                  bettorGame.id = dbGame.id
                }
              } else {
                gameRef = gameRef.push()
                bettorGame.id = gameRef.key
              }

              if (game.status === 'closed') {
                betManager.closeBetsForGame(bettorGame)
              }

              gameRef
                .update(bettorGame)
                .then(() => {
                  console.log(bettorGame.description, `(${game.status})`)
                })
            })
        }
      }
    })
    .catch(err => console.log('---------- ERROR:', err))
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

module.exports = ncaafWeeklyUpdate
