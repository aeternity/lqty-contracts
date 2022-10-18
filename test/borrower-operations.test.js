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

describe( 'Borrower Operations', () => {
    describe( 'Borrower Operations Tests ...', () => {
        let contracts
        let LQTYContracts
        let timeOffsetForDebugger

	const getOpenTroveLUSDAmount = async (totalDebt) => testHelper.getOpenTroveLUSDAmount(contracts, totalDebt)
	const getNetBorrowingAmount = async (debtWithFee) => testHelper.getNetBorrowingAmount(contracts, debtWithFee)
	const getActualDebtFromComposite = async (compositeDebt) => testHelper.getActualDebtFromComposite(compositeDebt, contracts)
	const openTrove = async (params) => testHelper.openTrove(contracts, params)
	const getTroveEntireColl = async (trove) => testHelper.getTroveEntireColl(contracts, trove)
	const getTroveEntireDebt = async (trove) => testHelper.getTroveEntireDebt(contracts, trove)
	const getTroveStake = async (trove) => testHelper.getTroveStake(contracts, trove)

	let LUSD_GAS_COMPENSATION
	let MIN_NET_DEBT
	let BORROWING_FEE_FLOOR
	
        const fastForwardTime = async ( seconds ) => timeOffsetForDebugger.fast_forward_time(
            BigInt( seconds ) * 1000n
        )

        const getTimestampOffset = async (  ) => BigInt(await timeOffsetForDebugger.get_timestamp_offset()) * 1000n
	
        const [ AAddress, BAddress, CAddress, DAddress, EAddress, bobAddress, aliceAddress, bountyAddress, lpRewardsAddress, multisigAddress ] = accounts.slice( accounts.length - 10, accounts.length )

	let bob
	let alice
	let A
	let B
	let C
	let D
	let E
	let multisig
	
        utils.beforeEachWithSnapshot( 'deploy contract', async () => {
            const { deployLiquityCore, deployLQTYContracts } = await setupDeployment()
            contracts = await deployLiquityCore()
            LQTYContracts = await deployLQTYContracts( bountyAddress, lpRewardsAddress, multisigAddress )

            const deployContract = utils.deployContract( contracts.sdk )

            timeOffsetForDebugger = wrapContractInstance(
                await deployContract( './test/contracts/TimeOffsetForDebug.aes', )
            )

            await contracts.troveManager.set_timestamp_offset_for_debug( timeOffsetForDebugger.address )	    

            //connect contracts
            console.log( "connecting contracts" )
            await connectCoreContracts( contracts, LQTYContracts )

	    LUSD_GAS_COMPENSATION = await contracts.borrowerOperations.aeusd_gas_compensation() 
	    MIN_NET_DEBT = await contracts.borrowerOperations.min_net_debt()
	    BORROWING_FEE_FLOOR = await contracts.borrowerOperations.borrowing_fee_floor()

	    bob = contracts.sdk.accounts[bobAddress]
	    alice = contracts.sdk.accounts[aliceAddress]
	    A = contracts.sdk.accounts[AAddress]
	    B = contracts.sdk.accounts[BAddress]
	    C = contracts.sdk.accounts[CAddress]
	    D = contracts.sdk.accounts[DAddress]
	    E = contracts.sdk.accounts[EAddress]
	    multisig = contracts.sdk.accounts[multisigAddress]
        } )

        // it( "Open trove", async () => {
        //     const name = await contracts.borrowerOperations.name()
        //     //const sortedTroves = await borrowerOperations.sorted_troves()


	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: bob } })

        //     // await borrowerOperations.open_trove(
        //     //     5000000000000000,
        //     //     1800000000000000000000,
        //     //     bountyAddress,
        //     //     bountyAddress,
        //     //     { onAccount: theAccount, amount: 500000000000 }
        //     // )

        //     //await borrowerOperations.add_coll( bountyAddress, bountyAddress, { onAccount: theAccount, amount: 500000000000 } )

        //     expect( name ).to.eq( 'BorrowerOperations' )
        // } )

	// // --- addColl() ---

	// it("addColl(): reverts when top-up would leave trove with ICR < MCR", async () => {
	//     // alice creates a Trove and adds first collateral
	//     await openTrove({ ICR: testHelper.dec(2, 18) , extraParams: { onAccount: alice }})
	//     await openTrove({ ICR: testHelper.dec(10, 18), extraParams: { onAccount: bob   }})

	//     const price0 = await contracts.priceFeedTestnet.get_price()
	//     console.log('price0:' + price0)t
	    
	//     // Price drops
	//     await contracts.priceFeedTestnet.set_price(testHelper.dec(100, 18))
	//     const price = await contracts.priceFeedTestnet.get_price()

	//     console.log('price :' + price)
	    
	//     assert.isFalse(await contracts.troveManager.check_recovery_mode(price))
	//     assert.isTrue((await contracts.troveManager.get_current_icr(alice_, price)) < (testHelper.dec(110, 16)))

	//     const collTopUp = 1  // 1 wei top up

	//     contracts.borrowerOperations.add_coll(alice_, alice_, { onAccount: alice, amount: collTopUp })
	//     //await testHelper.assertRevert(contracts.borrowerOperations.add_coll(alice_, alice_, { onAccount: alice, amount: collTopUp }), 
	//     //				  "BorrowerOps: An operation that would result in ICR < MCR is not permitted")
	// })


	// --- openTrove() ---
	it("openTrove(): emits a TroveUpdated event with the correct collateral and debt", async () => {

	    const txA = (await openTrove({ extraLUSDAmount: testHelper.dec(15000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })).tx
	    const txB = (await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })).tx
	    const txC = (await openTrove({ extraLUSDAmount: testHelper.dec(3000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })).tx

	    //console.log(txA.tx)

	    const A_Coll = await getTroveEntireColl(AAddress)
            const B_Coll = await getTroveEntireColl(BAddress)
            const C_Coll = await getTroveEntireColl(CAddress)
            const A_Debt = await getTroveEntireDebt(AAddress)
            const B_Debt = await getTroveEntireDebt(BAddress)
            const C_Debt = await getTroveEntireDebt(CAddress)

	    const A_emittedDebt = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txA, "TroveUpdated", 1), 1))
            const A_emittedColl = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txA, "TroveUpdated", 1), 2))
	    const B_emittedDebt = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txB, "TroveUpdated", 1), 1))
            const B_emittedColl = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txB, "TroveUpdated", 1), 2))
	    const C_emittedDebt = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txC, "TroveUpdated", 1), 1))
            const C_emittedColl = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txC, "TroveUpdated", 1), 2))

            // Check emitted debt values are correct
            assert.isTrue(A_Debt == A_emittedDebt)
            assert.isTrue(B_Debt == B_emittedDebt)
            assert.isTrue(C_Debt == C_emittedDebt)

	    // Check emitted coll values are correct
            assert.isTrue(A_Coll == A_emittedColl)
            assert.isTrue(B_Coll == B_emittedColl)
            assert.isTrue(C_Coll == C_emittedColl)

	    const baseRateBefore = await contracts.troveManager.base_rate()

	    // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
            await contracts.troveManager.set_last_fee_op_time_to_now()

            assert.isTrue((await contracts.troveManager.base_rate()) > baseRateBefore)

	    const txD = (await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })).tx
            const txE = (await openTrove({ extraLUSDAmount: testHelper.dec(3000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: E } })).tx
            const D_Coll = await getTroveEntireColl(DAddress)
            const E_Coll = await getTroveEntireColl(EAddress)
            const D_Debt = await getTroveEntireDebt(DAddress)
            const E_Debt = await getTroveEntireDebt(EAddress)

	    const D_emittedDebt = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txD, "TroveUpdated", 1), 1))
            const D_emittedColl = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txD, "TroveUpdated", 1), 2))
	    const E_emittedDebt = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txE, "TroveUpdated", 1), 1))
            const E_emittedColl = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txE, "TroveUpdated", 1), 2))
	    
            // Check emitted debt values are correct
            assert.isTrue(D_Debt == D_emittedDebt)
            assert.isTrue(E_Debt == E_emittedDebt)

            // Check emitted coll values are correct
            assert.isTrue(D_Coll == D_emittedColl)
            assert.isTrue(E_Coll == E_emittedColl)
	})
	

	it("openTrove(): Opens a trove with net debt >= minimum net debt", async () => {
	    const txA = await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, await getNetBorrowingAmount(MIN_NET_DEBT + BigInt(1)), AAddress, AAddress, { onAccount: A, amount: testHelper.dec(100, 30) })
            assert.equal(txA.result.returnType, 'ok')
	    assert.isTrue(await contracts.sortedTroves.contains(AAddress))
	    
	    const txC = await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, await getNetBorrowingAmount(MIN_NET_DEBT + BigInt(testHelper.dec(47789898, 22))), CAddress, CAddress, { onAccount: C, amount: testHelper.dec(100, 30) })
            assert.equal(txC.result.returnType, 'ok')
	    assert.isTrue(await contracts.sortedTroves.contains(CAddress))
	})

	it("openTrove(): reverts if net debt < minimum net debt", async () => {
	    const txAPromise = contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, 0, AAddress, AAddress, { onAccount: A, amount: testHelper.dec(100, 30) })
	    await testHelper.assertRevert(txAPromise, "division by zero")

	    const txBPromise = contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, await getNetBorrowingAmount(MIN_NET_DEBT - BigInt(1)), BAddress, BAddress, { onAccount: B, amount: testHelper.dec(100, 30) })
	    await testHelper.assertRevert(txBPromise, "net debt must be greater than minimum")

	    const txCPromise = contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, MIN_NET_DEBT - BigInt(testHelper.dec(173, 18)), CAddress, CAddress, { onAccount: C, amount: testHelper.dec(100, 30) })
	    await testHelper.assertRevert(txCPromise, "net debt must be greater than minimum")
	})

	it("openTrove(): decays a non-zero base rate", async () => {
	    await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: bob } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	    // Artificially make baseRate 5%
	    await contracts.troveManager.set_base_rate(dec(5, 16))
	    await contracts.troveManager.set_last_fee_op_time_to_now()

	    // Check baseRate is now non-zero
	    const baseRate_1 = await contracts.troveManager.base_rate()
	    assert.isTrue(baseRate_1 > BigInt(0))

	    // 2 hours pass
	    await fastForwardTime(7200)

	    // D opens trove 
	    await openTrove({ extraLUSDAmount: testHelper.dec(37, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })

	    // Check baseRate has decreased
	    const baseRate_2 = await contracts.troveManager.base_rate()
	    assert.isTrue(baseRate_2 < baseRate_1)

	    // 1 hour passes
	    await fastForwardTime(3600)

	    // E opens trove 
	    await openTrove({ extraLUSDAmount: testHelper.dec(12, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: E } })

	    const baseRate_3 = await contracts.troveManager.base_rate()
	    assert.isTrue(baseRate_3 < baseRate_2)
	})

	it("openTrove(): doesn't change base rate if it is already zero", async () => {
	    await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: bob } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	    // Check baseRate is zero
	    const baseRate_1 = await contracts.troveManager.base_rate()
	    assert.equal(baseRate_1, '0')

	    // 2 hours pass
	    await fastForwardTime(7200)

	    // D opens trove 
	    await openTrove({ extraLUSDAmount: testHelper.dec(37, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })

	    // Check baseRate is still 0
	    const baseRate_2 = await contracts.troveManager.base_rate()
	    assert.equal(baseRate_2, '0')

	    // 1 hour passes
	    await fastForwardTime(3600)

	    // E opens trove 
	    await openTrove({ extraLUSDAmount: testHelper.dec(12, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: E } })

	    const baseRate_3 = await contracts.troveManager.base_rate()
	    assert.equal(baseRate_3, '0')
	})

	it("openTrove(): lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
	    await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: bob } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	    // Artificially make baseRate 5%
	    await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	    await contracts.troveManager.set_last_fee_op_time_to_now()

	    // Check baseRate is now non-zero
	    const baseRate_1 = await contracts.troveManager.base_rate()
	    assert.isTrue(baseRate_1 > 0)

	    const lastFeeOpTime_1 = await contracts.troveManager.get_last_fee_operation_time()

	    // Borrower D triggers a fee
	    await openTrove({ extraLUSDAmount: testHelper.dec(1, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })

	    const lastFeeOpTime_2 = await contracts.troveManager.get_last_fee_operation_time()

	    // Check that the last fee operation time did not update, as borrower D's debt issuance occured
	    // since before minimum interval had passed 
	    assert.isTrue(lastFeeOpTime_2 == lastFeeOpTime_1)

	    // 1 minute passes
	    await fastForwardTime(60)

	    // Check that now, at least one minute has passed since lastFeeOpTime_1 TODO: make sense ?
	    //const timeNow = await contracts.troveManager.get_timestamp()// TODO: is this equivalent to testHelper.getLatestBlockTimestamp(contracts.sdk) ?
	    //assert.isTrue(timeNow - lastFeeOpTime_1 >= 3600)

	    // Borrower E triggers a fee
	    await openTrove({ extraLUSDAmount: testHelper.dec(1, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: E } })
	    
	    const lastFeeOpTime_3 = await contracts.troveManager.get_last_fee_operation_time()
	    
	    // Check that the last fee operation time DID update, as borrower's debt issuance occured
	    // after minimum interval had passed 
	    assert.isTrue(lastFeeOpTime_3 > lastFeeOpTime_1)
	})

	it("openTrove(): reverts if max fee > 100%", async () => {
	    await testHelper.assertRevert(contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(2, 18), testHelper.dec(10000, 18), AAddress, AAddress, { onAccount: A, amount: dec(1000, 'ae') }), "Max fee percentage must be between 0.5% and 100%")
	    await testHelper.assertRevert(contracts.borrowerOperations.original.methods.open_trove('1000000000000000001', dec(20000, 18), BAddress, BAddress, { onAccount: B, amount: dec(1000, 'ae') }), "Max fee percentage must be between 0.5% and 100%")
	})

	it("openTrove(): reverts if max fee < 0.5% in Normal mode", async () => {
	    await testHelper.assertRevert(contracts.borrowerOperations.original.methods.open_trove(0, testHelper.dec(195000, 18), AAddress, AAddress, { onAccount: A, amount: testHelper.dec(1200, 'ae') }), "Max fee percentage must be between 0.5% and 100%")
	    await testHelper.assertRevert(contracts.borrowerOperations.original.methods.open_trove(1, testHelper.dec(195000, 18), AAddress, AAddress, { onAccount: A, amount: testHelper.dec(1000, 'ae') }), "Max fee percentage must be between 0.5% and 100%")
	    await testHelper.assertRevert(contracts.borrowerOperations.original.methods.open_trove('4999999999999999', testHelper.dec(195000, 18), BAddress, BAddress, { onAccount: B, amount: testHelper.dec(1200, 'ae') }), "Max fee percentage must be between 0.5% and 100%")
	})

	it("openTrove(): allows max fee < 0.5% in Recovery Mode", async () => {
	    //console.log('amount:' + testHelper.dec(2000, 'ae'))
	    const result = await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, testHelper.dec(195000, 18), AAddress, AAddress, { onAccount: A, amount: testHelper.dec(2000, 'ae') })
	
	    // const coll = await contracts.troveManager.get_entire_system_coll()
	    // console.log('coll:'+coll)	    
	    // const debt = await contracts.troveManager.get_entire_system_debt()
	    // console.log('debt:'+debt)
	    // const ae_debt = await contracts.activePool.get_ae()
	    // console.log('debt:'+ae_debt)	    
	    // const aeusd_debt = await contracts.defaultPool.get_aeusd_debt()
	    // console.log('debt:'+aeusd_debt)	    
	
	    // const price = await contracts.priceFeedTestnet.get_price()
	    // console.log('price:'+price)
	    // const tcr = await contracts.troveManager.get_tcr(price)
	    // console.log('tcr  :'+ tcr)

	    // const ccr = await contracts.troveManager.ccr()
	    // console.log('----------------------')	    
	    // console.log('ccr  :'+ ccr)
	    // console.log('----------------------')	    	    
			
	    await contracts.priceFeedTestnet.set_price(testHelper.dec(100, 18))

	    // const coll2 = await contracts.troveManager.get_entire_system_coll()
	    // console.log('coll:'+coll2)	    
	    // const debt2 = await contracts.troveManager.get_entire_system_debt()
	    // console.log('debt:'+debt2)	    
	    // const price2 = await contracts.priceFeedTestnet.get_price()
	    // console.log('price:'+price2)	    
	    // const tcr2 = await contracts.troveManager.get_tcr(price2)
	    // console.log('tcr  :'+ tcr2)
	    
	    assert.isTrue(await testHelper.checkRecoveryMode(contracts))

	    await contracts.borrowerOperations.original.methods.open_trove(0, testHelper.dec(19500, 18), BAddress, BAddress, { onAccount: B, amount: dec(3100, 'ae') })
	    await contracts.priceFeedTestnet.set_price(testHelper.dec(50, 18))
	    assert.isTrue(await testHelper.checkRecoveryMode(contracts))
	    await contracts.borrowerOperations.original.methods.open_trove(1, testHelper.dec(19500, 18), CAddress, CAddress, { onAccount: C, amount: dec(3100, 'ae') })
	    await contracts.priceFeedTestnet.set_price(testHelper.dec(25, 18))
	    assert.isTrue(await testHelper.checkRecoveryMode(contracts))
	    await contracts.borrowerOperations.original.methods.open_trove('4999999999999999', testHelper.dec(19500, 18), DAddress, DAddress, { onAccount: D, amount: testHelper.dec(3100, 'ae') })
	})

	it("openTrove(): reverts if fee exceeds max fee percentage", async () => {
	    await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	    const totalSupply = await contracts.aeusdToken.total_supply()

	    // Artificially make baseRate 5%
	    await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	    await contracts.troveManager.set_last_fee_op_time_to_now()

	    //       actual fee percentage: 0.005000000186264514
	    // user's max fee percentage:  0.0049999999999999999
	    let borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect max(0.5 + 5%, 5%) rate
	    assert.equal(borrowingRate, testHelper.dec(5, 16))

	    const lessThan5pct = '49999999999999999'
	    const txPromiseD = contracts.borrowerOperations.original.methods.open_trove(lessThan5pct, testHelper.dec(30000, 18), AAddress, AAddress, { onAccount: D, amount: testHelper.dec(1000, 'ae') })
	    await testHelper.assertRevert(txPromiseD, "Fee exceeded provided maximum")

	    borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	    assert.equal(borrowingRate, testHelper.dec(5, 16))
	    // Attempt with maxFee 1%
	    const txPromiseD2 = contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(1, 16), testHelper.dec(30000, 18), AAddress, AAddress, { onAccount: D, amount: testHelper.dec(1000, 'ae') })	    
	    await testHelper.assertRevert(txPromiseD2, "Fee exceeded provided maximum")

	    borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	    assert.equal(borrowingRate, testHelper.dec(5, 16))
	    // Attempt with maxFee 3.754%
	    const txPromiseD3 = contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(3754, 13), testHelper.dec(30000, 18), AAddress, AAddress, { onAccount: D, amount: testHelper.dec(1000, 'ae') })	    	    
	    await testHelper.assertRevert(txPromiseD3, "Fee exceeded provided maximum")


	    borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	    assert.equal(borrowingRate, testHelper.dec(5, 16))
	    // Attempt with maxFee 1e-16%
	    const txPromiseD4 = contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(5, 15), testHelper.dec(30000, 18), AAddress, AAddress, { onAccount: D, amount: testHelper.dec(1000, 'ae') })	    	    
	    await testHelper.assertRevert(txPromiseD4, "Fee exceeded provided maximum")
	})

	it("openTrove(): succeeds when fee is less than max fee percentage", async () => {
	    await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	    // Artificially make baseRate 5%
	    await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	    await contracts.troveManager.set_last_fee_op_time_to_now()

	    let borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect min(0.5 + 5%, 5%) rate
	    assert.equal(borrowingRate, testHelper.dec(5, 16))

	    // Attempt with maxFee > 5%
	    const moreThan5pct = '50000000000000001'
	    const tx1 = await contracts.borrowerOperations.original.methods.open_trove(moreThan5pct, testHelper.dec(10000, 18), AAddress, AAddress, { onAccount: D, amount: testHelper.dec(100, 'ae') })
	    assert.equal(tx1.result.returnType, 'ok')	    

	    borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	    assert.equal(borrowingRate, testHelper.dec(5, 16))

	    // Attempt with maxFee = 5%
	    const tx2 = await contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(5, 16), testHelper.dec(10000, 18), AAddress, AAddress, { onAccount: E, amount: testHelper.dec(100, 'ae') })
	    assert.equal(tx2.result.returnType, 'ok')	    

	    borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	    assert.equal(borrowingRate, testHelper.dec(5, 16))

	    // Attempt with maxFee 10%
	    const tx3 = await contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(1, 17), testHelper.dec(10000, 18), AAddress, AAddress, { onAccount: bob, amount: testHelper.dec(100, 'ae') })
	    assert.equal(tx3.result.returnType, 'ok')	    

	    borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	    assert.equal(borrowingRate, testHelper.dec(5, 16))

	    // Attempt with maxFee 37.659%
	    const tx4 = await contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(37659, 13), testHelper.dec(10000, 18), AAddress, AAddress, { onAccount: alice, amount: testHelper.dec(100, 'ae') })
	    assert.equal(tx4.result.returnType, 'ok')	    

	    // TODO: MISSING EXTRA WALLET
	    // // Attempt with maxFee 100% 
	    // const tx5 = await borrowerOperations.openTrove(testHelper.dec(1, 18), testHelper.dec(10000, 18), A, A, { onAccount: G, amount: testHelper.dec(100, 'ether') })
	    // assert.isTrue(tx5.receipt.status)
	})

	it("openTrove(): borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
	    await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: alice } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	    await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	    // Artificially make baseRate 5%
	    await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	    await contracts.troveManager.set_last_fee_op_time_to_now()

	    // Check baseRate is non-zero
	    const baseRate_1 = await contracts.troveManager.base_rate()
	    assert.isTrue(baseRate_1 > 0n)

	    // 59 minutes pass
	    await fastForwardTime(3540)

	    // Assume Borrower also owns accounts D and E
	    // Borrower triggers a fee, before decay interval has passed
	    await openTrove({ extraLUSDAmount: testHelper.dec(1, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })

	    // 1 minute pass
	    await fastForwardTime(3540)	    

	    // Borrower triggers another fee
	    await openTrove({ extraLUSDAmount: testHelper.dec(1, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: E } })
	    
	    // Check base rate has decreased even though Borrower tried to stop it decaying
	    const baseRate_2 = await contracts.troveManager.base_rate()
	    assert.isTrue(baseRate_2 < baseRate_1)
	})	

	it("openTrove(): borrowing at non-zero base rate sends LUSD fee to LQTY staking contract", async () => {
	    // time fast-forwards 1 year, and multisig stakes 1 LQTY
	    await fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR)	    
	    await LQTYContracts.lqtyToken.create_allowance(LQTYContracts.lqtyStaking.address, testHelper.dec(1, 18), { onAccount: multisig })
	    //await LQTYContracts.lqtyStaking.stake(testHelper.dec(1, 18), { onAccount: multisig })

	    // // Check LQTY LUSD balance before == 0
	    // const lqtyStaking_LUSDBalance_Before = await lusdToken.balanceOf(lqtyStaking.address)
	    // assert.equal(lqtyStaking_LUSDBalance_Before, '0')

	    // await openTrove({ extraLUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { onAccount: whale } })
	    // await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { onAccount: A } })
	    // await openTrove({ extraLUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { onAccount: B } })
	    // await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { onAccount: C } })

	    // // Artificially make baseRate 5%
	    // await troveManager.setBaseRate(dec(5, 16))
	    // await troveManager.setLastFeeOpTimeToNow()

	    // // Check baseRate is now non-zero
	    // const baseRate_1 = await troveManager.baseRate()
	    // assert.isTrue(baseRate_1.gt(toBN('0')))

	    // // 2 hours pass
	    // th.fastForwardTime(7200, web3.currentProvider)

	    // // D opens trove 
	    // await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { onAccount: D } })

	    // // Check LQTY LUSD balance after has increased
	    // const lqtyStaking_LUSDBalance_After = await lusdToken.balanceOf(lqtyStaking.address)
	    // assert.isTrue(lqtyStaking_LUSDBalance_After.gt(lqtyStaking_LUSDBalance_Before))
	})

    } )
} )
