const fs = require('fs')
const terminal = require('../src/terminal')

const policyID = 'a3bbcab3c60de005248e10c8ef07b2ce0c1d8a5805c6214feeb4b6ce'
const tokenFile = 'handz.json'
const imageFile = 'images/handz.png'
const policyFolder = 'token_handz_NFT'
const token = JSON.parse(
    fs.readFileSync(
        `../tokens/${tokenFile}`,
        'utf-8'
    )
).HANDZ

console.log(token)

const xxd = terminal.run([
    `echo -n "${token.name}" | xxd -ps`
])

const policy = `${policyID}${xxd}`

console.log([
    './token-metadata-creator entry',
    `--init ${policy}`
].join(' ').replace(/\n/g, "").trim())

console.log([
    `./token-metadata-creator entry ${policy} --name "${token.name}" --description "${token.description}"`,
    `--ticker "${token.name}"`,
    `--url "${token.website}"`,
    `--logo "${imageFile}"`,
    `--policy /home/hobo/icode/acode/src/mainnet/policy/${policyFolder}/policy.script`,
].join(' ').replace(/\n/g, "").trim())

console.log([
    `./token-metadata-creator entry ${policy} -a ../src/mainnet/policy/${policyFolder}/policy.skey`
].join(' ').replace(/\n/g, "").trim())

console.log([
    `./token-metadata-creator entry ${policy} --finalize`
].join(' ').replace(/\n/g, "").trim())

