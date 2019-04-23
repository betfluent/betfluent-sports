'use strict'

const request = require('request-promise').defaults({
  json: true
})
const teamIds = require('./teamIds-ncaaf')
const { getTeamNameWithSportRadarId } = require('../services/DbService')
const admin = require('../firebase')
const db = admin.database()

const ncaafSeasonUpdate = function(date) {
  console.log('\n---------- NCAAF Season Update:', date)

  const month = date.getUTCMonth() + 1
  let year = date.getUTCFullYear()
  if (month < 3) year -= 1

  const ncaafUrl = `https://api.sportradar.us/ncaafb-t1/${year}/REG/schedule.json?api_key=${process.env.NCAAF_TRIAL_KEY}`

  request.get({ url: ncaafUrl })
    .then(body => {
      const weekStartTimes = {}
      body.weeks.filter(week => week.games.length > 0).forEach(week => {
        const firstGame = week.games.sort(
          (a, b) => new Date(a.scheduled).getTime() - new Date(b.scheduled).getTime()
        )[0]
        weekStartTimes[week.number] = new Date(firstGame.scheduled).setHours(0, 0, 0, 0)
      })
      saveWeekStartTimes(weekStartTimes)
      return body.weeks
    })
    .then(weeks => weeks.reduce(
      (games, week) => week.games ? games.concat(week.games) : games, []
    ))
    .then(games => {
      games.forEach(async game => {
        // Converts timestamps into unix time
        let gameTime = new Date(game.scheduled).getTime()

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
            .once('value', function(data) {
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

              gameRef
                .update(bettorGame)
                .then(() => {
                  console.log(bettorGame.description, `(${game.scheduled})`)
                })
            })
        }
      })
    })
    .catch(err => console.log('---------- ERROR:', err))
}

const saveWeekStartTimes = (weekStartTimes) => {
  return db
    .ref('ncaaf')
    .child('weekStartTimes')
    .update(weekStartTimes)
}

module.exports = ncaafSeasonUpdate
