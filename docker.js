const env = require('./env')
const path = require('path')
const root = require('./root')
const network = require('./network')

/**
 * IPC cardano node argument
 * @return {String} production node-ipc || test-ipc
 */
const nodeIpc = () =>
    env.get('PRODUCTION') ?
        'node-ipc' :
        'test-ipc'


/**
 * volume path in docker
 * @return {String} production mainnet || testnet
 */
const volumeCloud = () =>
    network.state()

/**
 * volume path in local machine
 * @return {String} production mainnet || testnet
 */
const volumeLocal = () =>
    network.state()

/**
 * Docker run action
 * @return {String} command
 * @example `docker run --rm -v ${volumeLocal()}:/${volumeCloud()}:Z`
 */
const run = () =>
    `docker run --rm -v ${volumeLocal()}:/${volumeCloud()}:Z`

/**
 * Docker run centos
 * @return {String} command
 */
const centos = () =>
    `${run()} centos`

/**
 * Docker run cardano node
 * @return {String} command
 */
const node = () =>
    `${run()} -v ${nodeIpc()}:/opt/cardano/ipc nessusio/cardano-node`

module.exports = {
    node,
    centos,
    volumeCloud,
    volumeLocal
}