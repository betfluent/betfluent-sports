'use strict'

const moment = require('moment')
const schedule = require('node-schedule')
const eachLimit = require('async/eachLimit')
const {
  getGameByTimeAndTeams,
  updateCurrentGameLine
} = require('./DbService')
const firebase = require('../firebase')
const donBest = require('../apis/DonBestApi')
const { donBest: dbsConstants } = require('../enums')
const { isEmpty, convertStatus } = require('../utils')
const dbsLeagues = dbsConstants.league
const dbsSportsbook = dbsConstants.sportsbook

const getCurrentGameLines = (dbsLeagueId, dbsEventId) => donBest
  .getLines(dbsLeagueId, dbsEventId)
  .then(response => response.don_best_sports)
  .then(dbs => dbs.event ? dbs.event[0] : ({ line: [] }))
  .then(({ line: lines }) => {
    return lines
      .filter(({ $: line }) => line.period === 'FG' && line.type === 'current')
  })

/**
 * Get a map of DonBest league Ids to an array of DonBest events
 * @returns {object} a Promise<{ [ leagueId: [event] ] }>
 */
const getUpcomingLeagueEvents = (dbsLeague) => donBest
  .getSchedule()
  .then(response => response.don_best_sports)
  .then(dbs => dbs.schedule ? dbs.schedule[0] : ({ sport: [] }))
  // flatten to an array of leagues
  .then(schedule => schedule.sport.reduce(
    (allLeagues, sport) => allLeagues.concat(sport.league), []
  ))
  // filter for leagueId(s) that we care about
  .then(leagues => leagues.filter(
    league => dbsLeague
      ? dbsLeague === league.$.id
      : Object.values(dbsLeagues).includes(league.$.id)
  ))
  // reduce to an object that flattens non-final team events and groups them by leagueId
  .then(leagues => leagues.reduce((leagueEvents, league) => {
    const events = league.group
      // do not include futures or in-game or props
      .filter(group =>
        !group.$.name.includes('FUTURES') &&
        !group.$.name.includes('IN-GAME') &&
        !group.$.name.includes('PROPS') &&
        (league.$.id === dbsLeagues.SOCCER ? group.$.name.includes('FIFA') : true)
      )
      .reduce((allEvents, group) =>
        !console.log(group.$.name) && allEvents.concat(group.event), []
      )
      .filter(({ event_type: type, event_state: state }) =>
        type[0] === 'team_event' && state[0] !== 'FINAL'
      )
    leagueEvents[league.$.id] = leagueEvents[league.$.id]
      ? leagueEvents[league.$.id].concat(events)
      : events
    return leagueEvents
  }, {}))

