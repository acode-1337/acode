const fs = require('fs')
const _ = require('lodash')
const centos = require('./src/centos')
const cardano = require('./src/cardano')
const network = require('./src/network')
const terminal = require('./src/terminal')

const config = {
    PROJECT: 'ADAELEMENTZ_NEWYEAR',
    NAME: 'ADAELEMENTZ',
    DEV_ADDR: 'addr1qxpjhh78pm9mhqtl0jss2wxxlvqa9elhlhx92kulx2jfchxvd24r80449emmj6g9n9h6qfyyypnh7qadfu86pze00wks36vjqz'
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