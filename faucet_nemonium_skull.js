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
config.project = 'NEMONIUM_SKULL_FAUCET'
config.policy_id_token = '885742cd7e0dad321622b5d3ad186797bd50c44cbde8b48be1583fbd'
config.policy_id_WL = '95ef7829379af37336b98b487c03c389c288cf938f54ddccd10185c2'
config.addr_profit = 'addr1qxspfp2xraxam3226mm62dk2cwwkrm9qlhy57xudfsa8lrt3zxdtu8rxcte8h2qn0tmvuz94mcgt5w4mlkzdcmyqmygsnqjr2a'


const walletVend = cardano.wallet(`${config.project}_VEND`)
const walletTokens = cardano.wallet(`${config.project}_TOKENS`)
const walletWL = cardano.wallet(`${config.project}_TOKENS_WL`)

const main = async () => {
    const db = jsondb.initialize(path.join('db', `${config.project}_${network.state()}`))
    console.log(
        `\n\n
        VEND: ${walletVend.addr}\n
        FUNDS: ${walletTokens.addr}\n
        WL: ${walletWL.addr}\n
        \n\n`,
    )



    // faucet
    const utxos = _.take(cardano.queryUtxoJson(walletVend.addr).reverse().filter(utxo => !db.has(utxo.txcomb)), 80)
    if (!utxos.length) return await main()

    // tokens
    const utxosToken = cardano.queryUtxoAssetByPolicyId(walletTokens.addr, config.policy_id_token)
    const utxoToken = _.first(_.sortBy(utxosToken, utxo => utxo.supply).reverse())

    // WL
    const utxosWL = cardano.queryUtxoAssetByPolicyId(walletWL.addr, config.policy_id_WL)
    const utxoWL = _.first(_.sortBy(utxosWL, utxo => utxo.supply).reverse())


    let lovelace = 0

    const txins = []
    const txouts = []
    const txhashs = []
    let tokenAmountOld = 0
    let tokenAmount = utxoToken.supply
    let wlAmountOld = 0
    let wlAmount = utxoWL.supply

    // SKULL
    txins.push(cardano.argument('tx in', utxoToken.txcomb))

    for (const utxo of utxos) {
        const sender = await blockfrost.getSenderFromUtxo(utxo)
        const tokenAmountUtxo = parseInt(cardano.toAda(utxo.lovelace) / 0.10)

        // OLD
        txhashs.push(utxo.txcomb)
        txins.push(cardano.argument('tx in', utxo.txcomb))
        lovelace += utxo.lovelace
        tokenAmountOld += tokenAmountUtxo

        // WL
        if (cardano.toAda(utxo.lovelace) >= 5 && wlAmount) {
            const WLchance = cardano.toAda(utxo.lovelace) >= 100 ?
                13
                : _.random(1, 100)


            const WLyes = WLchance <= 13
            console.log(`${WLchance}% ${cardano.toAda(utxo.lovelace)} ADA | ${WLyes} | SKULL ${tokenAmountUtxo}`)

            if (WLyes) {
                wlAmountOld += 1
                lovelace -= cardano.toLovelace(1.5)
                txins.push(cardano.argument(
                    'tx out',
                    `${sender.sender}+${cardano.toLovelace(1.5)}+"1 ${utxoWL.asset}"`
                ))
            }

        }

        lovelace -= cardano.toLovelace(1.5)
        txins.push(cardano.argument(
            'tx out',
            `${sender.sender}+${cardano.toLovelace(1.5)}+"${tokenAmountUtxo} ${utxoToken.asset}"`
        ))
    }

    // WL
    if (wlAmountOld) txins.push(cardano.argument('tx in', utxoWL.txcomb))

    console.log('PROFITS:', cardano.toAda(lovelace))

    tokenAmount -= tokenAmountOld
    wlAmount -= wlAmountOld


    // BUILD TRANSACTION
    const timestamp = String(centos.timestamp())
    const slot = cardano.querySlot() + 10000
    const T = cardano.transaction(timestamp)

    const rawA = [
        'transaction build-raw',
        ...txins,
        ...txouts,
        // SKULL
        tokenAmountOld ? cardano.argument('tx out', `${walletTokens.addr}+${utxoToken.lovelace}+"${tokenAmount} ${utxoToken.asset}"`) : false,
        // WL
        wlAmountOld ? cardano.argument('tx out', `${walletWL.addr}+${utxoWL.lovelace}+"${wlAmount} ${utxoWL.asset}"`) : false,
        // PROFIT
        cardano.argument('tx out', `${config.addr_profit}+${lovelace}`),
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
        // SKULL
        tokenAmountOld ? cardano.argument('tx out', `${walletTokens.addr}+${utxoToken.lovelace}+"${tokenAmount} ${utxoToken.asset}"`) : false,
        // WL
        wlAmountOld ? cardano.argument('tx out', `${walletWL.addr}+${utxoWL.lovelace}+"${wlAmount} ${utxoWL.asset}"`) : false,
        // PROFIT
        cardano.argument('tx out', `${config.addr_profit}+${lovelace}`),
        cardano.argument('invalid-hereafter', slot), `--fee=${fees}`,
        cardano.argument('out file', T.draftFile)
    ]
    terminal.node(draftA)


    // SIGN
    const signedA = [
        'transaction sign',
        cardano.argument('signing-key-file', walletVend.skeyFile),
        cardano.argument('signing-key-file', walletTokens.skeyFile),
        wlAmountOld ? cardano.argument('signing-key-file', walletWL.skeyFile) : false,
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

    // SKULL
    let currentAmount = _.first(_.sortBy(cardano.queryUtxoAssetByPolicyId(walletTokens.addr, config.policy_id_token), utxo => utxo.supply).reverse()
    ).supply
    while (tokenAmount !== currentAmount) {
        currentAmount = _.first(_.sortBy(cardano.queryUtxoAssetByPolicyId(walletTokens.addr, config.policy_id_token), utxo => utxo.supply).reverse()
        ).supply
        console.log(tokenAmount, currentAmount)
        console.log('TOKEN NOT UPDATED: SLEEPING 5 min')
        await sleep(150000)
    }


    // WL
    let currentAmountWL = _.first(_.sortBy(cardano.queryUtxoAssetByPolicyId(walletWL.addr, config.policy_id_WL), utxo => utxo.supply).reverse()
    ).supply
    while (wlAmount !== currentAmountWL) {
        currentAmountWL = _.first(_.sortBy(cardano.queryUtxoAssetByPolicyId(walletWL.addr, config.policy_id_WL), utxo => utxo.supply).reverse()
        ).supply
        console.log(wlAmount, currentAmountWL)
        console.log('WL NOT UPDATED: SLEEPING 5 min')
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