const setCurrentGameLines = (bettorGame, dbsEventId) => {
  if (!bettorGame.donBestId && !dbsEventId) {
    throw new Error('A Don Best EventId must be given to get lines.')
  }
  const dbsLeagueId = bettorGame.league !== 'FIFA'
    ? dbsLeagues[bettorGame.league]
    : dbsLeagues.SOCCER
  const baseLine = {
    updatedTimeMillis: firebase.database.ServerValue.TIMESTAMP,
    gameId: bettorGame.id,
    gameLeague: bettorGame.league
  }
  getCurrentGameLines(dbsLeagueId, bettorGame.donBestId || dbsEventId)
    .then(lines => {
      const gameLines = {}
      lines.forEach(({ $, money, ps, total }) => {
        const sportsbookName = dbsSportsbook.nameOf($.sportsbook)
        if ($.no_line === 'true') {
          return console.log(`Lines from ${sportsbookName} ` +
            `for gameId ${bettorGame.id} have been removed`)
        }
        const sportsbookLines = {}

        if (money) {
          const type = 'MONEYLINE'

          const awayLine = Object.assign({
            returning: parseInt(money[0].$.away_money),
            selection: bettorGame.awayTeamName,
            selectionId: bettorGame.awayTeamId
          }, { type }, baseLine)

          const homeLine = Object.assign({
            returning: parseInt(money[0].$.home_money),
            selection: bettorGame.homeTeamName,
            selectionId: bettorGame.homeTeamId
          }, { type }, baseLine)

          sportsbookLines[`${$.away_rot}-${type}`] = awayLine
          sportsbookLines[`${$.home_rot}-${type}`] = homeLine
        }
        if (ps) {
          const type = 'SPREAD'

          const awayPoints = parseFloat(ps[0].$.away_spread, 10)
          if (awayPoints !== 0) {
            const awaySpread = Object.assign({
              returning: parseInt(ps[0].$.away_price),
              points: awayPoints,
              selection: bettorGame.awayTeamName,
              selectionId: bettorGame.awayTeamId
            }, { type }, baseLine)

            sportsbookLines[`${$.away_rot}-${type}`] = awaySpread
          }

          const homePoints = parseFloat(ps[0].$.home_spread, 10)
          if (homePoints !== 0) {
            const homeSpread = Object.assign({
              returning: parseInt(ps[0].$.home_price),
              points: homePoints,
              selection: bettorGame.homeTeamName,
              selectionId: bettorGame.homeTeamId
            }, { type }, baseLine)

            sportsbookLines[`${$.home_rot}-${type}`] = homeSpread
          }
        }
        if (total) {
          const typeLine = {
            type: 'OVER_UNDER',
            points: parseFloat(total[0].$.total)
          }

          const overLine = Object.assign({
            returning: parseInt(total[0].$.over_price),
            overUnder: 'OVER'
          }, typeLine, baseLine)

          const underLine = Object.assign({
            returning: parseInt(total[0].$.under_price),
            overUnder: 'UNDER'
          }, typeLine, baseLine)

          sportsbookLines[`${$.away_rot}-${$.home_rot}-OVER`] = overLine
          sportsbookLines[`${$.away_rot}-${$.home_rot}-UNDER`] = underLine
        }
        if (sportsbookLines) {
          gameLines[sportsbookName.toLowerCase()] = sportsbookLines
        }
      })
      if (!isEmpty(gameLines)) {
        updateCurrentGameLine(bettorGame.league, bettorGame.id, gameLines)
      }
    })
}

const setDonBestTeamId = (league, dbsTeamId, bettorTeamId) => {
  if (typeof league !== 'string' || league.trim().length === 0) {
    return Promise.reject(new Error('league must be a non-blank string'))
  }
  if (typeof dbsTeamId !== 'string' || dbsTeamId.trim().length === 0) {
    return Promise.reject(new Error('dbsTeamId must be a non-blank string'))
  }
  if (typeof bettorTeamId !== 'string' || bettorTeamId.trim().length === 0) {
    return Promise.reject(new Error('bettorTeamId must be a non-blank string'))
  }

  return firebase.database()
    .ref(league === 'SOCCER' ? 'fifa' : league.toLowerCase())
    .child('teams')
    .child(bettorTeamId)
    .child('donBestId')
    .set(dbsTeamId)
}

const getBettorTeam = async (leagueName, dbsTeam) => {
  // check if team exists with donBestId first
  const dbIdSnapShot = await firebase.database()
    .ref(leagueName.toLowerCase())
    .child('teams')
    .orderByChild('donBestId')
    .equalTo(dbsTeam.$.id)
    .once('value')
  if (dbIdSnapShot.exists() && dbIdSnapShot.hasChildren()) {
    return Object.values(dbIdSnapShot.val())[0]
  }
  // professional team finding logic
  if ([
    dbsLeagues.nameOf(dbsLeagues.MLB),
    dbsLeagues.nameOf(dbsLeagues.NBA),
    dbsLeagues.nameOf(dbsLeagues.NFL)
  ].includes(leagueName)) {
    // try to find team based on market & name
    const snapshot = await firebase.database()
      .ref(leagueName.toLowerCase())
      .child('teams')
      .orderByChild('market')
      .startAt(dbsTeam.full_name[0].split(' ')[0])
      .endAt(dbsTeam.full_name[0])
      .once('value')
    if (snapshot.exists() && snapshot.hasChildren()) {
      return Object.values(snapshot.val())
        .find(btTeam => dbsTeam.full_name[0].includes(btTeam.name))
    }
  }
}

