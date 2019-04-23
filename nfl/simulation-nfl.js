'use strict'

const request = require('request-promise').defaults({
  json: true
})
const teamIds = require('./teamIds-nfl')
const betManager = require('../betManager')
const dbService = require('../services/DbService')
const admin = require('../firebase')
const db = admin.database()

const nflUrl = `https://api.sportradar.us/nfl-sim2/games/2017/PST/schedule.json?api_key=${process.env.NFL_TRIAL_KEY}`

const nflSimulationSchedule = () => {
  console.log('\n---------- NFL Daily Simulation:', new Date())

  request.get({ url: nflUrl })
    .then(body => body.weeks.reduce(
      (games, week) => week.games
        ? games.concat(week.games.map(
          game => {
            // based on the simulation schedule @ https://developer.sportradar.com/files/indexFootball.html#nfl-official-api-v2-simulations
            let scheduledTimeUnix
            switch (week.sequence) {
              case 1:
                scheduledTimeUnix = new Date().setHours(13, 0, 0, 0)
                break
              case 2:
                scheduledTimeUnix = new Date().setHours(14, 0, 0, 0)
                break
              case 3:
                scheduledTimeUnix = new Date().setHours(15, 0, 0, 0)
                break
              case 4:
                scheduledTimeUnix = new Date().setHours(16, 0, 0, 0)
                break
            }
            game.scheduledTimeUnix = scheduledTimeUnix
            return game
          }))
        : games
      , []
    ))
    .then(games => {
      games.forEach(async game => {
        const bettorGame = {
          awayTeamId: teamIds[game.away.id],
          awayTeamAlias: game.away.alias,
          awayTeamName: game.away.name,
          description: game.away.name + ' at ' + game.home.name,
          homeTeamId: teamIds[game.home.id],
          homeTeamAlias: game.home.alias,
          homeTeamName: game.home.name,
          league: 'NFL',
          scheduledTimeUnix: game.scheduledTimeUnix,
          sportRadarId: game.id,
          status: game.status,
          broadcastNetwork: 'BettorHalf'
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

            if (game.status === 'closed') {
              betManager.closeBetsForGame(bettorGame)
            }

            gameRef
              .set(bettorGame)
              .then(() => {
                console.log(bettorGame.description, `(${new Date(game.scheduledTimeUnix)})`)
              })

            dbService.setFakeBettingLines(bettorGame)
          })
      })
    })
    .catch(err => console.log('---------- ERROR:', err))
}

module.exports = nflSimulationSchedule
