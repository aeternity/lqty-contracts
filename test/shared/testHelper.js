const testHelper =  {

    dec: ( val, scale ) => {
        //TODO: don't think we need finney this
        const zerosCount = scale == 'ae' ? 18 : scale == 'finney'  ? 15 : scale
        const strVal = val.toString()
        const strZeros = ( '0' ).repeat( zerosCount )

        return BigInt( strVal.concat( strZeros ) )
    },
    getDifference: ( x, y ) => {
        const x_BN = BigInt( x )
        const y_BN = BigInt( y )

        const ret =  x_BN - y_BN
        //absolute
        return Number( ret < 0n ? -ret : ret )
    }
}

module.exports = {
    testHelper
}
