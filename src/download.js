const fs = require('fs')
const Axios = require('axios')
Axios.defaults.timeout = 8000
async function image(url, filename) {
    if (!fs.existsSync('dump')) fs.mkdirSync('dump')
    const path = `dump/${filename}.png`
    const writer = fs.createWriteStream(path)

    const response = await Axios({
        url,
        method: 'GET',
        responseType: 'stream'
    })

    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
    })
}

module.exports = {
    image
}