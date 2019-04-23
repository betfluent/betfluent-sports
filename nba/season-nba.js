'use strict'

const admin = require('../firebase')
const db = admin.database()
const teamIds = require('./teamIds-nba')
const request = require('request').defaults({
  json: true
})

let nbaSeasonUpdate = function(date) {
  console.log('\n---------- Professional Basketball Season Update:', date)

  let month = date.getUTCMonth() + 1
  let year = date.getUTCFullYear()
  if (month < 8) year -= 1

  let nbaUrl = 'https://api.sportradar.us/nba/trial/v4/en/games/' + year + '/REG/schedule.json?api_key=' + process.env.NBA_TRIAL_KEY

  request.get({
    url: nbaUrl
  }, function(err, response, body) {
    if (err) {
      console.log('---------- ERROR:', err)
      return
    }

    for (let id in body.games) {
      let game = body.games[id]

      // Converts timestamps into unix time
      let gameTime = new Date(game.scheduled).getTime()

      let bettorGame = {
        awayTeamId: teamIds[game.away.id],
        awayTeamAlias: game.away.alias,
        awayTeamName: game.away.name,
        description: game.away.name + ' at ' + game.home.name,
        homeTeamId: teamIds[game.home.id],
        homeTeamAlias: game.home.alias,
        homeTeamName: game.home.name,
        league: 'NBA',
        scheduledTimeUnix: gameTime,
        sportRadarId: game.id,
        status: game.status
      }

      if (game.status === 'complete' || game.status === 'closed') {
        bettorGame.awayTeamScore = game.away_points
        bettorGame.homeTeamScore = game.home_points
      }

      db.ref('nba/games')
        .orderByChild('sportRadarId')
        .equalTo(game.id)
        .once('value', function(data) {
          let gameRef = db.ref('nba/games')
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
}

module.exports = nbaSeasonUpdate
