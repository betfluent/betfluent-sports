'use strict'

const admin = require('../firebase')
const db = admin.database()
const teamIds = require('./teamIds-nba')
const request = require('request').defaults({
  json: true
})

const nbaUrl = 'https://api.sportradar.us/nba/production/v4/en/league/hierarchy.json?api_key=' + process.env.NBA_KEY

const nbaTeamsUpdate = function(date) {
  console.log('Professional Basketball Team Update')

  request.get({
    url: nbaUrl
  }, function(err, response, body) {
    if (err) {
      console.log('---------- ERROR:', err)
      return
    }

    for (const conference of body.conferences) {
      for (const division of conference.divisions) {
        for (const team of division.teams) {
          const bettorTeam = {
            id: teamIds[team.id],
            sportRadarId: team.id,
            market: team.market,
            name: team.name,
            abbr: team.alias
          }

          db.ref('nba/teams')
            .child(bettorTeam.id)
            .update(bettorTeam)
            .then(() => {
              console.log('\nNBA TEAM:', bettorTeam)
            })
        }
      }
    }
  })
}

// function updateTeamAvatarUrls() {
//   const storage = admin.storage()
//   const options = {
//     action: 'read',
//     expires: '03-17-2025'
//   }

//   db.ref('nba/teams')
//     .once('value', function(snapshot) {
//       const teams = snapshot.val()
//       for (const id in teams) {
//         const team = teams[id]
//         const teamRef = db.ref('nba/teams').child(team.id)
//         storage.bucket()
//           .file('nba/teams/' + team.id + '.png')
//           .getSignedUrl(options)
//           .then(results => {
//             const url = results[0]
//             team.avatarUrl = url
//             teamRef.update(team)
//               .then(() => {
//                 console.log(team)
//               })
//           })
//       }
//     })
// }

module.exports = nbaTeamsUpdate