const setDonBestTeamIds = () => donBest.getTeams()
  .then(response => response.don_best_sports.sport)
  .then(sports => {
    sports.forEach(({ league: leagues }) => {
      if (!leagues) return

      const professionalLeagues = leagues.filter(({ $: league }) =>
        [dbsLeagues.MLB, dbsLeagues.NBA].includes(league.id))

      const collegeLeagues = leagues.filter(({ $: league }) =>
        [dbsLeagues.NCAAMB].includes(league.id))

      professionalLeagues.forEach(league => {
        const leagueName = dbsLeagues.nameOf(league.$.id)
        const teams = league.team
          .filter(team =>
            // filter duplicate teams & test teams in broad strokes
            (team.abbreviation[0].trim() &&
              !team.name[0].toLowerCase().includes('test') &&
              !team.full_name[0].toLowerCase().includes('test') &&
              team.full_name[0] !== team.full_name[0].toUpperCase()) ||
            // exceptions to the rules above
            ['NFC', 'AFC'].includes(team.full_name[0]))
          eachLimit(teams, 7, async (team) => {
            let bettorTeam = await getBettorTeam(leagueName, team)
            if (bettorTeam) {
              setDonBestTeamId(leagueName, team.$.id, bettorTeam.id)
            } else {
              const newTeamRef = firebase.database()
                .ref(leagueName === 'SOCCER' ? 'fifa' : leagueName.toLowerCase())
                .child('teams')
                .push()
              bettorTeam = {
                id: newTeamRef.key,
                donBestId: team.$.id,
                name: team.full_name[0].trim(),
                abbr: team.abbreviation[0].trim()
              }
              if (team.name[0].trim() !== team.full_name[0].trim()) {
                bettorTeam.market = team.name[0].trim()
              }
              newTeamRef.set(bettorTeam)
            }
          }, err => {
            if (err) {
              console.log(err)
              throw err
            }
          })
      })

      // collegeLeagues.forEach(async league => {
      //   const leagueName = dbsLeagues.nameOf(league.$.id)
      //   let teamCount = 0
      //   let nameCount = 0
      //   let abbrCount = 0
      //   let undefCount = 0

      //   const teamsSnapshot = await firebase.database()
      //     .ref(leagueName.toLowerCase())
      //     .child('teams')
      //     .once('value')
      //   const dbTeamsCount = Object.keys(teamsSnapshot.val()).length

      //   league.team
      //     .filter(team =>
      //       // filter duplicate teams & test teams in broad strokes
      //       ((team.abbreviation && team.abbreviation[0].trim()) &&
      //         (team.name && !team.name[0].toLowerCase().includes('test')) &&
      //         (team.full_name && !team.full_name[0].toLowerCase().includes('test')) &&
      //         (team.full_name && team.full_name[0] !== team.full_name[0].toUpperCase())) ||
      //       // exceptions to the rules above
      //       false)
      //     .forEach(async team => {
      //       teamCount += 1
      //       const nameSnap = await firebase.database()
      //         .ref(leagueName.toLowerCase())
      //         .child('teams')
      //         .orderByChild('market')
      //         .equalTo(team.full_name[0])
      //         .once('value')
      //       if (nameSnap.exists() && nameSnap.hasChildren()) {
      //         nameCount += 1
      //         const bettorTeam = Object.values(nameSnap.val())[0]
      //         console.log('\n', team)
      //         console.log(bettorTeam)
      //       } else {
      //         const abbrSnap = await firebase.database()
      //           .ref(leagueName.toLowerCase())
      //           .child('teams')
      //           .orderByChild('abbr')
      //           .equalTo(team.abbreviation[0])
      //           .once('value')
      //         if (abbrSnap.exists() && abbrSnap.hasChildren()) {
      //           abbrCount += 1
      //           const bettorTeam = Object.values(abbrSnap.val())[0]
      //           console.log('\n', team)
      //           console.log(bettorTeam)
      //         } else {
      //           undefCount += 1
      //           console.log('\n', team)
      //           console.log(undefined)
      //         }
      //       }
      //       console.log('DB', dbTeamsCount)
      //       console.log('TOTAL', teamCount)
      //       console.log('NAME', nameCount)
      //       console.log('ABBR', abbrCount)
      //       console.log('UNDEFINED', undefCount)
      //     })
      // })
    })
  })

