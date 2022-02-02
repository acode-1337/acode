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
config.ada_price = 10
config.token_amount = 10
config.token_name = 'Skull'
config.project = 'SKULLNEMO_TEST_MAINNET'
config.policy_id_token = '996e01a52fe8eb6d4f4d00ded95a428a644ce6fe0e21840429b96625'
config.addr_profit = 'addr1qyt4k5kc0lf3ndlmnjtymtv06wmq283mchex0qrfya9z4zrpyvxfxyaun7aptdfexs4n3w5jaa4r4medke6sgfnj8qgsxv080t'

const wallet = cardano.wallet('PEWPEW')
const policy = cardano.policy(config.project, false, true)
const walletToken = cardano.wallet(`${config.project}-token-skull`)

const main = async () => {
    const db = jsondb.initialize(path.join('db', `${config.project}_${network.state()}`))
    let amount = parseInt(db.get('tokenSkull')) || 0
    const maxAmount = 3

    console.log(
        `\n\n
        VEND\n
        MINT: ${wallet.addr}\n
        TOKEN: ${walletToken.addr}\n
        AVAILABLE: ${maxAmount - amount}
        \n\n`,
    )


    const utxosToken = cardano.queryUtxoAssetByPolicyId(walletToken.addr, config.policy_id_token)
    const utxoToken = _.orderBy(utxosToken, ['supply']).reverse()[0]
    if (!utxoToken) return;
    let tokenAmount = parseInt(db.get('tokenAmount')) || utxoToken.supply


    const utxos = _.take(cardano.queryUtxoJson(wallet.addr).reverse(), 20)
    if (!utxos.length) return await main()

    let lovelace = 0
    const nfts = []
    const txins = []
    const txouts = []
    const txhashs = []
    const metadata = {}

    // $skull
    txins.push(cardano.argument('tx in', utxoToken.txcomb))


    for (const utxo of utxos) {
        const nextAmount = amount + 1
        const unitLovelace = utxo.lovelace
        const expectedLovelace = cardano.toLovelace(10)
        const rightLovelace = unitLovelace >= expectedLovelace
        const sender = await blockfrost.getSenderFromUtxo(utxo)

        txhashs.push(utxo.txcomb)
        txins.push(cardano.argument('tx in', utxo.txcomb))


        const refund = async utxo => {
            lovelace += utxo.lovelace
            // add to profits if not able to mint $skull
            if (utxo.lovelace > cardano.toLovelace(1.3)) {
                // $skull send
                const refundLovelace = utxo.lovelace - cardano.toLovelace(1.3)
                lovelace -= refundLovelace
                tokenAmount -= config.token_amount
                txouts.push(cardano.argument('tx out',
                    `${sender.sender}+${refundLovelace}+"${config.token_amount} ${config.policy_id_token}.${config.token_name}"`
                ))

            } else lovelace += utxo.lovelace
        }

        const mint = async utxo => {
            lovelace += utxo.lovelace
            const key = `SKULLTK${nextAmount}`
            const met = {
                name: `Skull Token Logo ${nextAmount}`,
                image: 'ipfs://QmTLyto6RcuWEqLbsouaBnEGfGaiUQxFRmYDiH5KeBtYu7',
                mediaType: 'image/png'
            }
            metadata[key] = met

            lovelace -= cardano.toLovelace(1.5)
            txouts.push(cardano.argument('tx out',
                `${sender.sender}+${cardano.toLovelace(1.5)}+"1 ${policy.id}.${key}"`
            ))

            lovelace -= cardano.toLovelace(1.5)
            txouts.push(cardano.argument('tx out',
                `${sender.sender}+${cardano.toLovelace(1.5)}+"${config.token_amount} ${config.policy_id_token}.${config.token_name}"`
            ))

            const balance = utxo.lovelace - cardano.toLovelace(config.ada_price)
            if (balance) {
                lovelace -= balance
                txouts.push(cardano.argument('tx out',
                    `${sender.sender}+${balance}`
                ))

            }
            amount += 1
            tokenAmount -= config.token_amount
            nfts.push(`1 ${policy.id}.${key}`)
        }


        const isSold = nextAmount > maxAmount
        // correct amount and available
        if (rightLovelace && !isSold) await mint(utxo)
        // not correct amount and not available
        else await refund(utxo)
    }

    // BUILD TRANSACTION
    const timestamp = String(centos.timestamp())
    const slot = cardano.querySlot() + 10000
    const T = cardano.transaction(timestamp)
    const M = Object.keys(metadata).length ? cardano.metadata(timestamp, {
        721: {
            [policy.id]: { ...metadata }
        }
    }) : false

    // RAW
    const rawA = [
        'transaction build-raw',
        ...txins,
        ...txouts,
        cardano.argument('tx out', `${config.addr_profit}+${lovelace}`),
        cardano.argument('tx out', `${walletToken.addr}+${utxoToken.lovelace}+"${tokenAmount} ${config.policy_id_token}.${config.token_name}"`),
        M ? cardano.argument('metadata-json-file', M.jsonFile) : false,
        M ? `--mint="${Object.keys(metadata).map(key => `1 ${policy.id}.${key}`).join('+')}"` : false,
        M ? cardano.argument('minting script file', policy.scriptFile) : false,
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
        cardano.argument('tx out', `${walletToken.addr}+${utxoToken.lovelace}+"${tokenAmount} ${config.policy_id_token}.${config.token_name}"`),
        M ? cardano.argument('metadata-json-file', M.jsonFile) : false,
        M ? `--mint="${Object.keys(metadata).map(key => `1 ${policy.id}.${key}`).join('+')}"` : false,
        M ? cardano.argument('minting script file', policy.scriptFile) : false,
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
        M ? cardano.argument('signing-key-file', policy.skeyFile) : false,
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
    db.set('tokenSkull', amount)
    db.set('tokenSupply', tokenAmount)

    if (maxAmount - amount) return await main()
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