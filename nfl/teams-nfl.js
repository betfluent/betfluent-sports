'use strict'

const fs = require('fs')
const request = require('request-promise').defaults({
  json: true
})
const admin = require('../firebase')
const db = admin.database()

const nflTeamsUpdate = function() {
  console.log('NFL Teams Update')

  const nflUrl = `https://api.sportradar.us/nfl-ot2/league/hierarchy.json?api_key=${process.env.NFL_TRIAL_KEY}`

  fs.readFile('nfl/teamIds-nfl.json', 'utf8', (err, data) => {
    if (err) return console.log('---------- ERROR:', err)
    const teamIds = JSON.parse(data)

    request.get({ url: nflUrl })
      .then(body => body.conferences.reduce(
        (divisions, conference) => conference.divisions
          ? divisions.concat(conference.divisions)
          : divisions
        , []
      ))
      .then(divisions => divisions.reduce(
        (teams, division) => division.teams
          ? teams.concat(division.teams)
          : teams
        , []
      ))
      .then(teams => {
        let dbResultCount = 0

        teams.forEach(team => {
          const bettorTeam = {
            id: teamIds[team.id],
            sportRadarId: team.id,
            market: team.market,
            name: team.name,
            abbr: team.alias
          }

          db.ref('nfl/teams')
            .orderByChild('sportRadarId')
            .equalTo(team.id)
            .once('value', (snapshot) => {
              let teamRef
              if (snapshot.exists() && snapshot.hasChildren()) {
                const dbTeam = Object.values(snapshot.val())[0]
                teamRef = db.ref('nfl/teams').child(dbTeam.id)
              } else teamRef = db.ref('nfl/teams').push()

              bettorTeam.id = teamRef.key
              teamIds[team.id] = bettorTeam.id
              if (++dbResultCount === teams.length) saveTeamIds(teamIds)

              teamRef
                .update(bettorTeam)
                .then(() => {
                  console.log('NFL TEAM UPDATED:', bettorTeam)
                })
            })
        })
      })
      .catch(err => console.log('---------- ERROR:', err))
  })
}

const saveTeamIds = teamIds => {
  fs.writeFile('nfl/teamIds-nfl.json', JSON.stringify(teamIds), 'utf8', err => {
    if (err) console.log(err)
  })
}

module.exports = nflTeamsUpdate
