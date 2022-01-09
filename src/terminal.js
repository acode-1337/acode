const cmd = require('node-cmd')
const docker = require('./docker')

/**
 * Run cmd with args
 *
 * @param {Array} args arguments
 * @return {String} result
 */
const run = args => {
    const argsClean = args.filter(i => i)
    const argsSpaced = argsClean.join(' ')
    console.log(argsSpaced)
    const result = cmd.runSync(argsSpaced)
    if (result.err) throw new Error(result.err)
    else return result.data
}

/**
 * Run cardano-cli with args
 *
 * @param {Array} args arguments
 * @return {String} result
 */
const node = args => run([
    docker.node(),
    'cardano-cli',
    ...args
])

/**
 * Run centos bash with args
 *
 * @param {*} args arguments
 * @return {String} result
 */
const centos = args => run([
    docker.centos(),
    'bash -c "',
    ...args,
    '"'
])

module.exports = {
    run,
    node,
    centos
}