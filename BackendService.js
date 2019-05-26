'use strict'

const firebase = require('./firebase-client')

const request = require('request').defaults({
  json: true
})

const BASE_URL = 'https://boston-02108.herokuapp.com/api/'

const closeBet = async (betId) => {
  const session = {
    id: firebase.database().ref().push().key,
    serviceType: 'BET_RESULT',
    request: betId
  }

  request.post({
    headers: { token: await firebase.auth().currentUser.getIdToken(true) },
    url: BASE_URL + 'v1/manager/result',
    body: session
  }, function (error, response, body) {
    if (error) {
      console.log('---------- ERROR:', error)
      return
    }
    console.log('----- CLOSE BET:', body)
  })
}

module.exports = {
  closeBet
}