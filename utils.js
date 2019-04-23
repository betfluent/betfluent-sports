'use strict'

const util = require('util')

/**
 * Converts third party game status to BettorHalf game status
 * @param {string} status third party game status string
 * @returns {string} a status string used by BettorHalf sports
 */
function convertStatus(status) {
  switch (status) {
    case 'created':
    case 'not_started':
    case 'PENDING':
      return 'scheduled'
    case 'live':
      return 'inprogress'
    case 'HALF':
      return 'halftime'
    case 'ended':
    case 'FINAL':
      return 'closed'
    default:
      if (Number.isInteger(parseInt(status.replace(':', '')))) {
        // if status is a game clock
        return 'inprogress'
      }
      return status
  }
}

function isEmpty(obj) {
  for (const prop in obj) {
    if (obj.hasOwnProperty(prop)) return false
  }
  return true
}

const logFull = (any) => console.log(util.inspect(any, false, null))

const requiredParam = (param) => {
  const requiredParamError = new Error(
    `Required parameter, "${param}" is missing.`
  )
  // preserve original stack trace
  if (typeof Error.captureStackTrace === 'function') {
    Error.captureStackTrace(
      requiredParamError,
      requiredParam
    )
  }
  throw requiredParamError
}

module.exports = {
  convertStatus,
  isEmpty,
  logFull,
  requiredParam
}
