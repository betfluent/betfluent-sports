'use strict'

const request = require('request-promise').defaults({
  json: true
})
const teamIds = require('./teamIds-nfl')
const betManager = require('../betManager')
const admin = require('../firebase')
const db = admin.database()

const nflWeeklyUpdate = async function (date) {
  console.log('\n---------- NFL Weekly Update:', date)

  const month = date.getUTCMonth() + 1
  let year = date.getUTCFullYear()
  if (month < 3) year -= 1
  const week = await getSeasonWeek(date)

  if (!week) return

  let nflUrl = `https://api.sportradar.us/nfl-ot2/games/${year}/REG/${week}/schedule.json?api_key=${process.env.NFL_TRIAL_KEY}`

  request.get({ url: nflUrl })
    .then(async body => {
      for (const game of body.week.games) {
        // Converts timestamps into unix time
        const gameTime = new Date(game.scheduled).getTime()

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
          .once('value', function (data) {
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
              .update(bettorGame)
              .then(() => {
                console.log(bettorGame.description, `(${game.status})`)
              })
          })
      }
    })
    .catch(err => console.log('---------- ERROR:', err))
}

const getSeasonWeek = async (date) => {
  const weekStartTimes = (await db
    .ref('nfl')
    .child('weekStartTimes')
    .once('value')).val()
  const weekTime = Object.entries(weekStartTimes).find(([week, startTime]) => {
    return date.getTime() >= startTime && date.getTime() < weekStartTimes[parseInt(week) + 1]
  })
  return weekTime ? weekTime[0] : null
}

module.exports = nflWeeklyUpdate
