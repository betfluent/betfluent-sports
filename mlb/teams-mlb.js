'use strict'

const admin = require('../firebase')
const db = admin.database()
const teamIds = require('./teamIds-mlb')
const request = require('request').defaults({
  json: true
})

const mlbUrl = `https://api.sportradar.us/mlb/trial/v6.5/en/league/hierarchy.json?api_key=${process.env.MLB_TRIAL_KEY}`

const mlbTeamsUpdate = function(date) {
  console.log('MLB Team Update')

  request.get({
    url: mlbUrl
  }, function(err, response, body) {
    if (err) {
      console.log('---------- ERROR:', err)
      return
    }

    for (const league of body.leagues) {
      for (const division of league.divisions) {
        for (const team of division.teams) {
          const bettorTeam = {
            id: teamIds[team.id],
            sportRadarId: team.id,
            market: team.market,
            name: team.name,
            abbr: team.abbr
          }

          db.ref('mlb/teams')
            .child(bettorTeam.id)
            .update(bettorTeam)
            .then(() => {
              console.log('\nMLB TEAM:', bettorTeam)
            })
        }
      }
    }
  })
}

module.exports = mlbTeamsUpdate
