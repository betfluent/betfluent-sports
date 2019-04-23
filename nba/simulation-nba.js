'use strict'

const request = require('request').defaults({
  json: true
})
const teamIds = require('./teamIds-nba')
const betManager = require('../betManager')
const dbService = require('../services/DbService')
const admin = require('../firebase')
const db = admin.database()

const nbaUrl = 'http://api.sportradar.us/nba/simulation/v4/en/games/2017/SIM/schedule.json?api_key=' + process.env.NBA_KEY

const nbaSimulationSchedule = () => {
  console.log('\n---------- NBA Daily Simulation:', new Date())
  request.get({
    url: nbaUrl
  }, function (err, response, body) {
    if (err) {
      console.log('---------- ERROR:', err)
      return
    }

    for (const game of body.games) {
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
        status: game.status,
        broadcastNetwork: 'BettorHalf'
      }

      if (game.status === 'complete' || game.status === 'closed') {
        bettorGame.awayTeamScore = game.away_points
        bettorGame.homeTeamScore = game.home_points
      }

      db.ref('nba/games')
        .orderByChild('sportRadarId')
        .equalTo(game.id)
        .once('value', function (data) {
          let gameRef = db.ref('nba/games')
          if (data.exists()) {
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
            .set(bettorGame)
            .then(() => {
              console.log(bettorGame.description, `(${game.status})`)
            })

          dbService.setFakeBettingLines(bettorGame)
        })
    }
  })
}

module.exports = nbaSimulationSchedule
