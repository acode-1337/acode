const fs = require('fs')
const _ = require('lodash')
const path = require('path')
const centos = require('./src/centos')
const jsondb = require('./src/jsondb')
const cardano = require('./src/cardano')
const network = require('./src/network')
const hex = require('hex-encode-decode')
const terminal = require('./src/terminal')
const realtime = require('./src/realtime')
const blockfrost = require('./src/blockfrost')
// custom
const sharp = require('sharp')
const ipfs = require('./src/ipfs')
const download = require('./src/download')


const config = {}
config.project = 'SKULLZAFTERLIFE_BLESS'
config.policy_id = 'a780d38cf3180361b1dff604e17ee0e8bff0626a9e743bf341c26268'
config.addr_profit = 'addr1q86gh66h4xlanzy6awgpndw963c5llmf7mkdd39m98r82m6qcmnunr5m6rq03kj7alnnhq384gkadm04sp42seusdm5qfp3k90'

const wallet = cardano.wallet(config.project)
const policy = cardano.policy(config.project, false, true)


const main = async () => {
    const rdb = realtime({
        apiKey: "AIzaSyBVGYTQGt7w8WDNMu3Wp4v2o0P0d86ouzU",
        authDomain: "skullzafterlife.firebaseapp.com",
        databaseURL: "https://skullzafterlife-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "skullzafterlife",
        storageBucket: "skullzafterlife.appspot.com",
        messagingSenderId: "241142909087",
        appId: "1:241142909087:web:c1551eb01bdbaf7b103aaa",
        measurementId: "G-L2K9DENGKD"
    })

    // get verified skullz
    const blessed = (await rdb.read('blessed'))
        .map(i => i.skull)

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

    const utxosBlockfrost = _.take((await blockfrost.getAddressUtxos(wallet.addr).then(utxos => utxos.filter(utxo => !db.has(`${utxo.tx_hash}#${utxo.tx_index}`)))), 2)
    if (!utxosBlockfrost.length) return await main()

    let lovelace = 0
    const txins = []
    const txouts = []
    const txhashs = []
    const skullz = []
    const metadata = {}

    for (const utxo of utxosBlockfrost) {
        const sender = await blockfrost.getSenderFromUtxo({ txhash: utxo.tx_hash })
        const unitLovelace = utxo.amount.filter(i => i.unit === 'lovelace')
        const unitAssets = utxo.amount.filter(i => i.unit.includes(config.policy_id))

        txhashs.push(`${utxo.tx_hash}#${utxo.tx_index}`)
        txins.push(cardano.argument('tx in', `${utxo.tx_hash}#${utxo.tx_index}`))

        // lovelace add
        lovelace += parseInt(_.sumBy(unitLovelace, 'quantity'))
        if (unitAssets.length) {

            for (const asset of unitAssets) {

                const token = hex.decode(asset.unit.split(config.policy_id)[1])
                if (!blessed.includes(token)) continue

                const metO = tokenFile[token]
                const num = metO.name.split('#')[1]
                const key = `SKULLZAF${num}`
                console.log(key)
                // image edits
                await download.image(
                    `https://suitupnft.mypinata.cloud/ipfs/${metO.image.replace(
                        'ipfs://',
                        ''
                    )}`,
                    `SKULLZ${num}`
                )
                const imageOriginal = `dump/SKULLZ${num}.png`

                const imageFlipped = `dump/SKULLZFLIPPED${num}.png`

                await sharp(imageOriginal)
                    .flop()
                    .toFormat("png")
                    .png({ quality: 95 })
                    .toFile(imageFlipped);

                const imageHash = await ipfs(imageFlipped)

                const met = {
                    name: `Skullz Afterlife #${num}`,
                    image: imageHash,
                    mediaType: 'image/png',
                    attributes: Object.assign({}, ...metO.attributes),
                    socials: {
                        twitter: 'https://twitter.com/skullzafterlife',
                        discord: 'https://discord.gg/skullzafterlife',
                        instagram: 'https://instagram.com/skullzafterlife'
                    }
                }

                metadata[key] = met
                lovelace -= cardano.toLovelace(1.5)
                txouts.push(cardano.argument('tx out',
                    `${sender.sender}+${cardano.toLovelace(1.5)}+"1 ${policy.id}.${key}"`
                ))
                skullz.push(`1 ${config.policy_id}.${token}`)
            }
        }
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
