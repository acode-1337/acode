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


const config = {}
config.ada_price = 13
config.project = 'SKULLWL_NEMO'
config.policy_id_token = '19d45975f8b0098a6430ed9816e332fc7d4cf9a65de49487b71d279b'
config.addr_profit = 'addr_test1qzkdcjvwkp2xg9t87rt9sdeutsp4ch3xethxlzzq6j6fzkrw7z6p88xmw8nm9g0r6zu0wmw50c2s2hr5k6suc748jewqwqy8sv'

const wallet = cardano.wallet(config.project)
const walletToken = cardano.wallet(`${config.project}-skullwl`)

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
    if (!utxoToken) return;
    let tokenAmount = parseInt(db.get('tokenSupply')) || utxoToken.supply


    const utxos = _.take(cardano.queryUtxoJson(wallet.addr).reverse(), 20)
    if (!utxos.length) return await main()

    let lovelace = 0
    const txins = []
    const txouts = []
    const txhashs = []
    // $skull
    txins.push(cardano.argument('tx in', utxoToken.txcomb))


    for (const utxo of utxos) {
        const unitLovelace = utxo.lovelace
        const sender = await blockfrost.getSenderFromUtxo(utxo)
        lovelace += unitLovelace
        txins.push(cardano.argument('tx in', utxo.txcomb))
        txhashs.push(utxo.txcomb)

        // send WL token
        if (utxo.lovelace >= cardano.toLovelace(config.ada_price)) {
            lovelace -= cardano.toLovelace(1.5)
            tokenAmount -= 1
            txouts.push(cardano.argument('tx out',
                `${sender.sender}+${cardano.toLovelace(1.5)}+"1 ${utxoToken.asset}"`
            ))

            // refund excess
            if (unitLovelace > cardano.toLovelace(config.ada_price)) {
                const balance = unitLovelace - cardano.toLovelace(config.ada_price)
                lovelace -= balance
                txouts.push(cardano.argument('tx out',
                    `${sender.sender}+${balance}`
                ))
            }
        } else {
            // refund
            const balance = unitLovelace - cardano.toLovelace(.2)
            lovelace -= unitLovelace
            lovelace += cardano.toLovelace(.2)
            txouts.push(cardano.argument('tx out',
                `${sender.sender}+${balance}`
            ))
        }
        txhashs.push(utxo.txcomb)
        txins.push(cardano.argument('tx in', utxo.txcomb))
    }

    if (lovelace <= cardano.toLovelace(2)) return await main()

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
        cardano.argument('tx out', `${walletToken.addr}+${utxoToken.lovelace}+"${tokenAmount} ${utxoToken.asset}"`),
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

    // DRAFT
    const draftA = [
        'transaction build-raw',
        ...txins,
        ...txouts,
        cardano.argument('tx out', `${config.addr_profit}+${lovelace}`),
        cardano.argument('tx out', `${walletToken.addr}+${utxoToken.lovelace}+"${tokenAmount} ${utxoToken.asset}"`),
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