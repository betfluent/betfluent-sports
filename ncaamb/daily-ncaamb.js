'use strict'

const betManager = require('../betManager')
const admin = require('../firebase')
const db = admin.database()
const teamIds = require('./teamIds-ncaamb')
const request = require('request').defaults({
  json: true
})

let ncaambDailyUpdate = function (date) {
  console.log('\n---------- College Basketball Daily Update:', date)

  let month = date.getUTCMonth() + 1
  let day = date.getUTCDate()
  let year = date.getUTCFullYear()

  let ncaambUrl = 'https://api.sportradar.us/ncaamb/trial/v4/en/games/' + year + '/' + month + '/' + day + '/schedule.json?api_key=' + process.env.NCAAMB_TRIAL_KEY

  request.get({
    url: ncaambUrl
  }, function (err, response, body) {
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
        league: 'NCAAMB',
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

      db.ref('ncaamb/games')
        .orderByChild('sportRadarId')
        .equalTo(game.id)
        .once('value', function (data) {
          let gameRef = db.ref('ncaamb/games')
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
  })
}

module.exports = ncaambDailyUpdate
