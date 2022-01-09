const fs = require('fs')
const _ = require('lodash')
const centos = require('./src/centos')
const jsondb = require('./src/jsondb')
const cardano = require('./src/cardano')
const network = require('./src/network')
const terminal = require('./src/terminal')
const blockfrost = require('./src/blockfrost')

const config = {
    PROJECT: 'ADAELEMENTZ_NEWYEAR',
    NAME: 'ADAELEMENTZ',
    CREATOR_ADDR: 'addr1qxpjhh78pm9mhqtl0jss2wxxlvqa9elhlhx92kulx2jfchxvd24r80449emmj6g9n9h6qfyyypnh7qadfu86pze00wks36vjqz',
    PRICE: 3
}

const wallet = cardano.wallet('ADAELEMENTZ')
const policy = cardano.policy(config.PROJECT, false, true)


const main = async () => {
    const profitAddr = config.CREATOR_ADDR
    const db = jsondb.initialize(network.state())
    const tokenFile = JSON.parse(fs.readFileSync('nfts.json', 'utf-8'))

    console.log(
        `\n\n
        VEND\n
        ${wallet.addr}\n
        AVAILABLE: ${_.toArray(tokenFile).filter(token => !db.has(token.name)).length}
        \n\n`,
    )


    const tokenMin = cardano.toLovelace(1.5)
    const tokenPrice = cardano.toLovelace(config.PRICE)
    const tokenProfit = tokenPrice - tokenMin

    const tokensHot = []
    let lovelaceProfit = 0

    /** @type {Array} utxo draft transaction built for sender address, tx in and out*/
    const utxos = await Promise.all(
        _.take(
            cardano.queryUtxoJson(wallet.addr)
                .filter(utxo => !db.has(utxo.txcomb)),
            50
        )
            // filters transactions received excluding already processed txix and hash
            // query blockfrost for sender address
            .flatMap(utxo => blockfrost.getSenderFromUtxo(utxo)))

        .then(utxos => utxos
            // add tx in
            .flatMap(utxo => ({ ...utxo, txin: cardano.argument('tx in', utxo.txcomb) }))

            // add txout
            .flatMap(utxo => {

                /** @type {Array} tx out container */
                const txouts = []

                const token = _.head(
                    _.shuffle(
                        _.toArray(tokenFile)
                            .filter(token => !db.has(token.name))
                            .filter(token => !tokensHot.includes(token.name))
                    )
                )

                // refund if no more tokens or lovelace not enough
                if (!token || utxo.lovelace < tokenPrice) {
                    txouts.push(cardano.argument(
                        'tx out',
                        `${utxo.sender}+${utxo.lovelace}"`
                    ))
                } else {
                    const tokenId = Object.keys(tokenFile).find(i => tokenFile[i].name === token.name)
                    utxo.tokenId = tokenId

                    // send token
                    txouts.push(cardano.argument(
                        'tx out',
                        `${utxo.sender}+${tokenMin}+"1 ${policy.id}.${tokenId}"`
                    ))

                    // send excess
                    const excess = utxo.lovelace - tokenPrice
                    if (excess) txouts.push(cardano.argument(
                        'tx out',
                        `${utxo.sender}+${excess}`
                    ))

                    // add profit
                    lovelaceProfit += tokenProfit
                    tokensHot.push(token.name)
                }



                // assign txouts container to utxo
                utxo.txouts = txouts
                return utxo
            })

        )

    if (!utxos.length) return main()

    const timestamp = String(centos.timestamp())
    const slot = cardano.querySlot() + 10000
    const T = cardano.transaction(timestamp)
    const M = tokensHot.length ? cardano.metadata(timestamp, {
        721: {
            [policy.id]: tokensHot
                .reduce((a, b) => {
                    const key = Object.keys(tokenFile)
                        .find(key => tokenFile[key].name === b)
                    const token = tokenFile[key]
                    return { ...a, [key]: token }
                }
                    , {})
        }
    }) : false

    const rawA = [
        'transaction build-raw',
        ...utxos.flatMap(i => i.txin),
        ...utxos.flatMap(i => i.txouts),
        cardano.argument('tx out', `${profitAddr}+${lovelaceProfit}`),
        M ? cardano.argument('metadata-json-file', M.jsonFile) : false,
        M ? `--mint="${utxos.filter(utxo => utxo.tokenId).map(utxo => `1 ${policy.id}.${utxo.tokenId}`).join('+')}"` : false,
        M ? cardano.argument('minting script file', policy.scriptFile) : false,
        cardano.argument('invalid-hereafter', slot),
        '--fee=0',
        cardano.argument('out file', T.rawFile)
    ]

    terminal.node(rawA)

    /** @type {Number} deduct fees */
    const fees = cardano.transactionFee(
        T.rawFile,
        utxos.flatMap(utxo => utxo.txin).length,
        utxos.flatMap(utxo => utxo.txouts).length
    )

    lovelaceProfit -= fees

    const draftA = [
        'transaction build-raw',
        ...utxos.flatMap(i => i.txin),
        ...utxos.flatMap(i => i.txouts),
        cardano.argument('tx out', `${profitAddr}+${lovelaceProfit}`),
        M ? cardano.argument('metadata-json-file', M.jsonFile) : false,
        M ? `--mint="${utxos.filter(utxo => utxo.tokenId).map(utxo => `1 ${policy.id}.${utxo.tokenId}`).join('+')}"` : false,
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

    terminal.node([
        'transaction submit',
        cardano.argument('tx-file', T.signedFile),
        network.node()
    ])

    // System saves the txix and hash.
    utxos.forEach(utxo => db.set(utxo.txcomb, utxo.sender))
    tokensHot.forEach(token => db.set(token, true))

    if ((_.toArray(tokenFile).length - tokensHot.length)) return main()
};

(async () => await main())()