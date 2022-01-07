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
    console.log(`\n\n TOKEN-NFT\n ${wallet.addr} \n\n`)

    const tokenJSON = JSON.parse(fs.readFileSync('./examples/token-nft.json'))
    if (!Object.keys(tokenJSON).length) throw new Error('Cannot mint empty JSON')
    const token = {
        721: {
            [policy.id]: {
                [config.NAME]: {
                    ...tokenJSON
                }
            }
        }
    }

    const utxos = cardano.queryUtxoJson(wallet.addr)
    const utxo = utxos[0]
    if (!utxo) throw new Error('No transactions found.')
    if (utxo.lovelace < cardano.toLovelace(3)) throw new Error('Not enough lovelace.')


    const timestamp = String(centos.timestamp())
    const slot = cardano.querySlot() + 10000
    const T = cardano.transaction(timestamp)
    const M = cardano.metadata(timestamp, token)

    const rawA = [
        'transaction build-raw',
        cardano.argument('tx in', utxo.txcomb),
        cardano.argument('tx in', utxo.txcomb),
        cardano.argument('tx out', `${config.DEV_ADDR}+${cardano.toLovelace(1.5)}+"${config.SUPPLY} ${policy.id}.${config.NAME}"`),
        cardano.argument('tx out', `${config.DEV_ADDR}+${utxo.lovelace - cardano.toLovelace(1.5)}`),
        cardano.argument('metadata-json-file', M.jsonFile),
        `--mint="${config.SUPPLY} ${policy.id}.${config.NAME}"`,
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
        cardano.argument('tx out', `${config.DEV_ADDR}+${cardano.toLovelace(1.5)}+"${config.SUPPLY} ${policy.id}.${config.NAME}"`),
        cardano.argument('tx out', `${config.DEV_ADDR}+${utxo.lovelace - cardano.toLovelace(1.5)}`),
        cardano.argument('metadata-json-file', M.jsonFile),
        `--mint="${config.SUPPLY} ${policy.id}.${config.NAME}"`,
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