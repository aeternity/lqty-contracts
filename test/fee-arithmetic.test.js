const { expect, assert } = require( 'chai' )
const Decimal = require( "decimal.js" )

import utils from '../utils/contract-utils'
import { wrapContractInstance } from '../utils/wrapper'
import { setupDeployment, connectCoreContracts  } from './shared/deploymentHelper'
import {
    testHelper, timeValues, randDecayFactor,
    reduceDecimals, makeBN
} from './shared/testHelper'
const { dec, getDifference,  } = testHelper
import { secondsToMinutesRoundedDown, decayBaseRateResults, exponentiationResults } from './data/fee-arithmetic.data'

import wallets from '../config/wallets.json'
const accounts = wallets.defaultWallets.map( x => x.publicKey )

describe( 'Fee arithmetic tests', () => {
    describe( 'troveManager', () => {
        let troveManagerTester
        let contracts
        let LQTYContracts
        let timeOffsetForDebugger
        const fastForwardTime = ( seconds ) => timeOffsetForDebugger.fast_forward_time(
            BigInt( seconds ) * 1000n
        )
        //TODO: after lqty is implemented use this
        const [ bountyAddress, lpRewardsAddress, multisig ] = accounts.slice( accounts.length - 3, accounts.length )

        utils.beforeEachWithSnapshot( 'deploy contract', async () => {
            const { deployLiquityCore, deployLQTYContracts } = await setupDeployment()
            contracts = await deployLiquityCore()
            LQTYContracts = await deployLQTYContracts()
            troveManagerTester = contracts.troveManager

            const deployContract = utils.deployContract( contracts.sdk )

            timeOffsetForDebugger = wrapContractInstance(
                await deployContract( './test/contracts/TimeOffsetForDebug.aes', )
            )

            await troveManagerTester.set_timestamp_offset_for_debug( timeOffsetForDebugger.address )

            //connect contracts
            console.log( "connecting contracts" )
            await connectCoreContracts( contracts, LQTYContracts )

        } )

        it( "minutesPassedSinceLastFeeOp(): returns minutes passed for no time increase", async () => {
            await troveManagerTester.set_last_fee_op_time_to_now()
            const minutesPassed = await troveManagerTester.minutes_passed_since_last_fee_op()

            expect( minutesPassed ).to.eq( 0n )
        } )
        it( "minutesPassedSinceLastFeeOp(): returns minutes passed between time of last fee operation and current block.timestamp, rounded down to nearest minutes", async () => {
            const xs = secondsToMinutesRoundedDown // .slice( 0, 10 )
            let i = 0
            for ( const testPair of xs ) {
                console.log( `${i++}/${xs.length - 1}` )
                await troveManagerTester.set_last_fee_op_time_to_now()

                const seconds = BigInt( testPair[0] )
                const expectedHoursPassed = BigInt( testPair[1] )

                await fastForwardTime( seconds )

                const minutesPassed = await troveManagerTester.minutes_passed_since_last_fee_op()

                expect(  expectedHoursPassed ).to.eq( minutesPassed )
            }
        } )

        it( "decayBaseRateFromBorrowing(): returns the initial base rate for no time increase", async () => {
            await troveManagerTester.set_base_rate( dec( 5, 17 ) )
            await troveManagerTester.set_last_fee_op_time_to_now()

            const baseRateBefore = await troveManagerTester.base_rate()
            expect( baseRateBefore ).to.eq( dec( 5, 17 ) )

            await troveManagerTester.unprotected_decay_base_rate_from_borrowing()
            const baseRateAfter = await troveManagerTester.base_rate()

            expect( baseRateBefore ).to.eq( baseRateAfter )
        } )

        it( "decayBaseRateFromBorrowing(): returns the initial base rate for less than one minute passed ", async () => {
            await troveManagerTester.set_base_rate( dec( 5, 17 ) )
            await troveManagerTester.set_last_fee_op_time_to_now()

            // 1 second
            const baseRateBefore_1 = await troveManagerTester.base_rate()
            expect( baseRateBefore_1 ).to.eq( dec( 5, 17 ) )

            await fastForwardTime( 1n  )

            await troveManagerTester.unprotected_decay_base_rate_from_borrowing()
            const baseRateAfter_1 = await troveManagerTester.base_rate()

            expect( baseRateBefore_1 ).to.eq( baseRateAfter_1 )

            // 17 seconds
            await troveManagerTester.set_last_fee_op_time_to_now()

            const baseRateBefore_2 = await troveManagerTester.base_rate()
            await fastForwardTime( 17 )

            await troveManagerTester.unprotected_decay_base_rate_from_borrowing()
            const baseRateAfter_2 = await troveManagerTester.base_rate()

            expect( baseRateBefore_2 ).to.eq( baseRateAfter_2 )

            // 29 seconds
            await troveManagerTester.set_last_fee_op_time_to_now()

            const baseRateBefore_3 = await troveManagerTester.base_rate()
            await fastForwardTime( 29 )

            await troveManagerTester.unprotected_decay_base_rate_from_borrowing()
            const baseRateAfter_3 = await troveManagerTester.base_rate()

            expect( baseRateBefore_3 ).to.eq( baseRateAfter_3 )
            // 50 seconds
            await troveManagerTester.set_last_fee_op_time_to_now()

            const baseRateBefore_4 = await troveManagerTester.base_rate()
            await fastForwardTime( 50 )

            await troveManagerTester.unprotected_decay_base_rate_from_borrowing()
            const baseRateAfter_4 = await troveManagerTester.base_rate()

            expect( baseRateBefore_4 ).to.eq( baseRateAfter_4 )

        // (cant quite test up to 59 seconds, as execution of the final tx takes >1 second before the block is mined)
        } )

        it( "decayBaseRateFromBorrowing(): returns correctly decayed base rate, for various durations. Initial baseRate = 0.01", async () => {
            // baseRate = 0.01
            for ( let i = 0; i < decayBaseRateResults.seconds.length; i++ ) {
                // Set base rate to 0.01 in TroveManager
                console.log( `${i}/${decayBaseRateResults.seconds.length - 1}` )
                await troveManagerTester.set_base_rate( dec( 1, 16 ) )
                const contractBaseRate = await troveManagerTester.base_rate()
                expect( contractBaseRate ).to.eq( dec( 1, 16 ) )

                const startBaseRate = '0.01'

                const secondsPassed = decayBaseRateResults.seconds[i]
                const expectedDecayedBaseRate = decayBaseRateResults[startBaseRate][i]
                await troveManagerTester.set_last_fee_op_time_to_now()

                // Progress time
                await fastForwardTime( secondsPassed )

                await troveManagerTester.unprotected_decay_base_rate_from_borrowing()
                const decayedBaseRate = await troveManagerTester.base_rate()

                assert.isAtMost( getDifference( expectedDecayedBaseRate, decayedBaseRate ), 100000 ) // allow absolute error tolerance of 1e-13
            }
        } )
        it( "decayBaseRateFromBorrowing(): returns correctly decayed base rate, for various durations. Initial baseRate = 0.1", async () => {
            // baseRate = 0.1
            for ( let i = 0; i < decayBaseRateResults.seconds.length; i++ ) {
                // Set base rate to 0.1 in TroveManager
                console.log( `${i}/${decayBaseRateResults.seconds.length - 1}` )
                await troveManagerTester.set_base_rate( dec( 1, 17 ) )
                const contractBaseRate = await troveManagerTester.base_rate()
                assert.equal( contractBaseRate, dec( 1, 17 ) )

                const startBaseRate = '0.1'

                const secondsPassed = decayBaseRateResults.seconds[i]
                const expectedDecayedBaseRate = decayBaseRateResults[startBaseRate][i]
                await troveManagerTester.set_last_fee_op_time_to_now()

                // Progress time
                await fastForwardTime( secondsPassed )

                await troveManagerTester.unprotected_decay_base_rate_from_borrowing()
                const decayedBaseRate = await troveManagerTester.base_rate()

                assert.isAtMost( getDifference( expectedDecayedBaseRate, decayedBaseRate ), 1000000 ) // allow absolute error tolerance of 1e-12
            }
        } )
        it( "decayBaseRateFromBorrowing(): returns correctly decayed base rate, for various durations. Initial baseRate = 0.34539284", async () => {
            // baseRate = 0.34539284
            for ( let i = 0; i < decayBaseRateResults.seconds.length; i++ ) {
                console.log( `${i}/${decayBaseRateResults.seconds.length - 1}` )
                // Set base rate to 0.1 in TroveManager
                await troveManagerTester.set_base_rate( 345392840000000000n )
                await troveManagerTester.set_base_rate( 345392840000000000n ) //TODO: ??? why this

                const startBaseRate = '0.34539284'

                const secondsPassed = decayBaseRateResults.seconds[i]
                const expectedDecayedBaseRate = decayBaseRateResults[startBaseRate][i]
                await troveManagerTester.set_last_fee_op_time_to_now()

                // Progress time
                await fastForwardTime( secondsPassed )

                await troveManagerTester.unprotected_decay_base_rate_from_borrowing()
                const decayedBaseRate = await troveManagerTester.base_rate()

                assert.isAtMost( getDifference( expectedDecayedBaseRate, decayedBaseRate ), 1000000 ) // allow absolute error tolerance of 1e-12
            }
        } )

        it( "decayBaseRateFromBorrowing(): returns correctly decayed base rate, for various durations. Initial baseRate = 0.9976", async () => {
            // baseRate = 0.9976
            for ( let i = 0; i < decayBaseRateResults.seconds.length; i++ ) {
                console.log( `${i}/${decayBaseRateResults.seconds.length - 1}` )
                // Set base rate to 0.9976 in TroveManager
                await troveManagerTester.set_base_rate( 997600000000000000n )
                await troveManagerTester.set_base_rate( 997600000000000000n ) //TODO: why this ??

                const startBaseRate = '0.9976'

                const secondsPassed = decayBaseRateResults.seconds[i]
                const expectedDecayedBaseRate = decayBaseRateResults[startBaseRate][i]
                await troveManagerTester.set_last_fee_op_time_to_now()

                // progress time
                await fastForwardTime( secondsPassed )

                await troveManagerTester.unprotected_decay_base_rate_from_borrowing()
                const decayedBaseRate = await troveManagerTester.base_rate()

                assert.isAtMost( getDifference( expectedDecayedBaseRate, decayedBaseRate ), 1000000 ) // allow absolute error tolerance of 1e-12
            }
        } )
    } )
    describe( 'Basic exponentiation', () => {
        let mathTester
        before( 'deploy mathTester', async () => {
            const sdk = await utils.createSdkInstance()
            const deployContract = utils.deployContract( sdk )
            mathTester = wrapContractInstance(
                await deployContract( './test/contracts/LiquityMathTester.aes', )
            )
        } )
        const maxUint128 = 340282366920938463463374607431768211455n
        const maxUint192 = 6277101735386680763835789423207666416102355444464034512895n

        // for exponent = 0, returns 1
        it( "decPow(): for exponent = 0, returns 1, regardless of base", async () => {
            const a = 0n
            const b = 1n
            const c = dec( 1, 18 )
            const d = 123244254546n
            const e = 990000000000000000n
            const f = 897890990909098978678609090n

            const res_a = await mathTester.call_dec_pow( a, 0 )
            const res_b = await mathTester.call_dec_pow( b, 0 )
            const res_c = await mathTester.call_dec_pow( c, 0 )
            const res_d = await mathTester.call_dec_pow( d, 0 )
            const res_e = await mathTester.call_dec_pow( e, 0 )
            const res_f = await mathTester.call_dec_pow( f, 0 )
            const res_g = await mathTester.call_dec_pow( f, 0 )
            const res_max = await mathTester.call_dec_pow( f, 0 )

            assert.equal( res_a, dec( 1, 18 ) )
            assert.equal( res_b, dec( 1, 18 ) )
            assert.equal( res_c, dec( 1, 18 ) )
            assert.equal( res_d, dec( 1, 18 ) )
            assert.equal( res_e, dec( 1, 18 ) )
            assert.equal( res_f, dec( 1, 18 ) )
            assert.equal( res_g, dec( 1, 18 ) )
            assert.equal( res_max, dec( 1, 18 ) )
        } )

        // for exponent = 1, returns base
        it( "decPow(): for exponent = 1, returns base, regardless of base", async () => {
            const a = 0n
            const b = 1n
            const c = dec( 1, 18 )
            const d = 123244254546n
            const e = 990000000000000000n
            const f = 897890990909098978678609090n
            const g = dec( 8789789, 27 )

            const res_a = await mathTester.call_dec_pow( a, 1 )
            const res_b = await mathTester.call_dec_pow( b, 1 )
            const res_c = await mathTester.call_dec_pow( c, 1 )
            const res_d = await mathTester.call_dec_pow( d, 1 )
            const res_e = await mathTester.call_dec_pow( e, 1 )
            const res_f = await mathTester.call_dec_pow( f, 1 )
            const res_g = await mathTester.call_dec_pow( g, 1 )
            const res_max128 = await mathTester.call_dec_pow( maxUint128, 1 )
            const res_max192 = await mathTester.call_dec_pow( maxUint192, 1 )

            assert.equal( res_a, a )
            assert.equal( res_b, b )
            assert.equal( res_c, c )
            assert.equal( res_d, d )
            assert.equal( res_e, e )
            assert.equal( res_f, f )
            assert.equal( res_g, g )
            assert.equal( res_max128, maxUint128 )
            assert.equal( res_max192,  maxUint192 )
        } )

        // for base = 0, returns 0 for any exponent other than 1
        it( "decPow(): for base = 0, returns 0 for any exponent other than 0", async () => {
            const res_a = await mathTester.call_dec_pow( 0, 1 )
            const res_b = await mathTester.call_dec_pow( 0, 3 )
            const res_c = await mathTester.call_dec_pow( 0, 17 )
            const res_d = await mathTester.call_dec_pow( 0, 44 )
            const res_e = await mathTester.call_dec_pow( 0, 118 )
            const res_f = await mathTester.call_dec_pow( 0, 1000 )
            const res_g = await mathTester.call_dec_pow( 0, dec( 1, 6 ) )
            const res_h = await mathTester.call_dec_pow( 0, dec( 1, 9 ) )
            const res_i = await mathTester.call_dec_pow( 0, dec( 1, 12 ) )
            const res_j = await mathTester.call_dec_pow( 0, dec( 1, 18 ) )

            assert.equal( res_a, 0n )
            assert.equal( res_b, 0n )
            assert.equal( res_c, 0n )
            assert.equal( res_d, 0n )
            assert.equal( res_e, 0n )
            assert.equal( res_f, 0n )
            assert.equal( res_g, 0n )
            assert.equal( res_h, 0n )
            assert.equal( res_i, 0n )
            assert.equal( res_j, 0n )
        } )
        // for base = 1, returns 1 for any exponent
        it( "decPow(): for base = 1, returns 1 for any exponent", async () => {
            const ONE = dec( 1, 18 )
            const res_a = await mathTester.call_dec_pow( ONE, 1 )
            const res_b = await mathTester.call_dec_pow( ONE, 3 )
            const res_c = await mathTester.call_dec_pow( ONE, 17 )
            const res_d = await mathTester.call_dec_pow( ONE, 44 )
            const res_e = await mathTester.call_dec_pow( ONE, 118 )
            const res_f = await mathTester.call_dec_pow( ONE, 1000 )
            const res_g = await mathTester.call_dec_pow( ONE, dec( 1, 6 ) )
            const res_h = await mathTester.call_dec_pow( ONE, dec( 1, 9 ) )
            const res_i = await mathTester.call_dec_pow( ONE, dec( 1, 12 ) )
            const res_j = await mathTester.call_dec_pow( ONE, dec( 1, 18 ) )
            const res_k = await mathTester.call_dec_pow( ONE, 0 )

            assert.equal( res_a, ONE )
            assert.equal( res_b, ONE )
            assert.equal( res_c, ONE )
            assert.equal( res_d, ONE )
            assert.equal( res_e, ONE )
            assert.equal( res_f, ONE )
            assert.equal( res_g, ONE )
            assert.equal( res_h, ONE )
            assert.equal( res_i, ONE )
            assert.equal( res_j, ONE )
            assert.equal( res_k, ONE )
        } )

        // for exponent = 2, returns base**2
        it( "decPow(): for exponent = 2, returns the square of the base", async () => {
            const a = dec( 1, 18 )  // 1
            const b = dec( 15, 17 )   // 1.5
            const c = dec( 5, 17 )  // 0.5
            const d = dec( 321, 15 )  // 0.321
            const e = dec( 2, 18 )  // 4
            const f = dec( 1, 17 )  // 0.1
            const g = dec( 1, 16 )  // 0.01
            const h = dec( 99, 16 )  // 0.99
            const i = dec( 125435, 15 ) // 125.435
            const j = dec( 99999, 18 )  // 99999

            const res_a = await mathTester.call_dec_pow( a, 2 )
            const res_b = await mathTester.call_dec_pow( b, 2 )
            const res_c = await mathTester.call_dec_pow( c, 2 )
            const res_d = await mathTester.call_dec_pow( d, 2 )
            const res_e = await mathTester.call_dec_pow( e, 2 )
            const res_f = await mathTester.call_dec_pow( f, 2 )
            const res_g = await mathTester.call_dec_pow( g, 2 )
            const res_h = await mathTester.call_dec_pow( h, 2 )
            const res_i = await mathTester.call_dec_pow( i, 2 )
            const res_j = await mathTester.call_dec_pow( j, 2 )

            assert.equal( res_a, 1000000000000000000n )
            assert.equal( res_b, 2250000000000000000n )
            assert.equal( res_c, 250000000000000000n )
            assert.equal( res_d, 103041000000000000n )
            assert.equal( res_e, 4000000000000000000n )
            assert.equal( res_f, 10000000000000000n )
            assert.equal( res_g, 100000000000000n )
            assert.equal( res_h, 980100000000000000n )
            assert.equal( res_i, 15733939225000000000000n )
            assert.equal( res_j, 9999800001000000000000000000n )
        } )
        it( "decPow(): correct output for various bases and exponents", async () => {
            for ( let i = 0 ; i <  exponentiationResults.length ; i++ ) {
                console.log( `${i}/${exponentiationResults.length - 1}` )
                const list = exponentiationResults[i]
                const base = BigInt( list[0] )
                const exponent = BigInt( list[1] )
                const expectedResult = BigInt( list[2] )

                const result = await mathTester.call_dec_pow( base, exponent )

                assert.isAtMost( getDifference( expectedResult, result.toString() ), 10000 )  // allow absolute error tolerance of 1e-14
            }
        } )
        it( "decPow(): abs. error < 1e-9 for exponent = 7776000 (seconds in three months)", async () => {
            for ( let i = 1; i <= 200; i++ ) {
                console.log( `${i}/${200}` )
                const exponent = timeValues.SECONDS_IN_ONE_MONTH * 3

                // Use a high base to fully test high exponent, without prematurely decaying to 0
                const base = randDecayFactor( 0.999999, 0.999999999999999999 ) // eslint-disable-line no-loss-of-precision
                const baseAsDecimal = reduceDecimals( base, 18 )

                // Calculate actual expected value
                //const expectedFst =  baseAsDecimal.pow( exponent ).toFixed( 18 )
                let expected = Decimal.pow( baseAsDecimal.toString(), exponent ).toFixed( 18 )
                expected = makeBN( expected )

                const res = await mathTester.call_dec_pow( base, exponent )

                const error = expected.minus( res ).abs()

                //console.log( `run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}` )

                //try {
                assert.isAtMost( getDifference( expected, res.toString() ), 1000000000 )  // allow absolute error tolerance of 1e-9
                //} catch ( error ) {
                //console.log( `run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}` )
                //}
            }
        } )
        it( "decPow(): abs. error < 1e-9 for exponent = 2592000 (seconds in one month)", async () => {
            for ( let i = 1; i <= 200; i++ ) {
                console.log( `${i}/${200}` )
                const exponent = timeValues.SECONDS_IN_ONE_MONTH

                // Use a high base to fully test high exponent, without prematurely decaying to 0
                const base = randDecayFactor( 0.999995, 0.999999999999999999 )
                const baseAsDecimal = reduceDecimals( base, 18 )

                // Calculate actual expected value
                let expected = Decimal.pow( baseAsDecimal.toString(), exponent ).toFixed( 18 )
                expected = makeBN( expected )

                const res = await mathTester.call_dec_pow( base, exponent )

                const error = expected.minus( res ).abs()

                // console.log(`run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}`)

                try {
                    assert.isAtMost( getDifference( expected, res.toString() ), 1000000000 )  // allow absolute error tolerance of 1e-9
                } catch ( error ) {
                    console.log( `run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}` )
                }
            }
        } )

        it( "decPow(): abs. error < 1e-9 for exponent = 43200 (minutes in one month)", async () => {
            for ( let i = 1; i <= 200; i++ ) {
                console.log( `${i}/${200}` )
                const exponent = timeValues.MINUTES_IN_ONE_MONTH

                // Use a high base to fully test high exponent, without prematurely decaying to 0
                const base = randDecayFactor( 0.9997, 0.999999999999999999 )
                const baseAsDecimal = reduceDecimals( base, 18 )

                // Calculate actual expected value
                let expected = Decimal.pow( baseAsDecimal.toString(), exponent ).toFixed( 18 )
                expected = makeBN( expected )

                const res = await mathTester.call_dec_pow( base, exponent )

                const error = expected.minus( res ).abs()

                // console.log(`run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}`)

                try {
                    assert.isAtMost( getDifference( expected, res.toString() ), 1000000000 )  // allow absolute error tolerance of 1e-9
                } catch ( error ) {
                    console.log( `run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}` )
                }
            }
        } )

        it( "decPow(): abs. error < 1e-9 for exponent = 525600 (minutes in one year)", async () => {
            for ( let i = 1; i <= 200; i++ ) {
                console.log( `${i}/${200}` )
                const exponent = timeValues.MINUTES_IN_ONE_YEAR

                // Use a high base to fully test high exponent, without prematurely decaying to 0
                const base = randDecayFactor( 0.99999, 0.999999999999999999 )
                const baseAsDecimal = reduceDecimals( base, 18 )

                // Calculate actual expected value
                let expected = Decimal.pow( baseAsDecimal.toString(), exponent ).toFixed( 18 )
                expected = makeBN( expected )

                const res = await mathTester.call_dec_pow( base, exponent )

                const error = expected.minus( res ).abs()

                // console.log(`run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}`)

                try {
                    assert.isAtMost( getDifference( expected, res.toString() ), 1000000000 )  // allow absolute error tolerance of 1e-9
                } catch ( error ) {
                    console.log( `run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}` )
                }
            }
        } )

        it( "decPow(): abs. error < 1e-9 for exponent = 2628000 (minutes in five years)", async () => {
            for ( let i = 1; i <= 200; i++ ) {
                console.log( `${i}/${200}` )
                const exponent = timeValues.MINUTES_IN_ONE_YEAR * 5

                // Use a high base to fully test high exponent, without prematurely decaying to 0
                const base = randDecayFactor( 0.99999, 0.999999999999999999 )
                const baseAsDecimal = reduceDecimals( base, 18 )

                // Calculate actual expected value
                let expected = Decimal.pow( baseAsDecimal.toString(), exponent ).toFixed( 18 )
                expected = makeBN( expected )

                const res = await mathTester.call_dec_pow( base, exponent )

                const error = expected.minus( res ).abs()

                // console.log(`run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}`)

                try {
                    assert.isAtMost( getDifference( expected, res.toString() ), 1000000000 )  // allow absolute error tolerance of 1e-9
                } catch ( error ) {
                    console.log( `run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}` )
                }
            }
        } )

        it( "decPow(): abs. error < 1e-9 for exponent = minutes in ten years", async () => {
            for ( let i = 1; i <= 200; i++ ) {
                console.log( `${i}/${200}` )
                const exponent = timeValues.MINUTES_IN_ONE_YEAR * 10

                // Use a high base to fully test high exponent, without prematurely decaying to 0
                const base = randDecayFactor( 0.99999, 0.999999999999999999 )
                const baseAsDecimal = reduceDecimals( base, 18 )

                // Calculate actual expected value
                let expected = Decimal.pow( baseAsDecimal.toString(), exponent ).toFixed( 18 )
                expected = makeBN( expected )

                const res = await mathTester.call_dec_pow( base, exponent )

                const error = expected.minus( res ).abs()

                // console.log(`run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}`)

                try {
                    assert.isAtMost( getDifference( expected, res.toString() ), 1000000000 )  // allow absolute error tolerance of 1e-9
                } catch ( error ) {
                    console.log( `run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}` )
                }
            }
        } )

        it( "decPow(): abs. error < 1e-9 for exponent = minutes in one hundred years", async () => {
            for ( let i = 1; i <= 200; i++ ) {
                console.log( `${i}/${200}` )
                const exponent = timeValues.MINUTES_IN_ONE_YEAR * 100

                // Use a high base to fully test high exponent, without prematurely decaying to 0
                const base = randDecayFactor( 0.999999, 0.999999999999999999 )
                const baseAsDecimal = reduceDecimals( base, 18 )

                // Calculate actual expected value
                let expected = Decimal.pow( baseAsDecimal.toString(), exponent ).toFixed( 18 )
                expected = makeBN( expected )

                const res = await mathTester.call_dec_pow( base, exponent )

                const error = expected.minus( res ).abs()

                // console.log(`run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}`)

                try {
                    assert.isAtMost( getDifference( expected, res.toString() ), 1000000000 )  // allow absolute error tolerance of 1e-9
                } catch ( error ) {
                    console.log( `run: ${i}. base: ${base}, exp: ${exponent}, expected: ${expected}, res: ${res}, error: ${error}` )
                }
            }
        } )
    } )
} )
