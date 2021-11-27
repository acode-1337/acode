require('dotenv').config()

/**
 * Get environment variable
 *
 * @param {String} key variable key
 */
const get = key =>
    process.env[key]

module.exports = { get }
