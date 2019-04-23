'use strict'

const request = require('request-promise').defaults({
  json: true
})
const teamIds = require('./teamIds-ncaaf')
const { getTeamNameWithSportRadarId } = require('../services/DbService')
const betManager = require('../betManager')
const dbService = require('../services/DbService')
const admin = require('../firebase')
const db = admin.database()

const ncaafUrl = `http://api.sportradar.us/ncaafb-sim-t1/2015/REG/1/schedule.json?api_key=${process.env.NCAAF_TRIAL_KEY}`

const ncaafSimulationSchedule = () => {
  console.log('\n---------- NCAAF Daily Simulation:', new Date())

  request.get({ url: ncaafUrl })
    .then(async body => {
      for (let id in body.games) {
        const game = body.games[id]

        // Sets gameTime to 4:00 PM
        const gameTime = new Date().setHours(16, 0, 0, 0)

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
            status: game.status,
            broadcastNetwork: 'BettorHalf'
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
                .set(bettorGame)
                .then(() => {
                  console.log(bettorGame.description, `(${game.status})`)
                })

              dbService.setFakeBettingLines(bettorGame)
            })
        }
      }
    })
    .catch(err => console.log('---------- ERROR:', err))
}

module.exports = ncaafSimulationSchedule
