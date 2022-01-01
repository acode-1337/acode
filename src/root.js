const appRoot = require('app-root-path')

/**
 * Get app root folder
 *
 */
const folder = () =>
    appRoot.path

module.exports = { folder }