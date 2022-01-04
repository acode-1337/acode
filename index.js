const _ = require('lodash')
const centos = require('./src/centos')
const jsondb = require('./src/jsondb')
const network = require('./src/network')
const cardano = require('./src/cardano')
const terminal = require('./src/terminal')
const blockfrost = require('./src/blockfrost')

const config = {
    PROJECT: 'default',
    PRICE_ADA: 2,
    POLICY_ID: '',
    MIN_SUPPLY: 0,
    MAX_SUPPLY: 0,
    DEV_ADDR: '',
    CREATOR_ADDR: ''
}

Object.keys(config)
    .forEach(key => {
        if (!config[key]) throw new Error(`CONFIG => ${key} cannot be null`)
    })


/**
 *
 *
 * @param {Object} wallet wallet metadata
 * @return {*}
 */
const vend = async wallet => {
    /** @type {Object} simple json db */
    const db = jsondb.initialize(network.state())

    /** @type {Number} profit collected in lovelace */
    let balanceProfit = 0

    /** @type {Number} token price in lovelace */
    const tokenPrice = cardano.toLovelace(config.PRICE_ADA)

    /** @type {Array} utxos by token policy id*/
    const assets = cardano.queryUtxoAssetByPolicyId(wallet.addr, config.POLICY_ID)

    /** @type {Object} utxo from last supply of token */
    const asset = _.orderBy(assets, ['lovelace']).reverse()[0]

    if (!asset) throw new Error('No tokens added')

    /** @type {Array} utxo draft transaction built for sender address, tx in and out*/
    const utxos = await Promise.all(cardano.queryUtxoJson(wallet.addr)
        // filters transactions received excluding already processed txix and hash
        .filter(utxo => !db.has(utxo.txcomb))
        // query blockfrost for sender address
        .flatMap(utxo => blockfrost.getSenderFromUtxo(utxo)))
        .then(utxos => utxos
            // filter utxos not containing token assets
            .filter(utxo => !assets.flatMap(aUtxo => aUtxo.txcomb).includes(utxo.txcomb))

            // add tx in
            .flatMap(utxo => ({ ...utxo, txin: cardano.argument('tx in', utxo.txcomb) }))

            // add txout
            .flatMap(utxo => {

                /** @type {Array} tx out container */
                const txouts = []

                // utxo ADA exactly 2 dust .5 is considered a profit
                // utxo ADA higher than 2 excess is considered a profit
                if (utxo.lovelace >= tokenPrice) {

                    /** @type {Number} random supply from min max in config */
                    const supplyMax = asset.supply >= config.MAX_SUPPLY ?
                        config.MAX_SUPPLY :
                        asset.supply

                    const supplyMin = asset.supply >= config.MIN_SUPPLY ?
                        config.MIN_SUPPLY :
                        Math.floor(asset.supply / 2)

                    if (!supplyMin) return;

                    const supplyRandom = _.random(supplyMin, supplyMax)

                    // add txout to container
                    txouts.push(cardano.argument(
                        'tx out',
                        `${utxo.sender}+${cardano.toLovelace(1.5)}+"${supplyRandom} ${asset.asset}"`
                    ))

                    /** @type {Number} excess ADA from utxo lovelace */
                    const excess = utxo.lovelace - cardano.toLovelace(1.5)

                    // add excess ada to profit if exists
                    if (excess) balanceProfit += excess

                    // deduct random supply to asset
                    asset.supply -= supplyRandom

                    // utxo ADA lower than 2 is considered as profit do nothing
                } else balanceProfit += utxo.lovelace

                // assign txouts container to utxo
                utxo.txouts = txouts

                return utxo
            })

        )

    // checks the profit balance if it's higher or equal to 2 ADA then continue otherwise loop
    if (balanceProfit < cardano.toLovelace(1.5)) return vend(wallet);


    /** @type {Object} transaction metadata */
    const T = cardano.transaction(centos.timestamp())

    /** @type {Number} tip slot */
    const slot = cardano.querySlot() + 10000

    const rawA = [
        'transaction build-raw',
        // tx ins from senders
        ...utxos.flatMap(i => i.txin),
        // tx in from asset
        cardano.argument('tx in', asset.txcomb),


        // tx outs to senders - random supply
        ...utxos.flatMap(i => i.txouts),
        // tx out to profit address - collected profit
        cardano.argument('tx out', `${config.CREATOR_ADDR}+${balanceProfit}`),
        // tx out to wallet address - left supply
        cardano.argument('tx out', `${wallet.addr}+${asset.lovelace}+"${asset.supply} ${asset.asset}"`),

        // other
        cardano.argument('invalid hereafter', slot),
        cardano.argument('fee', 0),
        cardano.argument('out file', T.rawFile)
    ]

    terminal.node(rawA)

    /** @type {Number} deduct fees */
    const fees = cardano.transactionFee(T.rawFile, 1, 2, 1)
    balanceProfit -= fees

    const draftA = [
        'transaction build-raw',
        // tx ins from senders
        ...utxos.flatMap(i => i.txin),
        // tx in from asset
        cardano.argument('tx in', asset.txcomb),


        // tx outs to senders - random supply
        ...utxos.flatMap(i => i.txouts),
        // tx out to profit address - collected profit
        cardano.argument('tx out', `${config.CREATOR_ADDR}+${balanceProfit}`),
        // tx out to wallet address - left supply
        cardano.argument('tx out', `${wallet.addr}+${asset.lovelace}+"${asset.supply} ${asset.asset}"`),

        // other
        cardano.argument('invalid hereafter', slot),
        cardano.argument('fee', fees),
        cardano.argument('out file', T.draftFile)
    ]

    terminal.node(draftA)

    const signedA = [
        'transaction sign',
        cardano.argument('signing-key-file', wallet.skeyFile),
        cardano.argument('tx-body-file', T.draftFile),
        cardano.argument('out file', T.signedFile),
        network.node()
    ]

    terminal.node(signedA)

    terminal.node([
        'transaction submit',
        cardano.argument('tx-file', T.signedFile),
        network.node()
    ])

    // System saves the txix and hash.
    utxos.forEach(utxo => db.set(utxo.txcomb, utxo.sender))

    // checks if supply is still higher than the min amount of supply
    if (asset.supply > config.MIN_SUPPLY) return vend(wallet)
    else return;
};


// run vending machine
(async () => {
    const wallet = cardano.wallet(config.PROJECT)
    await vend(wallet)
})()