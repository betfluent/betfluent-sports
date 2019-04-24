'use strict'

const donBest = Object.freeze({
  league: {
    MLB: '5',
    NBA: '3',
    // NCAAF: '2',
    // NCAAMB: '4',
    // NFL: '1',
    // NHL: '7',
    // SOCCER: '9',
    nameOf: function(leagueId) {
      switch (leagueId) {
        case this.MLB:
          return 'MLB'
        case this.NBA:
          return 'NBA'
        // case this.NCAAF:
        //   return 'NCAAF'
        // case this.NCAAMB:
        //   return 'NCAAMB'
        // case this.NFL:
        //   return 'NFL'
        // case this.NHL:
        //   return 'NHL'
        // case this.SOCCER:
        //   return 'SOCCER'
      }
    }
  },
  sportsbook: {
    CONSENSUS: '347',
    nameOf: function(sportsbookId) {
      switch (sportsbookId) {
        case this.CONSENSUS:
          return 'CONSENSUS'
      }
    }
  }
})

module.exports = {
  donBest
}
