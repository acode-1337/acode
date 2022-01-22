const firebase = require('firebase/compat/app')
require('firebase/compat/database')
const _ = require('lodash')

const realtime = config => {
    firebase.initializeApp(config)

    const database = firebase.database

    const write = async (ref, payload) => await database()
        .ref(ref)
        .set(payload)

    const read = async ref => await database()
        .ref(ref)
        .once('value')
        .then(snapshot => {
            if (!snapshot.exists()) return []
            else return _.toArray(snapshot.val())
        })

    const push = async (ref, payload) => await database()
        .ref(ref)
        .push(payload)

    const update = async (ref, payload) =>
        await database()
            .ref(ref)
            .update(payload)

    return {
        read,
        push,
        write,
        update
    }
}

module.exports = realtime
