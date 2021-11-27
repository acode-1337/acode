const _ = require('lodash')
const path = require('path')
const centos = require('./centos')
const docker = require('./docker')
const network = require('./network')
const terminal = require('./terminal')

/**
 * Helper for passing arguments in cardano-cli
 *
 * @param {String} k key argument
 * @param {String} v val argument
 * @example argument('tx out', 'val)
 */
const argument = (k, v) =>
    `--${k.split(' ').join('-')} ${v}`


/**
 * Generates signing and verification key file from given path
 *
 * @param {String} skeyFile path for .skey
 * @param {String} vkeyFile path for .vkey
 */
const addressKeygen = (skeyFile, vkeyFile) =>
    terminal.node([
        'address key-gen',
        argument('signing-key-file', skeyFile),
        argument('verification key file', vkeyFile)
    ])

/**
 * cardano-cli query tip
 * @return {Object} tip
 */
const queryTip = () =>
    JSON.parse(terminal.node([
        `query tip ${network.node()}`
    ]))

/**
 * Gets current slot from `cardano-cli query tip`
 * @return {Number} slot
 */
const querySlot = () =>
    parseInt(queryTip().slot)

/**
 * cardano-cli query utxo
 *
 * @param {String} address wallet address
 * @return {String} table of utxos
 */
const queryUtxo = address =>
    terminal.node([
        'query utxo',
        argument('address', address),
        network.node()
    ])

/**
 * cardano-cli query utxo
 * parses the utxo table and return assets from passed policy ID
 *
 * @param {String} address wallet address
 * @param {String} policyId policy id
 * @return {Object} table of utxos
 * @example
 * {
        txhash: String,
        txix: String,
        lovelace: Number,
        txcomb: String,
        txfire: String,
        supply: Number,
        asset: String,
        name: String
    }
**/
const queryUtxoAssetByPolicyId = (address, policyId) =>
    queryUtxo(address)
        .trim().split('\n').filter(row => row).slice(2)
        .map(tr => tr.split(' '))
        .filter(i => i.find(v => v.includes(policyId)))
        .map(tr => tr.filter(i => i))
        .map(col => {
            return {
                txhash: col[0],
                txix: parseInt(col[1]),
                lovelace: parseInt(col[2]),
                txcomb: `${col[0]}#${col[1]}`,
                txfire: `${col[0]}-${col[1]}`,
                supply: parseInt(col[5]),
                asset: col[6],
                name: col[6].split('.')[1]
            }
        })

/**
 * cardano-cli query utxo
 * parses the utxo table and return all the transactions into object
 * @param {String} address wallet address
 * @return {Object} utxos
 * {
        txhash: String,
        txix: String,
        lovelace: Number,
        txcomb: String,
        txfire: String
    }
 */
const queryUtxoJson = address =>
    queryUtxo(address)
        .trim().split('\n').filter(row => row).slice(2)
        .map(tr => {
            const col = tr.split(' ').filter(row => row);

            return {
                txhash: col[0],
                txix: parseInt(col[1]),
                lovelace: parseInt(col[2]),
                txcomb: `${col[0]}#${col[1]}`,
                txfire: `${col[0]}-${col[1]}`
            }
        })

/**
 * Multiply amount to lovelace value
 *
 * @param {Number} amount
 * @return {Number} result
 */
const toLovelace = amount =>
    amount * 1000000

/**
 * Divide amount to lovelace value
 *
 * @param {*} amount
 * @return {Number} result
 */
const toAda = amount =>
    amount / 1000000

/**
 * Generate new wallet based on ID string given
 *
 * @param {String} id to be used for creating folder and identifier
 * @return {Object} wallet metadata
 * @example
 * {
        skeyFile: String,
        vkeyFile: String,
        addrFile: String,
        addr: String
    }
 */
