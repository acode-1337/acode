const fs = require('fs')
const _ = require('lodash')
const path = require('path')
const sleep = require('await-sleep')
const centos = require('./src/centos')
const jsondb = require('./src/jsondb')
const cardano = require('./src/cardano')
const network = require('./src/network')
const terminal = require('./src/terminal')
const blockfrost = require('./src/blockfrost')


const config = {}
const holders = fs.readFileSync('dump/HANDZ_AIRDROP_FIRST.txt', 'utf-8').split('\n')
config.project = 'AIRDROP_HANDZ'
config.policy_id_token = 'a3bbcab3c60de005248e10c8ef07b2ce0c1d8a5805c6214feeb4b6ce'
config.addr_profit = 'addr1q8zkjvnktqsmqmsxp3ms73eqwsclfexwzv07gdaw5vg2gl9zgwvw6ejkgt6xnj0pxu2pts6urpe3yaamrdsgrqt33rlqa7y67s'

const wallet = cardano.wallet(`${config.project}`)
const walletToken = cardano.wallet(`${config.project}-MACHINE`)

const main = async () => {

    const db = jsondb.initialize(path.join('db', `${config.project}_${network.state()}`))
    console.log(
        `\n\n
        VEND\n
        FUNDS: ${wallet.addr}\n
        TOKEN: ${walletToken.addr}\n
        \n\n`,
    )


    const utxosToken = cardano.queryUtxoAssetByPolicyId(walletToken.addr, config.policy_id_token)
    const utxoToken = _.first(utxosToken)
    let tokenAmount = utxoToken.supply

    const utxos = _.take(cardano.queryUtxoJson(wallet.addr).filter(utxo => !db.has(utxo.txcomb)), 100)
    // if (!utxos.length) return await main()

    let lovelace = 0
    const txins = []
    const txouts = []
    const txhashs = []


    // wallet token
    lovelace += utxoToken.lovelace
    utxos.forEach(utxo => {
        txins.push(cardano.argument('tx in', utxo.txcomb))
        lovelace += utxo.lovelace
    })
    txins.push(cardano.argument('tx in', utxoToken.txcomb))

    holders.forEach(address => {
        tokenAmount -= 833333
        lovelace -= cardano.toLovelace(1.388)
        txouts.push(cardano.argument(
            'tx out',
            `${address}+${cardano.toLovelace(1.388)}+"833333 ${utxoToken.asset}"`
        ))
    })

    console.log('tokenAmount', tokenAmount)
    console.log('ADA', cardano.toAda(lovelace))

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
        tokenAmount ? cardano.argument('tx out', `${config.addr_profit}+${utxoToken.lovelace}+"${tokenAmount} ${utxoToken.asset}"`) : false,
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
        tokenAmount ? cardano.argument('tx out', `${config.addr_profit}+${utxoToken.lovelace}+"${tokenAmount} ${utxoToken.asset}"`) : false,
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