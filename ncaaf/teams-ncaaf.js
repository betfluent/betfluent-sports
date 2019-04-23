'use strict'

const fs = require('fs')
const request = require('request-promise').defaults({
  json: true
})
const admin = require('../firebase')
const db = admin.database()
// const division1Names = ['FBS', 'FCS'] // We've only retrieved these divisions (D1) for NCAAF

const ncaafTeamsUpdate = function(divisionName) {
  console.log('NCAAF Teams Update')

  const ncaafUrl = `https://api.sportradar.us/ncaafb-t1/teams/${divisionName}/hierarchy.json?api_key=${process.env.NCAAF_TRIAL_KEY}`

  fs.readFile('ncaaf/teamIds-ncaaf.json', 'utf8', (err, data) => {
    if (err) return console.log('---------- ERROR:', err)
    const teamIds = JSON.parse(data)

    request.get({ url: ncaafUrl })
      .then(body => body.conferences.reduce(
        (subdivisions, conference) => conference.subdivisions
          ? subdivisions.concat(conference.subdivisions)
          : subdivisions
        , []
      ))
      .then(subdivisions => subdivisions.reduce(
        (teams, subdivision) => subdivision.teams
          ? teams.concat(subdivision.teams)
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
            abbr: team.id
          }

          db.ref('ncaaf/teams')
            .orderByChild('sportRadarId')
            .equalTo(team.id)
            .once('value', (snapshot) => {
              let teamRef
              if (snapshot.exists() && snapshot.hasChildren()) {
                const dbTeam = Object.values(snapshot.val())[0]
                teamRef = db.ref('ncaaf/teams').child(dbTeam.id)
              } else teamRef = db.ref('ncaaf/teams').push()

              bettorTeam.id = teamRef.key
              teamIds[team.id] = bettorTeam.id
              if (++dbResultCount === teams.length) saveTeamIds(teamIds)

              teamRef
                .update(bettorTeam)
                .then(() => {
                  console.log('NCAAF TEAM UPDATED:', bettorTeam)
                })
            })
        })
      })
      .catch(err => console.log('---------- ERROR:', err))
  })
}

const saveTeamIds = teamIds => {
  fs.writeFile('ncaaf/teamIds-ncaaf.json', JSON.stringify(teamIds), 'utf8', err => {
    if (err) console.log(err)
  })
}

module.exports = ncaafTeamsUpdate
