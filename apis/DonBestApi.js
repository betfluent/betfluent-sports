'use strict'

/**
 * http://xml.donbest.com/docs/donbest_api_doc_v2.pdf
 */

const { requiredParam } = require('../utils')
const { parseString } = require('xml2js')
const request = require('request-promise').defaults({
  'proxy': process.env.FIXIE_URL,
  qs: { token: process.env.DONBEST_API_TOKEN },
  transform: xmlBody => new Promise((resolve, reject) => {
    parseString(xmlBody, (err, result) => {
      if (err) return reject(err)
      resolve(result)
    })
  })
})

const BASE_URL = 'https://xml.donbest.com/'

const getLines = (
  league = requiredParam('league'),
  eventId
) => request.get({
  url: `${BASE_URL}v2/odds/${league}/` + (eventId ? `${eventId}/` : '')
}).catch(err => {
  console.log('ERROR ON GET LINES')
  console.log(err)
})

const getSchedule = () => request.get({
  url: `${BASE_URL}v2/schedule_lte/`
})

const getScore = (eventId) => request.get({
  url: `${BASE_URL}v2/score/` + (eventId ? `${eventId}/` : '')
})

const getTeams = () => request.get({
  url: `${BASE_URL}v2/team/`
})

const getTeam = (dbsTeamId) => request.get({
  url: `${BASE_URL}v2/team/${dbsTeamId}/`
}).catch(err => {
  console.log('ERROR ON GET TEAM')
  console.log(err)
})

module.exports = {
  getLines,
  getSchedule,
  getScore,
  getTeams,
  getTeam
}
