const fs = require('fs')
const env = require('./env')
const axios = require('axios')
const FormData = require('form-data')
const PINATA_KEY = env.get('PINATA_KEY')
const PINATA_SECRET = env.get('PINATA_SECRET')

const ipfs = (f) => {
    const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;

    //we gather a local file for this example, but any valid readStream source will work here.
    let data = new FormData();
    data.append('file', fs.createReadStream(f));

    return axios
        .post(url, data, {
            maxBodyLength: 'Infinity', //this is needed to prevent axios from erroring out with large files
            headers: {
                'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
                pinata_api_key: PINATA_KEY,
                pinata_secret_api_key: PINATA_SECRET
            }
        })
        .then(response => `ipfs://${response.data.IpfsHash}`)
};

module.exports = ipfs