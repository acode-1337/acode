const env = require('./env')
const axios = require('axios')
const network = require('./network')

/**
 * Get wallet address of sender basded on utxo.txhash
 * @env BLOCKFROST_PROJECT_ID
 * @param {Object} utxo object from query utxo
 * @return {Object} utxo object with sender address
 */
const getSenderFromUtxo = utxo => axios({
    url: `https://cardano-${network.state()}.blockfrost.io/api/v0/txs/${utxo.txhash}/utxos`,
    method: 'GET',
    headers: {
        project_id: env.get('BLOCKFROST_PROJECT_ID')
    }
}).then(res => ({ ...utxo, sender: res.data.inputs[0].address }))

module.exports = {
    getSenderFromUtxo
}