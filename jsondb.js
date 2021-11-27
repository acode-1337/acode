const path = require('path')
const root = require('./root')
const JSONdb = require('simple-json-db')

/**
 * Initialize new JSON db in root directory
 *
 * @param {String} filename filename without .json extension
 * @example jsondb.initialize('main')
 */
const initialize = filename =>
    new JSONdb(path.join(root.folder, `${filename}.json`))

module.exports = { initialize }