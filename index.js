const fs = require('fs')
const _ = require('lodash')
const centos = require('./src/centos')
const jsondb = require('./src/jsondb')
const cardano = require('./src/cardano')
const network = require('./src/network')
const terminal = require('./src/terminal')
const blockfrost = require('./src/blockfrost')

const config = {
    PROJECT: 'acode',
    NAME: 'ACODE',
    SUPPLY: 1000000,
    DEV_ADDR: 'addr_test1qqak6ml6yy09w266ylk4ycuu2lauuexmgjlhtfvfx2dhjqzdc6fe4vlcnmsdf933t8wr5guwgggc3aupdsrwpnq6sktqrt5e7e'
}

const main = async () => {
    const wallet = cardano.wallet('royalty')
    const policy = cardano.policy(`${config.PROJECT}`, false, true)
    console.log(`\n\n ROYALTY\n ${wallet.addr} \n\n`)

    const tokenJSON = JSON.parse(fs.readFileSync('./examples/royalty.json'))
    if (!Object.keys(tokenJSON).length) throw new Error('Cannot mint empty JSON')

    const royalty = {
        777: {
            [policy.id]: [{ ...tokenJSON }]
        }
    }

    const utxos = cardano.queryUtxoJson(wallet.addr)
    const utxo = utxos[0]
    if (!utxo) throw new Error('No transactions found.')
    if (utxo.lovelace < cardano.toLovelace(3)) throw new Error('Not enough lovelace.')


    const timestamp = String(centos.timestamp())
    const slot = cardano.querySlot() + 10000
    const T = cardano.transaction(timestamp)
    const M = cardano.metadata(timestamp, royalty)

    const rawA = [
        'transaction build-raw',
        cardano.argument('tx in', utxo.txcomb),
        cardano.argument('tx in', utxo.txcomb),
        cardano.argument('tx out', `${wallet.addr}+${cardano.toLovelace(1.5)}+"1 ${policy.id}"`),
        cardano.argument('tx out', `${config.DEV_ADDR}+${utxo.lovelace - cardano.toLovelace(1.5)}`),
        cardano.argument('metadata-json-file', M.jsonFile),
        `--mint="1 ${policy.id}"`,
        M ? cardano.argument('minting script file', policy.scriptFile) : false,
        cardano.argument('invalid-hereafter', slot),
        '--fee=0',
        cardano.argument('out file', T.rawFile)
    ]

    terminal.node(rawA)

    /** @type {Number} deduct fees */
    const fees = cardano.transactionFee(
        T.rawFile,
        1,
        2
    )

    utxo.lovelace -= fees

    const draftA = [
        'transaction build-raw',
        cardano.argument('tx in', utxo.txcomb),
        cardano.argument('tx in', utxo.txcomb),
        cardano.argument('tx out', `${wallet.addr}+${cardano.toLovelace(1.5)}+"1 ${policy.id}"`),
        cardano.argument('tx out', `${config.DEV_ADDR}+${utxo.lovelace - cardano.toLovelace(1.5)}`),
        cardano.argument('metadata-json-file', M.jsonFile),
        `--mint="1 ${policy.id}"`,
        M ? cardano.argument('minting script file', policy.scriptFile) : false,
        cardano.argument('invalid-hereafter', slot),
        `--fee=${fees}`,
        cardano.argument('out file', T.draftFile)
    ]

    terminal.node(draftA)

    const signedA = [
        'transaction sign',
        cardano.argument('signing-key-file', wallet.skeyFile),
        M ? cardano.argument('signing-key-file', policy.skeyFile) : false,
        cardano.argument('tx-body-file', T.draftFile),
        cardano.argument('out file', T.signedFile),
        network.node()
    ]

    terminal.node(signedA)

    console.log(
        terminal.node([
            'transaction submit',
            cardano.argument('tx-file', T.signedFile),
            network.node()
        ])
    )
};

(async () => await main())()