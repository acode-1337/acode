const terminal = require('./terminal')

/**
* date +%s
* @return {Number} timestamp
*/
const timestamp = () =>
    parseInt(terminal.centos(['date +%s']))


/**
 * Helper function to parse object from JS to JSON file in centos
 *
 * @param {Object} obj object
 * @return {String} JSON string
 */
const json = obj => {
    const string = JSON.stringify(obj)
    const chunks = string.match(/.{1,50000}/g)
    return chunks.map(chunk => chunk
        .split('\n')
        .map(i => `'${i}' \\`)
        .join('')
        .replace(new RegExp('"', 'g'), '\\"')
    )
}
/**
 * Checks file if exists on given path
 *
 * @param {String} filePath path
 * @return {Number} result
 */
const fileExist = filePath =>
    parseInt(terminal.centos([`[ -f "${filePath}" ] && echo 1`]))

/**
 * Checks if folder exists on given path
 *
 * @param {String} folderPath path
 * @return {Number} result
 */
const folderExist = folderPath =>
    parseInt(terminal.centos([
        `[ -d "${folderPath}" ] && echo "1"`
    ]))

/**
 * Creates new folder on given path
 *
 * @param {String} folderPath path
 * @return {String} folder path
 */
const folderCreate = folderPath =>
    folderExist(folderPath) ?
        // return path
        folderPath :
        // create folder and return path
        terminal.centos([`mkdir -p ${folderPath} && echo ${folderPath}`])

module.exports = {
    json,
    timestamp,
    fileExist,
    folderExist,
    folderCreate
}