'use strict'

const request = require('request-promise').defaults({
  json: true
})
const teamIds = require('./teamIds-nfl')
const admin = require('../firebase')
const db = admin.database()

const nflSeasonUpdate = function(date) {
  console.log('\n---------- NFL Season Update:', date)

  const month = date.getUTCMonth() + 1
  let year = date.getUTCFullYear()
  if (month < 3) year -= 1

  const nflUrl = `https://api.sportradar.us/nfl-ot2/games/${year}/REG/schedule.json?api_key=${process.env.NFL_TRIAL_KEY}`

  request.get({ url: nflUrl })
    .then(body => {
      const weekStartTimes = {}
      body.weeks.filter(week => week.games.length > 0).forEach(week => {
        const firstGame = week.games.sort(
          (a, b) => new Date(a.scheduled).getTime() - new Date(b.scheduled).getTime()
        )[0]
        weekStartTimes[week.sequence] = new Date(firstGame.scheduled).setHours(0, 0, 0, 0)
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

        const bettorGame = {
          awayTeamId: teamIds[game.away.id],
          awayTeamAlias: game.away.alias,
          awayTeamName: game.away.name,
          description: game.away.name + ' at ' + game.home.name,
          homeTeamId: teamIds[game.home.id],
          homeTeamAlias: game.home.alias,
          homeTeamName: game.home.name,
          league: 'NFL',
          scheduledTimeUnix: gameTime,
          sportRadarId: game.id,
          status: game.status
        }

        if (game.broadcast && game.broadcast.network) {
          bettorGame.broadcastNetwork = game.broadcast.network
        }

        if (game.status === 'complete' || game.status === 'closed') {
          bettorGame.awayTeamScore = game.scoring.away_points
          bettorGame.homeTeamScore = game.scoring.home_points
        }

        db.ref('nfl/games')
          .orderByChild('sportRadarId')
          .equalTo(game.id)
          .once('value', function(data) {
            let gameRef = db.ref('nfl/games')
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
      })
    })
    .catch(err => console.log('---------- ERROR:', err))
}

const saveWeekStartTimes = (weekStartTimes) => {
  return db
    .ref('nfl')
    .child('weekStartTimes')
    .update(weekStartTimes)
}

module.exports = nflSeasonUpdate
