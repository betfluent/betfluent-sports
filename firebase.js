'use strict'

const admin = require('firebase-admin')
const config = require('./config.js')

const serviceAccount = process.env.BACKEND_ENV === 'debug'
  ? JSON.parse(process.env.FIREBASE_DEBUG_SERVICE_ACCT)
  : JSON.parse(process.env.FIREBASE_PRODUCTION_SERVICE_ACCT)

const databaseURL = process.env.BACKEND_ENV === 'debug'
  ? config.staging.databaseURL
  : config.prod.databaseURL

const storageBucket = process.env.BACKEND_ENV === 'debug'
  ? config.staging.storageBucket
  : config.prod.storageBucket

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL,
  storageBucket
})

module.exports = admin
