const bn = require( 'bignumber.js' )
const { expect, assert } = require( 'chai' )
const { exec : execP } = require( "child_process" )
import { emits } from './events'

function expandTo18Dec( n ) {
    return BigInt( n ) * 1000000000000000000n // BigInt( n ) * ( 10n ** 18n )
}

bn.config( { EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 } )

function encodePrice( reserve0, reserve1 ) {
    const _2_pow_112 = 5192296858534827628530496329220096n
    return [
        ( BigInt( reserve1 ) * _2_pow_112 ) / BigInt( reserve0 ), // reserve1.mul( BigNumber.from( 2 ).pow( 112 ) ).div( reserve0 ),
        ( BigInt( reserve0 ) * _2_pow_112 ) / BigInt( reserve1 ), // reserve0.mul( BigNumber.from( 2 ).pow( 112 ) ).div( reserve1 )
    ]
}

const expectToRevert = async ( f, msg ) => {
    try {
        await f()
        assert.fail( 'didn\'t fail' )
    } catch ( err ) {
        expect( err.message ).to.includes( msg )
    }
}

const exec = ( cmd ) => {
    return new Promise( ( resolve, reject ) => {
        execP( cmd, ( error, stdout, stderr ) => {
            if ( error ) {
                reject( error )
                return
            }
            if ( stderr ) {
                console.log( `stderr: ${stderr}` )
                reject( stderr )
                return
            }
            resolve( stdout )
        } )
    } )
}

const events = ( tests ) => {
    return {
        events: ( xs ) => tests.events( {
            tail : xs,
            head : null,
        } )
    }
}
module.exports = {
    exec,
    expectToRevert,
    expandTo18Dec,
    encodePrice,
    emits,
    events,
}

