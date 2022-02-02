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
config.project = 'SKULLWL_NEMO'
config.policy_id_token = '95ef7829379af37336b98b487c03c389c288cf938f54ddccd10185c2'
config.addr_profit = 'addr1q8zkjvnktqsmqmsxp3ms73eqwsclfexwzv07gdaw5vg2gl9zgwvw6ejkgt6xnj0pxu2pts6urpe3yaamrdsgrqt33rlqa7y67s'

const wallet = cardano.wallet(`${config.project}-vend`)
const walletToken = cardano.wallet(`${config.project}-skullwl2`)

const main = async () => {

    const db = jsondb.initialize(path.join('db', `${config.project}_${network.state()}`))
    console.log(
        `\n\n
        VEND\n
        MINT: ${wallet.addr}\n
        TOKEN: ${walletToken.addr}\n
        PRICE: ${config.ada_price}\n
        SUPPLY: ${parseInt(db.get('tokenSupply'))}
        \n\n`,
    )


    const utxosToken = cardano.queryUtxoAssetByPolicyId(walletToken.addr, config.policy_id_token)
    const utxoToken = _.first(utxosToken)
    let tokenAmount = 0 // parseInt(db.get('tokenSupply')) || utxoToken.supply

    const utxos = _.take(cardano.queryUtxoJson(wallet.addr).filter(utxo => !db.has(utxo.txcomb)), 100)
    if (!utxos.length) return await main()

    let lovelace = 0
    const txins = []
    const txouts = []
    const txhashs = []
    // $skull
    // txins.push(cardano.argument('tx in', utxoToken.txcomb))
    // lovelace += utxoToken.lovelace

    console.log(utxos.length)
    for (const utxo of utxos) {
        const unitLovelace = utxo.lovelace
        const sender = await blockfrost.getSenderFromUtxo(utxo)
        txins.push(cardano.argument('tx in', utxo.txcomb))
        txhashs.push(utxo.txcomb)

        lovelace += unitLovelace
        if (sender.sender === config.addr_profit) continue

        // refund
        const balance = unitLovelace - cardano.toLovelace(.1)
        lovelace -= balance
        console.log(`R:${sender.sender}`, cardano.toAda(balance))
        txouts.push(cardano.argument('tx out',
            `${sender.sender}+${balance}`
        ))
    }
    console.log(lovelace)

    // BUILD TRANSACTION
    const timestamp = String(centos.timestamp())
    const slot = cardano.querySlot() + 10000
    const T = cardano.transaction(timestamp)

    // RAW
    const rawA = [
        'transaction build-raw',
        ...txins,
        ...txouts,
        cardano.argument('tx out', `${config.addr_profit}+${lovelace}`),
        // tokenAmount ? cardano.argument('tx out', `${walletToken.addr}+${utxoToken.lovelace}+"${tokenAmount} ${utxoToken.asset}"`) : false,
        cardano.argument('invalid-hereafter', slot),
        '--fee=0',
        cardano.argument('out file', T.rawFile)
    ]
    terminal.node(rawA)


    // FEES
    const fees = cardano.transactionFee(
        T.rawFile,
        txins.length,
        txouts.length
    )
    lovelace -= fees
    console.log(lovelace, fees)

    // DRAFT
    const draftA = [
        'transaction build-raw',
        ...txins,
        ...txouts,
        cardano.argument('tx out', `${config.addr_profit}+${lovelace}`),
        // tokenAmount ? cardano.argument('tx out', `${walletToken.addr}+${utxoToken.lovelace}+"${tokenAmount} ${utxoToken.asset}"`) : false,
        cardano.argument('invalid-hereafter', slot),
        `--fee=${fees}`,
        cardano.argument('out file', T.draftFile)
    ]
    terminal.node(draftA)


    // SIGN
    const signedA = [
        'transaction sign',
        cardano.argument('signing-key-file', wallet.skeyFile),
        cardano.argument('signing-key-file', walletToken.skeyFile),
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
    db.set('tokenSupply', tokenAmount)

    let currentAmount = _.first(cardano.queryUtxoAssetByPolicyId(walletToken.addr, config.policy_id_token)).supply
    while (tokenAmount !== currentAmount) {
        currentAmount = _.first(cardano.queryUtxoAssetByPolicyId(walletToken.addr, config.policy_id_token)).supply
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