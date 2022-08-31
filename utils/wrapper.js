const formatMethodName = ( str ) => {
    const reservedWords = [ 'expectEvents', 'contract', 'deploy' ]
    return reservedWords.some( x => str === x )
        ? str + '2'
        : str
}

const createWrappedMethods =  ( contract, extractor ) => {
    const methods = contract.methods
    const keys = Object.keys( methods )
    const wrappedMethods = keys.reduce( ( acc, key ) => {
        const method = methods[key]
        const wrappedMethod = async ( ...args ) => {
            const ret = await method.apply( contract, args )
            return extractor ? extractor( ret ) : ret.decodedResult
        }
        const cloned = { ...acc }
        cloned[formatMethodName( key )] = wrappedMethod
        return cloned
    }, {} )
    return wrappedMethods
}
const cttoak = ( value ) => value.replace( "ct_", "ak_" )
const wrapContractInstance = ( contract ) => {
    return {
        original       : contract,
        ...createWrappedMethods( contract ),
        address        : contract.deployInfo.address,
        accountAddress : cttoak( contract.deployInfo.address )
    }
}

module.exports = {
    wrapContractInstance,
}
