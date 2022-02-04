const fs = require('fs')
const _ = require('lodash')
const path = require('path')
const centos = require('./src/centos')
const jsondb = require('./src/jsondb')
const cardano = require('./src/cardano')
const network = require('./src/network')
const hex = require('hex-encode-decode')
const terminal = require('./src/terminal')
const blockfrost = require('./src/blockfrost')
const sleep = require('await-sleep')


const config = {}
config.ada_price = 4
config.project = 'NEMONIUM_SKULL_SWAP'
config.policy_id_token = '885742cd7e0dad321622b5d3ad186797bd50c44cbde8b48be1583fbd'
config.policy_id_token_old = '996e01a52fe8eb6d4f4d00ded95a428a644ce6fe0e21840429b96625'
config.policy_id_token_WL = '95ef7829379af37336b98b487c03c389c288cf938f54ddccd10185c2'
config.addr_profit = 'addr1qxkdcjvwkp2xg9t87rt9sdeutsp4ch3xethxlzzq6j6fzkrw7z6p88xmw8nm9g0r6zu0wmw50c2s2hr5k6suc748jewqdke8un'

const walletFunds = cardano.wallet(`${config.project}_FUNDS`)
const walletOld = cardano.wallet(`${config.project}_OLD`)
const walletNew = cardano.wallet(`${config.project}_NEW`)

const main = async () => {
    await sleep(150000)
    const db = jsondb.initialize(path.join('db', `${config.project}_${network.state()}`))
    console.log(
        `\n\n
        VEND\n
        FUNDS: ${walletFunds.addr}\n
        OLD: ${walletOld.addr}\n
        NEW: ${walletNew.addr}
        \n\n`,
    )


    // new
    const utxosToken = cardano.queryUtxoAssetByPolicyId(walletNew.addr, config.policy_id_token)
    const utxoToken = _.first(_.sortBy(utxosToken, utxo => utxo.supply).reverse())

    // old
    const utxos = _.take(cardano.queryUtxoAssetByPolicyId(walletOld.addr, config.policy_id_token_old).filter(utxo => !db.has(utxo.txcomb)), 100)



    let lovelace = 0

    const txins = []
    const txouts = []
    const txhashs = []
    let tokenAmountOld = 0
    let tokenAmount = utxoToken.supply

    // funds
    cardano.queryUtxoJson(walletFunds.addr)
        .forEach(utxo => {
            txins.push(cardano.argument('tx in', utxo.txcomb))
            lovelace += utxo.lovelace
        })


    for (const utxo of utxos) {
        const sender = await blockfrost.getSenderFromUtxo(utxo)

        // OLD
        txhashs.push(utxo.txcomb)
        txins.push(cardano.argument('tx in', utxo.txcomb))
        lovelace += utxo.lovelace
        tokenAmountOld += utxo.supply

        lovelace -= cardano.toLovelace(1.5)
        txouts.push(cardano.argument(
            'tx out',
            `${sender.sender}+${cardano.toLovelace(1.5)}+"${utxo.supply} ${utxoToken.asset}"`
        ))
    }

    if (tokenAmountOld) txins.push(cardano.argument('tx in', utxoToken.txcomb))



    const utxosWL = _.take(cardano.queryUtxoAssetByPolicyId(walletOld.addr, config.policy_id_token_WL).filter(utxo => !db.has(utxo.txcomb)), 100)

    for (const utxo of utxosWL) {
        const sender = await blockfrost.getSenderFromUtxo(utxo)

        // OLD
        txhashs.push(utxo.txcomb)
        txins.push(cardano.argument('tx in', utxo.txcomb))
        lovelace += utxo.lovelace

        lovelace -= cardano.toLovelace(1.444)
        txouts.push(cardano.argument(
            'tx out',
            `${sender.sender}+${cardano.toLovelace(1.444)}+"${utxo.supply} ${utxo.asset}"`
        ))
    }
    tokenAmount -= tokenAmountOld

    if (!txouts.length) return await main()

    // BUILD TRANSACTION
    const timestamp = String(centos.timestamp())
    const slot = cardano.querySlot() + 10000
    const T = cardano.transaction(timestamp)

    // RAW
    if (tokenAmountOld) lovelace -= cardano.toLovelace(1.5)

    const rawA = [
        'transaction build-raw',
        ...txins,
        ...txouts,
        cardano.argument('tx out', `${walletFunds.addr}+${lovelace}`),
        // OLD
        tokenAmountOld ? cardano.argument('tx out', `${config.addr_profit}+${cardano.toLovelace(1.5)}+"${tokenAmountOld} ${config.policy_id_token_old}.Skull"`) : false,
        // NEW
        tokenAmountOld ? cardano.argument('tx out', `${walletNew.addr}+${utxoToken.lovelace}+"${tokenAmount} ${utxoToken.asset}"`) : false,
        cardano.argument('invalid-hereafter', slot),
        '--fee=0',
        cardano.argument('out file', T.rawFile)
    ]
    terminal.node(rawA)


    // FEES
    const fees = cardano.transactionFee(
        T.rawFile,
        txins.length,
        txouts.length,
        3
    )
    lovelace -= fees

    // DRAFT
    const draftA = [
        'transaction build-raw',
        ...txins,
        ...txouts,
        cardano.argument('tx out', `${walletFunds.addr}+${lovelace}`),
        // OLD
        tokenAmountOld ? cardano.argument('tx out', `${config.addr_profit}+${cardano.toLovelace(1.5)}+"${tokenAmountOld} ${config.policy_id_token_old}.Skull"`) : false,
        // NEW
        tokenAmountOld ? cardano.argument('tx out', `${walletNew.addr}+${utxoToken.lovelace}+"${tokenAmount} ${utxoToken.asset}"`) : false,
        cardano.argument('invalid-hereafter', slot), `--fee=${fees}`,
        cardano.argument('out file', T.draftFile)
    ]
    terminal.node(draftA)


    // SIGN
    const signedA = [
        'transaction sign',
        cardano.argument('signing-key-file', walletFunds.skeyFile),
        cardano.argument('signing-key-file', walletNew.skeyFile),
        cardano.argument('signing-key-file', walletOld.skeyFile),
        cardano.argument('tx-body-file', T.draftFile),
        cardano.argument('out file', T.signedFile),
        network.node()
    ]
    terminal.node(signedA)

    console.log(terminal.node([
        'transaction submit',
        cardano.argument('tx-file', T.signedFile),
        network.node()
    ]))

    // System saves the txix and hash.
    txhashs.forEach(tx => db.set(tx, true))
    let currentAmount = _.first(_.sortBy(cardano.queryUtxoAssetByPolicyId(walletNew.addr, config.policy_id_token), utxo => utxo.supply).reverse()
    ).supply
    while (tokenAmount !== currentAmount) {
        currentAmount = _.first(_.sortBy(cardano.queryUtxoAssetByPolicyId(walletNew.addr, config.policy_id_token), utxo => utxo.supply).reverse()
        ).supply
        console.log(tokenAmount, currentAmount)
        console.log('TOKEN NOT UPDATED: SLEEPING 5 min')
        await sleep(150000)
    }

    if (tokenAmount) return await main()
};

const run = async () => {
    try {
        await main()
    } catch (error) {
        console.log(error)
        await run()
    }
}

(async () => await run())()