const wallet = id => {
    /** @type {String} default folder for wallet */
    const folderWallet = path.join(docker.volumeCloud(), 'wallet')

    /** @type {String} main folder for wallet by id */
    const folderId = path.join(folderWallet, id)


    /** @type {Object} wallet metadata containing paths to .skey .vkey .addr and wallet address */
    const W = {
        skeyFile: path.join(folderId, 'wallet.skey'),
        vkeyFile: path.join(folderId, 'wallet.vkey'),
        addrFile: path.join(folderId, 'wallet.addr'),
        addr: ''
    }

    /** @type {Number} files checker */
    const missingFiles = Object.keys(W).filter(k => k !== 'addr')
        .flatMap(k => W[k])
        .flatMap(v => centos.fileExist(v))
        .filter(v => !v)
        .length

    if (missingFiles) {
        // create new wallet folder by id
        centos.folderCreate(folderId)
        // create wallet.skey and wallet.vkey
        addressKeygen(W.skeyFile, W.vkeyFile)

        // generate wallet address from wallet.vkey and output to wallet.addr
        terminal.node([
            'address build',
            argument('payment verification key file', W.vkeyFile),
            argument('out file', W.addrFile),
            network.node()
        ])
    }

    // attach wallet address to wallet metadata
    W.addr = terminal.centos([`cat ${W.addrFile}`])

    return W
}

/**
 * Generate new policy based on ID string given
 *
 * @param {String} id
 * @return {Object} policy metadata
 * @example
 * {
        id: String,
        idFile: String,
        skeyFile: String,
        vkeyFile: String,
        scriptFile: String,
    }
 */
const policy = (id, scriptCustom) => {
    /** @type {String} default folder for policy */
    const folderPolicy = path.join(docker.volumeCloud(), 'policy')

    /** @type {String} main folder for policy based on id*/
    const folderId = path.join(folderPolicy, id)


    /** @type {Object} policy metadata */
    const P = {
        id: '',
        idFile: path.join(folderId, 'policy.id'),
        skeyFile: path.join(folderId, 'policy.skey'),
        vkeyFile: path.join(folderId, 'policy.vkey'),
        scriptFile: path.join(folderId, 'policy.script'),
    }

    /** @type {Number} files checker */
    const missingFiles = Object.keys(P).filter(k => k !== 'id')
        .flatMap(k => P[k])
        .flatMap(v => centos.fileExist(v))
        .filter(v => !v)
        .length

    if (missingFiles) {
        // create new policy folder by id
        centos.folderCreate(folderId)
        // generate
        addressKeygen(P.skeyFile, P.vkeyFile)

        // add new policy script or use default policy script with no lock
        /** @type {String} policy script JSON string */
        const script = scriptCustom || centos.json({
            type: 'all',
            scripts: [{
                type: 'sig',
                keyHash: terminal.node([
                    'address key-hash',
                    argument('payment verification key file', P.vkeyFile)
                ]).trim()
            }]
        })

        // echo policy script json string to policy.script
        terminal.centos([`echo ${script}\n > ${P.scriptFile}`])

        // echo policy id to polic.id
        terminal.centos([
            'echo',
            terminal.node([
                'transaction policyid',
                argument('script file', P.scriptFile)
            ]).trim(),
            `> ${P.idFile}`
        ])
    }


    // attach policy id to policy metadata
    P.id = terminal.node([
        'transaction policyid',
        argument('script file', P.scriptFile)
    ]).trim()

    return P
}




/**
 * cardano query protocol-parameters
 * Protocol file updater and file path
 *
 * @return {String} protocol file path
 */
const protocol = () => {
    const protocolFile = path.join(docker.volumeCloud(), 'protocol.json')

    terminal.node([
        'query protocol-parameters',
        argument('out file', protocolFile),
        network.node()
    ])

    return protocolFile
}

/**
 * Generate transaction files by given id preferabbly a timestamp
 *
 * @param {String} id
 * @return {Object}
 * @example
 *  {
        rawFile: String,
        draftFile: String,
        signedFile: String,
    }
 */
const transaction = id => {

    /** @type {String} default transaction folder */
    const folderTransaction = path.join(docker.volumeCloud(), 'transactions')

    // create transaction folder by id
    centos.folderCreate(folderTransaction)

    /** @type {Object} transaction metadata */
    const T = {
        rawFile: path.join(folderTransaction, `${id}.raw`),
        draftFile: path.join(folderTransaction, `${id}.draft`),
        signedFile: path.join(folderTransaction, `${id}.signed`),
    }

    return T
}

