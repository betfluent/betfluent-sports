'use strict'

const firebase = require('firebase')

const config = {
  apiKey: "AIzaSyA3vie3Ie_GuZiBEf9DilFSLaaxtGLtACs",
  authDomain: "betfluent-prod.firebaseapp.com",
  databaseURL: "https://betfluent-prod.firebaseio.com",
  projectId: "betfluent-prod",
  storageBucket: "betfluent-prod.appspot.com",
  messagingSenderId: "1052075330350"
};

firebase.initializeApp(config);

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
    headers: { token: await getIdToken() },
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

const getIdToken = async () => {
  const sportsServiceUser = await firebase.auth().signInWithCustomToken(process.env.ADMIN_KEY)
  return sportsServiceUser.user && sportsServiceUser.user.ra
}

module.exports = {
  closeBet
}