const mapDbsEventToBettorGame = async (event, leagueName) => {
  const getTeam = async donBestTeamId => {
    const teamsPath = `${leagueName === 'SOCCER' ? 'fifa' : leagueName.toLowerCase()}/teams`
    const snapshot = await firebase.database()
      .ref(teamsPath)
      .orderByChild('donBestId')
      .equalTo(donBestTeamId)
      .once('value')
    if (snapshot.exists() && snapshot.hasChildren()) {
      return Object.values(snapshot.val())[0]
    } else {
      const dbsTeamResponse = await donBest.getTeam(donBestTeamId)
      const dbsTeam = dbsTeamResponse.don_best_sports.league[0].team[0]
      const newTeamRef = firebase.database().ref(teamsPath).push()
      const newBettorTeam = {
        abbr: dbsTeam.abbreviation[0].trim(),
        id: newTeamRef.key,
        // college market is same as name for donbest data; otherwise skip market if not college team
        market: ['ncaamb', 'ncaaf'].includes(leagueName.toLowerCase()) ? dbsTeam.full_name[0].trim() : null,
        name: dbsTeam.full_name[0].trim(),
        donBestId: dbsTeam.$.id
      }
      await newTeamRef.set(newBettorTeam)
      return newBettorTeam
    }
  }

  const gameTime = moment.utc(event.$.date, 'YYYY-MM-DDThh:mm:ssZ').toDate().getTime()
  // keep game.status in line with other sports
  event.status = convertStatus(event.event_state[0])

  const [awayTeamId, homeTeamId] = event.participant
    .filter(
      team => team.$.side === 'AWAY' || team.$.side === 'HOME'
    ).sort(
      team => team.$.side === 'AWAY' ? -1 : 1
    ).map(
      team => team.team[0].$.id
    )

  if (!awayTeamId || !homeTeamId) return

  const [awayTeam, homeTeam] = await Promise.all([
    getTeam(awayTeamId),
    getTeam(homeTeamId)
  ])

  if (!awayTeam || !homeTeam) return

  const [awayTeamName, homeTeamName] = event.$.name.split(' vs ')

  return {
    awayTeamId: awayTeam.id,
    awayTeamAlias: awayTeam.abbr,
    awayTeamName: homeTeamName ? awayTeamName : awayTeam.name,
    description: event.$.name,
    homeTeamId: homeTeam.id,
    homeTeamAlias: homeTeam.abbr,
    homeTeamName: homeTeamName || homeTeam.name,
    league: leagueName.toUpperCase(),
    scheduledTimeUnix: gameTime,
    donBestId: event.$.id,
    status: event.status
  }
}

const setUpcomingGamesAndLines = () => getUpcomingLeagueEvents()
  .then(leagueEvents => Object.keys(leagueEvents).forEach(leagueId => {
    eachLimit(leagueEvents[leagueId], 7, async (event) => {
      const leagueName = leagueId !== dbsLeagues.SOCCER
        ? dbsLeagues.nameOf(leagueId)
        : 'FIFA'

      const leagueGamesRef = firebase.database().ref(leagueName.toLowerCase()).child('games')

      const bettorGame = await mapDbsEventToBettorGame(event, leagueName)

      if (bettorGame) {
        let gameRef
        const snapshot = await leagueGamesRef
          .orderByChild('donBestId')
          .equalTo(event.$.id)
          .once('value')

        if (snapshot.exists() && snapshot.hasChildren()) {
          const dbGame = Object.values(snapshot.val())[0]
          bettorGame.id = dbGame.id
          gameRef = leagueGamesRef.child(dbGame.id)
        } else {
          gameRef = leagueGamesRef.push()
          bettorGame.id = gameRef.key
        }

        gameRef.update(bettorGame)
        setCurrentGameLines(bettorGame, event.$.id)
      }
    }, (err) => {
      if (err) {
        console.log(err)
        throw err
      }
    })
  }))

/** Update lines for upcoming games every 10 minutes */
const startPeriodicUpdates = () => {
  const {
    DONBEST_UPDATE_EVERY_X_MINUTES,
    DONBEST_UPDATE_EVERY_X_HOURS
  } = process.env
  const perXMinutes = parseInt(DONBEST_UPDATE_EVERY_X_MINUTES, 10)
  const perXHours = parseInt(DONBEST_UPDATE_EVERY_X_HOURS, 10)
  const minuteVar = perXMinutes > 0 ? `*/${perXMinutes}` : '0'
  const hourVar = perXHours > 0 ? `*/${perXHours}` : '*'

  schedule.scheduleJob(`${minuteVar} ${hourVar} * * *`, () => {
    console.log('----- UPDATING LINES FOR UPCOMING GAMES...', new Date())
    setUpcomingGamesAndLines()
  })
}

module.exports = {
  getUpcomingLeagueEvents,
  mapDbsEventToBettorGame,
  setCurrentGameLines,
  setDonBestTeamIds,
  setUpcomingGamesAndLines,
  startPeriodicUpdates
}
