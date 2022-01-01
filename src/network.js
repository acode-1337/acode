const env = require('./env')

/**
 * Get machine state current network
 * @return {String} production mainnet || testnet
 */
const state = () =>
    env.get('PRODUCTION') ? 'mainnet' : 'testnet'

/**
 * Get cardano node current network
 * @return {String} production --mainnet || --testnet-magic
 */
const node = () =>
    env.get('PRODUCTION') ? '--mainnet' : '--testnet-magic 1097911063'


module.exports = {
    state,
    node
}