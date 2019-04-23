'use strict'

const fs = require('fs')
const admin = require('../firebase')
const db = admin.database()
const request = require('request').defaults({
  json: true
})

const ncaambUrl = 'https://api.sportradar.us/ncaamb/production/v4/en/league/hierarchy.json?api_key=' + process.env.NCAAMB_KEY

const ncaambTeamsUpdate = function (date) {
  console.log('College Basketball Team Update')

  request.get({
    url: ncaambUrl
  }, function (err, response, body) {
    if (err) {
      console.log('---------- ERROR:', err)
      return
    }

    fs.readFile('ncaamb/teamIds-ncaamb.json', 'utf8', (err, data) => {
      if (err) return console.log(err)
      const teamIds = JSON.parse(data)

      for (const division of body.divisions) {
        // switch (division.alias) {
        //   case 'D2': // exclude D2 division
        //   case 'D3': // exclude D3 division
        //   case 'CIS': // exclude Canadian division
        //     continue
        // }
        for (const conference of division.conferences) {
          for (const team of conference.teams) {
            const bettorTeam = {
              id: teamIds[team.id],
              sportRadarId: team.id,
              market: team.market,
              name: team.name,
              abbr: team.alias
            }

            if (typeof bettorTeam.id === 'undefined') {
              bettorTeam.id = db.ref('ncaamb/teams').push().key
            }

            teamIds[team.id] = bettorTeam.id

            db.ref('ncaamb/teams')
              .child(bettorTeam.id)
              .update(bettorTeam)
              .then(() => {
                console.log('-----------------------------------------FINALLY------------------------------------')
                console.log(bettorTeam)
              })
          }
        }
      }
      fs.writeFile('ncaamb/teamIds-ncaamb.json', JSON.stringify(teamIds), 'utf8', err => {
        if (err) console.log(err)
      })
    })
  })
}

module.exports = ncaambTeamsUpdate