/**
 * cardano-cli transaction calculate-min-fee
 *
 * @param {String} rawFile path to transaction.raw
 * @param {Number} inCount tx in count
 * @param {Number} outCount tx out count
 * @param {Number} witnessCount witness count || 1
 * @return {Number} transaction fee
 */
const transactionFee = (rawFile, inCount, outCount, witnessCount) =>
    parseInt(terminal.node([
        'transaction calculate-min-fee',
        argument('tx body file', rawFile),
        argument('tx in count', inCount),
        argument('tx out count', outCount),
        argument('witness count', witnessCount || 1),
        argument('protocol params file', protocol()),
        network.node()
    ]))



/**
 * Creates a new native token
 *
 * @param {Object} policy policy metadata
 * @param {Object} wallet wallet metadata
 * @param {String} name token name
 * @param {Number} supply token supply
 * @return {Object} {name, supply}
 */
const createToken = (policy, wallet, name, supply) => {

    /** @type {Array} utxos from wallet address */
    const utxos = queryUtxoJson(wallet.addr)
    if (!utxos) throw new Error('No funds')

    /** @type {Number} balance from wallet address*/
    const balance = _.sum(utxos, 'lovelace')
    if (balance < toLovelace(1.5)) throw new Error('Lacking funds')

    /** @type {Object} utxo with highest balance  */
    const utxo = _.head(_.sortBy(utxos, ['lovelace']))

    // start transaction build
    const tid = centos.timestamp()
    const T = transaction(tid)
    const slot = querySlot() + 10000

    // reduce utxo lovelace for token mint
    utxo.lovelace -= toLovelace(1.5)

    // raw build
    const rawA = [
        'transaction build-raw',
        argument('tx in', utxo.txcomb),
        // wallet address receives token
        argument('tx out', `${wallet.addr}+${toLovelace(1.5)}+"${supply} ${policy.id}.${name}"`),
        /// wallet address receives excess balance
        argument('tx out', `${wallet.addr}+${utxo.lovelace}`),
        `--mint="${supply} ${policy.id}.${name}"`,
        argument('minting-script file', policy.scriptFile),
        argument('invalid hereafter', slot),
        argument('fee', 0),
        argument('out file', T.rawFile)
    ]

    terminal.node(rawA)

    // fee build
    const fees = transactionFee(T.rawFile)(1)(2)(1)
    utxo.lovelace -= fees

    // draft build
    const draftA = [
        'transaction build-raw',
        argument('tx in', utxo.txcomb),
        // wallet address receives token
        argument('tx out', `${wallet.addr}+${toLovelace(1.5)}+"${supply} ${policy.id}.${name}"`),
        /// wallet address receives excess balance
        argument('tx out', `${wallet.addr}+${utxo.lovelace}`),
        `--mint="${supply} ${policy.id}.${name}"`,
        argument('minting-script file', policy.scriptFile),
        argument('invalid hereafter', slot),
        argument('fee', fees),
        argument('out file', T.rawFile)
    ]

    terminal.node(draftA)

    // signed build
    const signedA = [
        'transaction sign',
        argument('signing-key-file', wallet.skeyFile),
        argument('signing-key-file', policy.skeyFile),
        argument('tx-body-file', T.draftFile),
        argument('out file', T.signedFile),
        network.node()
    ]

    terminal.node(signedA)

    // submit transaction
    terminal.node([
        'transaction submit',
        argument('tx-file', T.signedFile),
        network.node()
    ])

    return {
        name,
        supply
    }
}

module.exports = {
    policy,
    wallet,
    protocol,
    argument,
    addressKeygen,
    queryTip,
    querySlot,
    queryUtxo,
    queryUtxoJson,
    queryUtxoAssetByPolicyId,
    toAda,
    toLovelace,
    transaction,
    transactionFee,
    createToken
}