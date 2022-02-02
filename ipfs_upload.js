const ipfs = require('./src/ipfs');

(async () => {
    const filename = './Handz-Token-Logo.png'
    const hash = await ipfs(filename)
        .catch(err => console.log(err))
    console.log(hash)
})();