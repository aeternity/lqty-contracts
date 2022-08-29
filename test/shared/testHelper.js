const testHelper =  {

    dec( val, scale ) {
        //TODO: don't think we need finney this
        const zerosCount = scale == 'ae' ? 18 : scale == 'finney'  ? 15 : scale 
        const strVal = val.toString()
        const strZeros = ( '0' ).repeat( zerosCount )

        return BigInt( strVal.concat( strZeros ) )
    }
}

module.exports = {
    testHelper
}
