const BigNumber = require( 'bignumber.js' )
const Decimal = require( "decimal.js" )
const testHelper =  {

    dec: ( val, scale ) => {
        //TODO: don't think we need finney this
        const zerosCount = scale == 'ae' ? 18 : scale == 'finney'  ? 15 : scale
        const strVal = val.toString()
        const strZeros = ( '0' ).repeat( zerosCount )

        return BigInt( strVal.concat( strZeros ) )
    },
    getDifference: ( x, y ) => {
        const x_BN = BigInt( x.toString() )
        const y_BN = BigInt( y.toString() )

        const ret =  x_BN - y_BN
        //absolute
        return Number( ret < 0n ? -ret : ret )
    },
}
const makeBN = ( num, precision ) => {
    const strNum = num.toString()

    checkOnlyNumericChars( strNum )

    const intPart = strNum.split( "." )[0]
    const fractionPart = strNum.includes( "." ) ? strNum.split( "." )[1] : ""

    if ( fractionPart.length > precision ) {
        throw new Error( `MakeBN: argument must have <= ${precision} decimal places` )
    }

    const trailingZeros = "0".repeat( precision - fractionPart.length )
    const bigNumArg = intPart + fractionPart + trailingZeros
    return BigNumber( bigNumArg, 10 )
}
const checkOnlyNumericChars = ( input ) => {
    try {
        const num = new Decimal( input )
    } catch ( err ) {
        throw new Error( `MakeBN: input must be number or string-ified number, no non-numeric characters` )
    }
}

export const reduceDecimals = ( val, decimals ) => BigNumber( val ).shiftedBy( -decimals )
const randDecayFactor = ( min, max ) => {
    const amount = Math.random() * ( max - min ) + min
    return  expandDecimals( amount.toFixed( 18 ), 18 )
}
const expandDecimals = ( val, decimals ) => BigInt(
    BigNumber( val ).shiftedBy( decimals ).toFixed( 0 ),
)

const timeValues = {
    SECONDS_IN_ONE_MINUTE : 60,
    SECONDS_IN_ONE_HOUR   : 60 * 60,
    SECONDS_IN_ONE_DAY    : 60 * 60 * 24,
    SECONDS_IN_ONE_WEEK   : 60 * 60 * 24 * 7,
    SECONDS_IN_SIX_WEEKS  : 60 * 60 * 24 * 7 * 6,
    SECONDS_IN_ONE_MONTH  : 60 * 60 * 24 * 30,
    SECONDS_IN_ONE_YEAR   : 60 * 60 * 24 * 365,
    MINUTES_IN_ONE_WEEK   : 60 * 24 * 7,
    MINUTES_IN_ONE_MONTH  : 60 * 24 * 30,
    MINUTES_IN_ONE_YEAR   : 60 * 24 * 365
}
module.exports = {
    randDecayFactor,
    expandDecimals,
    reduceDecimals,
    testHelper,
    timeValues,
    makeBN,
}
