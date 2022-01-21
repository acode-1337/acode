const fs = require('fs')
const _ = require('lodash')
const path = require('path')
const centos = require('./src/centos')
const jsondb = require('./src/jsondb')
const cardano = require('./src/cardano')
const network = require('./src/network')
const terminal = require('./src/terminal')


const config = {}
config.supply = 1000000000
config.project = 'token_handz_2'
config.addr_profit = 'addr1q8zkjvnktqsmqmsxp3ms73eqwsclfexwzv07gdaw5vg2gl9zgwvw6ejkgt6xnj0pxu2pts6urpe3yaamrdsgrqt33rlqa7y67s'

const wallet = cardano.wallet(config.project)
const policy = cardano.policy(config.project, false, true)


const main = async () => {
    const db = jsondb.initialize(path.join('db', `${config.project}_${network.state()}`))
    const tokenFile = JSON.parse(fs.readFileSync('tokens/handz.json', 'utf-8'))

    console.log(`\n\n
        ${config.project}
        \n
        ${wallet.addr}
        `
    )


    const utxos = cardano.queryUtxoJson(wallet.addr)
    if (!utxos.length) return await main()

    let lovelace = 0
    const txins = []
    const txouts = []
    const txhashs = []
    const skullz = []
    const metadata = { ...tokenFile }

    for (const utxo of utxos) {
        txins.push(cardano.argument('tx in', utxo.txcomb))
        lovelace += utxo.lovelace
    }

    if (lovelace < cardano.toLovelace(3)) return await main()

    txouts.push(cardano.argument('tx out',
        `${config.addr_profit}+${cardano.toLovelace(1.5)}+"${config.supply} ${policy.id}.${Object.keys(metadata)[0]}"`
    ))

    lovelace -= cardano.toLovelace(1.5)


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
        M ? cardano.argument('metadata-json-file', M.jsonFile) : false,
        M ? `--mint="${Object.keys(metadata).map(key => `${config.supply} ${policy.id}.${key}`).join('+')}"` : false,
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
        M ? cardano.argument('metadata-json-file', M.jsonFile) : false,
        M ? `--mint="${Object.keys(metadata).map(key => `${config.supply} ${policy.id}.${key}`).join('+')}"` : false,
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
    skullz.forEach(key => db.set(key.split('.')[1].trim(), true))

    if ((_.toArray(tokenFile).length - Object.keys(metadata).length)) return await main()

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
