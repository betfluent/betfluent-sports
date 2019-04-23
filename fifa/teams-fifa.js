'use strict'

const fs = require('fs')
const donBest = require('../apis/DonBestApi')
const { donBest: dbsEnum } = require('../enums')
const admin = require('../firebase')
const db = admin.database()
// const teamIds = require('./teamIds-fifa')

const fifaTeamsUpdate = function(date) {
  console.log('FIFA Teams Update')

  fs.readFile('fifa/teamIds-fifa.json', 'utf8', (err, data) => {
    if (err) return console.log('---------- ERROR:', err)
    const teamIds = JSON.parse(data)

    donBest.getTeams()
      .catch(err => console.log(err.message))
      .then(response => response.don_best_sports.sport)
      // flatten to an array of leagues
      .then(sports => sports.reduce(
        (allLeagues, sport) => allLeagues.concat(sport.league), []
      ))
      // filter for soccer
      .then(leagues => leagues.find(
        league => league && league.$.id === dbsEnum.league.SOCCER
      ))
      // filter for World Cup teams
      .then(soccer => soccer.team.filter(
        team => team.information[0] === 'world cup'
      ))
      .then(teams => {
        let dbResultCount = 0
        teams.forEach(async team => {
          const bettorTeam = {
            donBestId: team.$.id,
            market: team.name[0],
            name: team.full_name[0],
            abbr: team.abbreviation[0]
          }

          db.ref('fifa/teams')
            .orderByChild('donBestId')
            .equalTo(team.$.id)
            .once('value', (snapshot) => {
              let teamRef
              if (snapshot.exists() && snapshot.hasChildren()) {
                const dbTeam = Object.values(snapshot.val())[0]
                teamRef = db.ref('fifa/teams').child(dbTeam.id)
              } else teamRef = db.ref('fifa/teams').push()

              bettorTeam.id = teamRef.key
              teamIds[team.$.id] = bettorTeam.id
              if (++dbResultCount === teams.length) saveTeamIds(teamIds)

              teamRef
                .update(bettorTeam)
                .then(() => {
                  console.log('FIFA TEAM UPDATED:', bettorTeam)
                })
            })
        })
      })
  })
}

const saveTeamIds = teamIds => {
  fs.writeFile('fifa/teamIds-fifa.json', JSON.stringify(teamIds), 'utf8', err => {
    if (err) console.log(err)
  })
}

module.exports = fifaTeamsUpdate
