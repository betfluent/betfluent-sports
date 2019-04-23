'use strict'

const admin = require('../firebase')
const db = admin.database()
const teamIds = require('./teamIds-mlb')
const request = require('request').defaults({
  json: true
})

let mlbSeasonUpdate = function(date) {
  console.log('\n---------- MLB Season Update:', date)

  let year = date.getUTCFullYear()

  let mlbUrl = `http://api.sportradar.us/mlb/trial/v6.5/en/games/${year}/REG/schedule.json?api_key=${process.env.MLB_TRIAL_KEY}`

  request.get({
    url: mlbUrl
  }, function(err, response, body) {
    if (err) {
      console.log('---------- ERROR:', err)
      return
    }

    for (const game of body.games) {
      // Converts timestamps into unix time
      const gameTime = new Date(game.scheduled).getTime()
      const awayTeamName = getTeamName(game.away)
      const homeTeamName = getTeamName(game.home)

      const bettorGame = {
        awayTeamId: teamIds[game.away.id],
        awayTeamAlias: game.away.abbr,
        awayTeamName,
        description: awayTeamName + ' at ' + homeTeamName,
        homeTeamId: teamIds[game.home.id],
        homeTeamAlias: game.home.abbr,
        homeTeamName,
        league: 'MLB',
        scheduledTimeUnix: gameTime,
        sportRadarId: game.id,
        status: game.status
      }

      if (game.broadcast && game.broadcast.network) {
        bettorGame.broadcastNetwork = game.broadcast.network
      }

      db.ref('mlb/games')
        .orderByChild('sportRadarId')
        .equalTo(game.id)
        .once('value', function(data) {
          let gameRef = db.ref('mlb/games')
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
              return console.log(bettorGame.description, `(${game.scheduled})`)
            })
        })
    }
  })
}

const getTeamName = srTeam => {
  if (srTeam.market === srTeam.abbr) {
    return srTeam.name
  }
  return `${srTeam.market} ${srTeam.name}`
}

module.exports = mlbSeasonUpdate
