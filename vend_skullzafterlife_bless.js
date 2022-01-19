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
config.project = 'SKULLZAFTERLIFE_7'
config.policy_id = 'd9d988522b791b4dea7307b5455d8ad2d8ee3e9426ee439a59a3f547'
config.addr_profit = 'addr_test1qq7mnd56tk3046ak9lpczxu8082u3a6zhshcnaj5kdna00xa9907wj6v688khhqud4dfmnlf2md0mvf0qw60u2apk3sqqc57gw'

const wallet = cardano.wallet(config.project)
const policy = cardano.policy(config.project, false, true)


const main = async () => {
    const db = jsondb.initialize(path.join('db', `${config.project}_${network.state()}`))
    const tokenFile = JSON.parse(fs.readFileSync('nfts/ada_skullz.json', 'utf-8'))

    console.log(
        `\n\n
        VEND\n
        ${wallet.addr}\n
        AVAILABLE: ${Object.keys(tokenFile).filter(key => !db.has(key)).length}
        \n\n`,
    )


    const utxos = cardano.queryUtxoJson(wallet.addr)
    if (!utxos.length) return await main()

    const utxosBlockfrost = await blockfrost.getAddressUtxos(wallet.addr).then(utxos => utxos.filter(utxo => !db.has(`${utxo.tx_hash}#${utxo.tx_index}`)))
    if (!utxosBlockfrost.length) return await main()


    let lovelace = 0
    const txins = []
    const txouts = []
    const txhashs = []
    const skullz = []
    const metadata = {}

    for (const utxo of utxosBlockfrost) {
        const unitLovelace = utxo.amount.filter(i => i.unit === 'lovelace')
        const unitAssets = utxo.amount.filter(i => i.unit.includes(config.policy_id))

        const sentLovelace = parseInt(_.sumBy(unitLovelace, 'quantity'))
        const expectedLovelace = unitAssets.length * cardano.toLovelace(2)
        const rightLovelace = sentLovelace === expectedLovelace

        if (rightLovelace) {
            lovelace += sentLovelace
            txhashs.push(`${utxo.tx_hash}#${utxo.tx_index}`)
            txins.push(cardano.argument('tx in', `${utxo.tx_hash}#${utxo.tx_index}`))
            const sender = await blockfrost.getSenderFromUtxo({ txhash: utxo.tx_hash })

            for (const asset of unitAssets) {
                const token = hex.decode(asset.unit.split(config.policy_id)[1])

                const metO = tokenFile[token]
                const num = metO.name.split('#')[1]
                const key = `SKULLZAF${num}`
                const met = {
                    name: `Skullz Afterlife #${num}`,
                    image: metO.image,
                    mediaType: 'image/png',
                    attributes: Object.assign({}, ...metO.attributes),
                    socials: {
                        twitter: 'https://twitter.com/skullzafterlife',
                        discord: 'https://discord.gg/skullzafterlife',
                        instagram: 'https://intagram.com/skullzafterlife'
                    }
                }

                metadata[key] = met
                txouts.push(cardano.argument('tx out',
                    `${sender.sender}+${cardano.toLovelace(1.5)}+"1 ${policy.id}.${key}"`
                ))
                lovelace -= cardano.toLovelace(1.5)
                skullz.push(`1 ${config.policy_id}.${token}`)
            }
        } else {
            txhashs.push(`${utxo.tx_hash}#${utxo.tx_index}`)
            txins.push(cardano.argument('tx in', `${utxo.tx_hash}#${utxo.tx_index}`))
            const unitLovelace = utxo.amount.filter(i => i.unit === 'lovelace')
            unitLovelace.forEach(i => lovelace += i.lovelace)
        }
    }

    if (txouts.length < 3) return await main()

    // BUILD TRANSACTION
    const timestamp = String(centos.timestamp())
    const slot = cardano.querySlot() + 10000
    const T = cardano.transaction(timestamp)
    const M = Object.keys(metadata).length ? cardano.metadata(timestamp, {
        721: {
            [policy.id]: { ...metadata }
        }
    }) : false

    console.log(txouts)

    // RAW
    const rawA = [
        'transaction build-raw',
        ...txins,
        ...txouts,
        cardano.argument('tx out', `${config.addr_profit}+${lovelace}+"${skullz.join('+')}"`),
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
        cardano.argument('tx out', `${config.addr_profit}+${lovelace}+"${skullz.join('+')}"`),
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