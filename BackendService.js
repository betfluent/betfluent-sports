'use strict'

const firebase = require('./firebase')
const request = require('request').defaults({
  json: true
})

const BASE_URL = 'https://boston-02108.herokuapp.com/api/'
const GOOGLE_API = `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=${process.env.WEB_API_KEY}`

const closeBet = async (betId) => {
  const session = {
    id: firebase.database().ref().push().key,
    serviceType: 'BET_RESULT',
    request: betId
  }

  const token = await getIdToken()

  request.post({
    headers: { token },
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

const getIdToken = () => {
  return new Promise(res => {
    request.post({
      url: GOOGLE_API,
      body: {
        token: process.env.ADMIN_KEY,
        returnSecureToken: true
      }
    }, function (error, response, body) {
      if (error) {
        console.log('---------- ERROR:', error)
        return
      }
      res(body.idToken)
    })
  })
}

module.exports = {
  closeBet
}
