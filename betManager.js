'use strict'

const admin = require('./firebase')
const db = admin.database()
const backend = require('./BackendService')

const closeBetsForGame = function (game) {
  db.ref('wagers')
    .orderByChild('gameId')
    .equalTo(game.id)
    .once('value', snapshot => {
      const bets = snapshot.val()
      for (const id in bets) {
        const bet = bets[id]
        if (bet.status === 'LIVE') {
          backend.closeBet(bet.id)
        }
      }
    })
}

module.exports = {
  closeBetsForGame: closeBetsForGame
}
