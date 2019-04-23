'use strict'

const firebase = require('../firebase')
const db = firebase.database()

const getGameByTimeAndTeams = async (league, timeMillis, teamNamesArr) => {
  const snapshot = await db
    .ref(league.toLowerCase())
    .child('games')
    .orderByChild('scheduledTimeUnix')
    .startAt(timeMillis - 60 * 60 * 1000)
    .endAt(timeMillis + 3 * 60 * 60 * 1000)
    .once('value')

  if (snapshot.exists() && snapshot.hasChildren()) {
    const games = Object.values(snapshot.val())
    return games.find(({ description }) => {
      const descriptionArr = description.toLowerCase().split(' at ')
      return teamNamesArr.reduce((bool, teamName) => {
        return bool && descriptionArr.includes(teamName.toLowerCase())
      }, true)
    })
  }
  return null
}

const getTeamNameWithSportRadarId = async (league, sportRadarId) => {
  const snapshot = await db
    .ref(league.toLowerCase())
    .child('teams')
    .child(sportRadarId)
    .once('value')
  const team = snapshot.val()
  return `${team.market} ${team.name}`
}

const updateCurrentGameLine = (league, gameId, updates) => {
  if (typeof league !== 'string' || league.trim().length === 0) {
    return Promise.reject(new Error('league must be a non-blank string'))
  }
  if (typeof gameId !== 'string' || gameId.trim().length === 0) {
    return Promise.reject(new Error('gameId must be a non-blank string'))
  }
  if (!updates) {
    return Promise.reject(new Error('updates must be a non-empty object'))
  }
  return firebase.database()
    .ref('lines')
    .child(league.toLowerCase())
    .child(gameId)
    .update(updates)
    .then(() => {
      console.log(`----- LINES for ${league} ${gameId} UPDATED SUCCESSFULLY`)
    })
}

const setFakeBettingLines = (game) => {
  const returning = -110
  const gameLines = {}
  const sportsbookLines = {}
  gameLines['station'] = sportsbookLines

  const awayRot = game.awayTeamAlias.split('').map(c => c.charCodeAt(0)).join('')
  const homeRot = game.homeTeamAlias.split('').map(c => c.charCodeAt(0)).join('')

  const baseLine = {
    updatedTimeMillis: firebase.database.ServerValue.TIMESTAMP,
    gameId: game.id,
    gameLeague: game.league,
    returning
  }

  const awayLine = Object.assign({
    selection: game.awayTeamName,
    selectionId: game.awayTeamId
  }, { type: 'MONEYLINE' }, baseLine)

  const homeLine = Object.assign({
    selection: game.homeTeamName,
    selectionId: game.homeTeamId
  }, { type: 'MONEYLINE' }, baseLine)

  sportsbookLines[`${awayRot}-MONEYLINE`] = awayLine
  sportsbookLines[`${homeRot}-MONEYLINE`] = homeLine

  const awaySpread = Object.assign({
    points: 4.5,
    selection: game.awayTeamName,
    selectionId: game.awayTeamId
  }, { type: 'SPREAD' }, baseLine)

  const homeSpread = Object.assign({
    points: -4.5,
    selection: game.homeTeamName,
    selectionId: game.homeTeamId
  }, { type: 'SPREAD' }, baseLine)

  sportsbookLines[`${awayRot}-SPREAD`] = awaySpread
  sportsbookLines[`${homeRot}-SPREAD`] = homeSpread

  const overLine = Object.assign({
    overUnder: 'OVER',
    type: 'OVER_UNDER',
    points: 200
  }, baseLine)

  const underLine = Object.assign({
    overUnder: 'UNDER',
    type: 'OVER_UNDER',
    points: 200
  }, baseLine)

  sportsbookLines[`${awayRot}-${homeRot}-OVER`] = overLine
  sportsbookLines[`${awayRot}-${homeRot}-UNDER`] = underLine

  return updateCurrentGameLine(
    game.league.toLowerCase(),
    game.id,
    gameLines
  )
}

module.exports = {
  getGameByTimeAndTeams,
  getTeamNameWithSportRadarId,
  setFakeBettingLines,
  updateCurrentGameLine
}
