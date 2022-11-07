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
	    await LQTYContracts.lqtyToken.set_timestamp_offset_for_debug( timeOffsetForDebugger.address )	    

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


	// --- addColl() ---

	// it("addColl(): reverts when top-up would leave trove with ICR < MCR", async () => {
	//     // alice creates a Trove and adds first collateral
	//     await openTrove({ ICR: testHelper.dec(2, 18) , extraParams: { onAccount: alice }})
	//     await openTrove({ ICR: testHelper.dec(10, 18), extraParams: { onAccount: bob   }})

	//     const price0 = await contracts.priceFeedTestnet.get_price()
	//     console.log('price0:' + price0)
	    
	//     // Price drops
	//     await contracts.priceFeedTestnet.set_price(testHelper.dec(100, 18))
	//     const price = await contracts.priceFeedTestnet.get_price()

	//     console.log('price :' + price)
	    
	//     assert.isFalse(await contracts.troveManager.check_recovery_mode(price))
	//     assert.isTrue((await contracts.troveManager.get_current_icr(aliceAddress, price)) < (testHelper.dec(110, 16)))

	//     const collTopUp = 1  // 1 wei top up

	//     contracts.borrowerOperations.add_coll(aliceAddress, aliceAddress, { onAccount: alice, amount: collTopUp })
	//     const txPromise = contracts.borrowerOperations.original.methods.add_coll(aliceAddress, aliceAddress, { onAccount: alice, amount: collTopUp })
	//     await testHelper.assertRevert(txPromise, 
	//     				  "BorrowerOps: An operation that would result in ICR < MCR is not permitted")
	//     // gives an 'v3/transactions error: Invalid tx' error
	// })

	// --- withdrawColl() ---

	// it("withdrawColl(): reverts when withdrawal would leave trove with ICR < MCR", async () => {
	//     // alice creates a Trove and adds first collateral
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     await openTrove({ ICR: testHelper.dec(10, 18), extraParams: { onAccount: bob } })

	//     // Price drops
	//     await contracts.priceFeedTestnet.set_price(testHelper.dec(100, 18))	    
	//     const price = await contracts.priceFeedTestnet.get_price()

	//     assert.isFalse(await testHelper.checkRecoveryMode(contracts))
	//     const icr = await contracts.troveManager.get_current_icr(aliceAddress, price)
	//     assert.isTrue(icr <  testHelper.dec(110, 16))

	//     const collWithdrawal = 1  // 1 wei withdrawal
	    
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.withdraw_coll(1, aliceAddress, aliceAddress, { onAccount: alice }), 
	// 		                 "BorrowerOps: An operation that would result in ICR < MCR is not permitted")
	// })

	// // reverts when calling address does not have active trove  
	// it("withdrawColl(): reverts when calling address does not have active trove", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: bob } })

	//     // Bob successfully withdraws some coll
	//     const txBob = await contracts.borrowerOperations.original.methods.withdraw_coll(testHelper.dec(100, 'finney'), bobAddress, bobAddress, { onAccount: bob })
	//     assert.equal(txBob.result.returnType, 'ok')	    

	//     // Carol with no active trove attempts to withdraw
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.withdraw_coll(testHelper.dec(1, 'ae'), AAddress, AAddress, { onAccount: A }), 
        // 		                 "BorrowerOps: Trove does not exist or is closed")
	// })


	// it("withdrawColl(): reverts when system is in Recovery Mode", async () => {
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: bob } })

	//     assert.isFalse(await testHelper.checkRecoveryMode(contracts))

	//     // Withdrawal possible when recoveryMode == false
	//     const txAlice = await contracts.borrowerOperations.original.methods.withdraw_coll(1000, aliceAddress, aliceAddress, { onAccount: alice })
	//     assert.equal(txAlice.result.returnType, 'ok')	    	

	//     await contracts.priceFeedTestnet.set_price('105000000000000000000')	    	    

	//     assert.isTrue(await testHelper.checkRecoveryMode(contracts))	    

	//     //Check withdrawal impossible when recoveryMode == true
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.withdraw_coll(100, bobAddress, bobAddress, { onAccount: bob }), 
        //  		                 "BorrowerOps: Collateral withdrawal not permitted Recovery Mode")
	    
	// })

	// it("withdrawColl(): reverts when requested ETH withdrawal is > the trove's collateral", async () => {
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: bob } })
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })

	//     const AColl = await getTroveEntireColl(AAddress)
	//     const bobColl = await getTroveEntireColl(bobAddress)
	//     // A withdraws exactly all her collateral
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.withdraw_coll(AColl, AAddress, AAddress, { onAccount: A }), 
        // 		                 "BorrowerOps: An operation that would result in ICR < MCR is not permitted")
	    

	//     // Bob attempts to withdraw 1 wei more than his collateral
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.withdraw_coll(bobColl + BigInt(1), bobAddress, bobAddress, { onAccount: bob }), 
        // 		                 "Can not withdraw more coll than the available")
	    
	// })

	// it("withdrawColl(): reverts when withdrawal would bring the user's ICR < MCR", async () => {
	//     await openTrove({ ICR: testHelper.dec(10, 18), extraParams: { onAccount: alice } })
	//     await openTrove({ ICR: testHelper.dec(11, 17), extraParams: { onAccount: bob } }) // 110% ICR

	//     // Bob attempts to withdraws 1 wei, Which would leave him with < 110% ICR.
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.withdraw_coll(BigInt(1), bobAddress, bobAddress, { onAccount: bob }), 
        // 		                 "BorrowerOps: An operation that would result in ICR < MCR is not permitted")
	// })

	// it("withdrawColl(): reverts if system is in Recovery Mode", async () => {
	//     // --- SETUP ---

	//     // A and B open troves at 150% ICR
	//     await openTrove({ ICR: testHelper.dec(15, 17), extraParams: { onAccount: bob } })
	//     await openTrove({ ICR: testHelper.dec(15, 17), extraParams: { onAccount: alice } })

	//     const TCR = (await testHelper.getTCR(contracts)).toString()
	//     assert.equal(TCR, '1500000000000000000')

	//     // --- TEST ---

	//     // price drops to 1ae:150LUSD, reducing TCR below 150%
	//     await contracts.priceFeedTestnet.set_price('150000000000000000000')	    

	//     //Alice tries to withdraw collateral during Recovery Mode
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.withdraw_coll(1, aliceAddress, aliceAddress, { onAccount: alice }), 
        //  		                 "BorrowerOps: Collateral withdrawal not permitted Recovery Mode")
	    
	// })

	// it("withdrawColl(): doesn’t allow a user to completely withdraw all collateral from their Trove (due to gas compensation)", async () => {
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: bob } })
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })

	//     const aliceColl = (await contracts.troveManager.get_entire_debt_and_coll(aliceAddress))[1]

	//     // Check Trove is active
	//     const status_Before = await contracts.troveManager.get_trove_status(aliceAddress)
	//     assert.equal(status_Before, 1)
	//     assert.isTrue(await contracts.sortedTroves.contains(aliceAddress))
	    
	//     // Alice attempts to withdraw all collateral
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.withdraw_coll(aliceColl, aliceAddress, aliceAddress, { onAccount: alice }), 
        //  		                 'BorrowerOps: An operation that would result in ICR < MCR is not permitted')
	    
	// })

	// it("withdrawColl(): leaves the Trove active when the user withdraws less than all the collateral", async () => {
	//     // Open Trove 
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })

	//     // Check Trove is active
	//     const status_Before = await contracts.troveManager.get_trove_status(aliceAddress)
	//     assert.equal(status_Before, 1)
	//     assert.isTrue(await contracts.sortedTroves.contains(aliceAddress))
	    
	//     // Withdraw some collateral
	//     await contracts.borrowerOperations.withdraw_coll(testHelper.dec(100, 'finney'), aliceAddress, aliceAddress, { onAccount: alice })

	//     // Check Trove is still active
	//     const status_After = await contracts.troveManager.get_trove_status(aliceAddress)
	//     assert.equal(status_After, 1)
	//     assert.isTrue(await contracts.sortedTroves.contains(aliceAddress))
	// })	

	// it("withdrawColl(): reduces the Trove's collateral by the correct amount", async () => {
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     const aliceCollBefore = await getTroveEntireColl(aliceAddress)

	//     // Alice withdraws 1 ether
	//     await contracts.borrowerOperations.withdraw_coll(testHelper.dec(1, 'ae'), aliceAddress, aliceAddress, { onAccount: alice })

	//     // Check 1 ether remaining
	//     const alice_Trove_After = (await contracts.troveManager.troves()).get(aliceAddress)
	//     const aliceCollAfter = await getTroveEntireColl(aliceAddress)

	//     assert.isTrue(aliceCollAfter == aliceCollBefore - testHelper.dec(1, 'ae'))
	// })

	// it("withdrawColl(): reduces ActivePool ETH and raw ether by correct amount", async () => {
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     const aliceCollBefore = await getTroveEntireColl(aliceAddress)
	    
	//     // check before
	//     const activePool_ae_before = BigInt(await contracts.activePool.get_ae())
	//     const activePool_RawAe_before = BigInt(await contracts.sdk.getBalance(contracts.activePool.address))
	    
	//     await contracts.borrowerOperations.withdraw_coll(testHelper.dec(1, 'ae'), aliceAddress, aliceAddress, { onAccount: alice })

	//     // check after
	//     const activePool_ae_After = BigInt(await contracts.activePool.get_ae())
	//     const activePool_RawAe_After = BigInt(await contracts.sdk.getBalance(contracts.activePool.address))
	//     assert.isTrue(activePool_ae_After == activePool_ae_before - testHelper.dec(1, 'ae'))
	//     assert.isTrue(activePool_RawAe_After ==  activePool_RawAe_before - testHelper.dec(1, 'ae'))
	// })

	// it("withdrawColl(): updates the stake and updates the total stakes", async () => {
	//     //  Alice creates initial Trove with 2 ether
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice, amount: testHelper.dec(5, 'ae') } })
	//     const aliceColl = await getTroveEntireColl(aliceAddress)
	//     assert.isTrue(aliceColl > 0)
	    
	//     const alice_Trove_Before = (await contracts.troveManager.troves()).get(aliceAddress)
	//     const alice_Stake_Before = BigInt(alice_Trove_Before.stake)
	//     const totalStakes_Before = BigInt(await contracts.troveManager.total_stakes())

	//     assert.isTrue(alice_Stake_Before == aliceColl)
	//     assert.isTrue(totalStakes_Before == aliceColl)

	//     // Alice withdraws 1 ether
	//     await contracts.borrowerOperations.withdraw_coll(testHelper.dec(1, 'ae'), aliceAddress, aliceAddress, { onAccount: alice })

	//     // Check stake and total stakes get updated
	//     const alice_Trove_After = (await contracts.troveManager.troves()).get(aliceAddress)
	//     const alice_Stake_After = BigInt(alice_Trove_After.stake)
	//     const totalStakes_After = BigInt(await contracts.troveManager.total_stakes())

	//     assert.isTrue(alice_Stake_After == alice_Stake_Before - testHelper.dec(1, 'ae'))
	//     assert.isTrue(totalStakes_After == totalStakes_Before - testHelper.dec(1, 'ae'))
	// })

	// it("withdrawColl(): sends the correct amount of ae to the user", async () => {
	//     await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice, amount: testHelper.dec(2, 'ae') } })
	    
	//     const alice_AeBalance_Before = BigInt(await contracts.sdk.getBalance(aliceAddress))
	//     await contracts.borrowerOperations.withdraw_coll(testHelper.dec(1, 'ae'), aliceAddress, aliceAddress, { onAccount: alice }) // , gasPrice: 0

	//     const alice_AeBalance_After = BigInt(await contracts.sdk.getBalance(aliceAddress))
	//     const balanceDiff = alice_AeBalance_After - alice_AeBalance_Before

	//     // TODO: check this difference is all about gasPrice 
	//     assert.isAtMost(testHelper.getDifference(balanceDiff, testHelper.dec(1, 'ae')), 296440000000000)
	//     //assert.equal(balanceDiff, testHelper.dec(1, 'ae'))
	// })	

	it("withdrawColl(): applies pending rewards and updates user's L_AE, L_LUSDDebt snapshots", async () => {
	    // --- SETUP ---
	    // Alice adds 15 ae, Bob adds 5 ae, B adds 1 ae
	    await openTrove({ ICR: testHelper.dec(10, 18), extraParams: { onAccount: A /* whale */ } })
	    await openTrove({ ICR: testHelper.dec(3, 18), extraParams: { onAccount: alice, amount: testHelper.dec(100, 'ae') } })
	    await openTrove({ ICR: testHelper.dec(3, 18), extraParams: { onAccount: bob, amount: testHelper.dec(100, 'ae') } })
	    await openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: B /* carol */, amount: testHelper.dec(10, 'ae') } })

	    console.log('A address: '+ AAddress)
	    console.log('alice address: '+ aliceAddress)
	    console.log('bob address: '+ bobAddress)
	    console.log('B address: '+ BAddress)	    
	    
	    
	    const aliceCollBefore = await getTroveEntireColl(aliceAddress)
	    const aliceDebtBefore = await getTroveEntireDebt(aliceAddress)
	    const bobCollBefore = await getTroveEntireColl(bobAddress)
	    const bobDebtBefore = await getTroveEntireDebt(bobAddress)

	    // --- TEST ---

	    // price drops to 1AE:100AEUSD, reducing B's ICR below MCR
	    await contracts.priceFeedTestnet.set_price('100000000000000000000')	    

	    var size = await contracts.sortedTroves.get_size()
	    console.log('sorted lists len:' + size)

	    
	    // close B's Trove, liquidating her 1 ae and 180AEUSD.
	    await contracts.troveManager.liquidate(BAddress, { onAccount: C /*owner*/ });

	    const L_AE = await contracts.troveManager.l_ae()
	    const L_AEUSDDebt = await contracts.troveManager.l_aeusd_debt()

	    // check Alice and Bob's reward snapshots are zero before they alter their Troves
	    const alice_rewardSnapshot_Before = await contracts.troveManager.reward_snapshots(aliceAddress)
	    const alice_AErewardSnapshot_Before = alice_rewardSnapshot_Before.ae
	    const alice_AEUSDDebtRewardSnapshot_Before = alice_rewardSnapshot_Before.aeusd_debt
	    
	    const bob_rewardSnapshot_Before = await contracts.troveManager.reward_snapshots(bobAddress)
	    const bob_AErewardSnapshot_Before = bob_rewardSnapshot_Before.ae
	    const bob_AEUSDDebtRewardSnapshot_Before = bob_rewardSnapshot_Before.aeusd_debt

	    assert.equal(alice_AErewardSnapshot_Before, 0)
	    assert.equal(alice_AEUSDDebtRewardSnapshot_Before, 0)
	    assert.equal(bob_AErewardSnapshot_Before, 0)
	    assert.equal(bob_AEUSDDebtRewardSnapshot_Before, 0)

	    // Check A and B have pending rewards
	    const pendingCollReward_A = await contracts.troveManager.get_pending_ae_reward(aliceAddress)
	    const pendingDebtReward_A = await contracts.troveManager.get_pending_aeusd_debt_reward(aliceAddress)
	    const pendingCollReward_B = await contracts.troveManager.get_pending_ae_reward(bobAddress)
	    const pendingDebtReward_B = await contracts.troveManager.get_pending_aeusd_debt_reward(bobAddress)

	    var reward
	    for (reward of [pendingCollReward_A, pendingDebtReward_A, pendingCollReward_B, pendingDebtReward_B]) {
		assert.isTrue(reward > 0)
	    }

	    // Alice and Bob withdraw from their Troves
	    const aliceCollWithdrawal = testHelper.dec(5, 'ae')
	    const bobCollWithdrawal = testHelper.dec(1, 'ae')

	    size = await contracts.sortedTroves.get_size()
	    console.log('sorted lists len:' + size)

	    var isAlice = (await contracts.sortedTroves.contains(aliceAddress))
	    console.log('alice is there :' + isAlice)	    	    

	    var isA = await contracts.sortedTroves.contains(AAddress)
	    console.log('A is there :' + isA)	    	    
	    
	    var isBob = await contracts.sortedTroves.contains(bobAddress)
	    console.log('bob is there :' + isBob)

	    var pointer = await contracts.sortedTroves.get_first()
	    console.log('sorted trove nodes:')
	    while (pointer) {
		console.log(pointer)
		pointer = await contracts.sortedTroves.get_next(pointer)
	    }
	    
	    await contracts.borrowerOperations.withdraw_coll(aliceCollWithdrawal, aliceAddress, aliceAddress, { onAccount: alice })
	    size = await contracts.sortedTroves.get_size()
	    console.log(size)

	    isAlice = (await contracts.sortedTroves.contains(aliceAddress))
	    console.log('alice is there :' + isAlice)	    	    

	    isA = await contracts.sortedTroves.contains(AAddress)
	    console.log('A is there :' + isA)	    	    
	    
	    isBob = await contracts.sortedTroves.contains(bobAddress)
	    console.log('bob is there :' + isBob)

	    pointer = await contracts.sortedTroves.get_first()
	    console.log('sorted trove nodes:')	    
	    while (pointer) {
		console.log(pointer)
		pointer = await contracts.sortedTroves.get_next(pointer)
	    }
	    
	    
	    await contracts.borrowerOperations.withdraw_coll(bobCollWithdrawal, bobAddress, bobAddress, { onAccount: bob })

	    size = await contracts.sortedTroves.get_size()
	    console.log('sorted lists len:' + size)	

	    

	    // // Check that both alice and Bob have had pending rewards applied in addition to their top-ups. 
	    // const aliceCollAfter = await getTroveEntireColl(aliceAddress)
	    // const aliceDebtAfter = await getTroveEntireDebt(aliceAddress)
	    // const bobCollAfter = await getTroveEntireColl(bobAddress)
	    // const bobDebtAfter = await getTroveEntireDebt(bobAddress)

	    // // Check rewards have been applied to troves
	    // testHelper.assertIsApproximatelyEqual(aliceCollAfter, aliceCollBefore + pendingCollReward_A  - aliceCollWithdrawal, 10000)
	    // testHelper.assertIsApproximatelyEqual(aliceDebtAfter, aliceDebtBefore + pendingDebtReward_A, 10000)
	    // testHelper.assertIsApproximatelyEqual(bobCollAfter, bobCollBefore + pendingCollReward_B - bobCollWithdrawal, 10000)
	    // testHelper.assertIsApproximatelyEqual(bobDebtAfter, bobDebtBefore + pendingDebtReward_B, 10000)

	    // /* After top up, both Alice and Bob's snapshots of the rewards-per-unit-staked metrics should be updated
	    //    to the latest values of L_AE and L_AEUSDDebt */
	    // const alice_rewardSnapshot_After = await contracts.troveManager.reward_snapshots(aliceAddress) 
	    // const alice_AErewardSnapshot_After = alice_rewardSnapshot_After.ae
	    // const alice_AEUSDDebtRewardSnapshot_After = alice_rewardSnapshot_After.aeusd_debt

	    // const bob_rewardSnapshot_After = await contracts.troveManager.reward_snapshots(bobAddress)
	    // const bob_AErewardSnapshot_After = bob_rewardSnapshot_After.ae
	    // const bob_AEUSDDebtRewardSnapshot_After = bob_rewardSnapshot_After.aeusd_debt

	    // assert.isAtMost(testHelper.getDifference(alice_AErewardSnapshot_After, L_AE), 100)
	    // assert.isAtMost(testHelper.getDifference(alice_AEUSDDebtRewardSnapshot_After, L_AEUSDDebt), 100)
	    // assert.isAtMost(testHelper.getDifference(bob_AErewardSnapshot_After, L_AE), 100)
	    // assert.isAtMost(testHelper.getDifference(bob_AEUSDDebtRewardSnapshot_After, L_AEUSDDebt), 100)
	})
	

	// // --- openTrove() ---
	// it("openTrove(): emits a TroveUpdated event with the correct collateral and debt", async () => {

	//     const txA = (await openTrove({ extraLUSDAmount: testHelper.dec(15000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })).tx
	//     const txB = (await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })).tx
	//     const txC = (await openTrove({ extraLUSDAmount: testHelper.dec(3000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })).tx

	//     //console.log(txA.tx)

	//     const A_Coll = await getTroveEntireColl(AAddress)
        //     const B_Coll = await getTroveEntireColl(BAddress)
        //     const C_Coll = await getTroveEntireColl(CAddress)
        //     const A_Debt = await getTroveEntireDebt(AAddress)
        //     const B_Debt = await getTroveEntireDebt(BAddress)
        //     const C_Debt = await getTroveEntireDebt(CAddress)

	//     const A_emittedDebt = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txA, "TroveUpdated", 1), 1))
        //     const A_emittedColl = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txA, "TroveUpdated", 1), 2))
	//     const B_emittedDebt = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txB, "TroveUpdated", 1), 1))
        //     const B_emittedColl = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txB, "TroveUpdated", 1), 2))
	//     const C_emittedDebt = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txC, "TroveUpdated", 1), 1))
        //     const C_emittedColl = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txC, "TroveUpdated", 1), 2))

        //     // Check emitted debt values are correct
        //     assert.isTrue(A_Debt == A_emittedDebt)
        //     assert.isTrue(B_Debt == B_emittedDebt)
        //     assert.isTrue(C_Debt == C_emittedDebt)

	//     // Check emitted coll values are correct
        //     assert.isTrue(A_Coll == A_emittedColl)
        //     assert.isTrue(B_Coll == B_emittedColl)
        //     assert.isTrue(C_Coll == C_emittedColl)

	//     const baseRateBefore = await contracts.troveManager.base_rate()

	//     // Artificially make baseRate 5%
        //     await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
        //     await contracts.troveManager.set_last_fee_op_time_to_now()

        //     assert.isTrue((await contracts.troveManager.base_rate()) > baseRateBefore)

	//     const txD = (await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })).tx
        //     const txE = (await openTrove({ extraLUSDAmount: testHelper.dec(3000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: E } })).tx
        //     const D_Coll = await getTroveEntireColl(DAddress)
        //     const E_Coll = await getTroveEntireColl(EAddress)
        //     const D_Debt = await getTroveEntireDebt(DAddress)
        //     const E_Debt = await getTroveEntireDebt(EAddress)

	//     const D_emittedDebt = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txD, "TroveUpdated", 1), 1))
        //     const D_emittedColl = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txD, "TroveUpdated", 1), 2))
	//     const E_emittedDebt = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txE, "TroveUpdated", 1), 1))
        //     const E_emittedColl = BigInt(testHelper.getPayloadByIndex(testHelper.getEventArgByIndex(txE, "TroveUpdated", 1), 2))
	    
        //     // Check emitted debt values are correct
        //     assert.isTrue(D_Debt == D_emittedDebt)
        //     assert.isTrue(E_Debt == E_emittedDebt)

        //     // Check emitted coll values are correct
        //     assert.isTrue(D_Coll == D_emittedColl)
        //     assert.isTrue(E_Coll == E_emittedColl)
	// })
	

	// it("openTrove(): Opens a trove with net debt >= minimum net debt", async () => {
	//     const txA = await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, await getNetBorrowingAmount(MIN_NET_DEBT + BigInt(1)), AAddress, AAddress, { onAccount: A, amount: testHelper.dec(100, 30) })
        //     assert.equal(txA.result.returnType, 'ok')
	//     assert.isTrue(await contracts.sortedTroves.contains(AAddress))
	    
	//     const txC = await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, await getNetBorrowingAmount(MIN_NET_DEBT + BigInt(testHelper.dec(47789898, 22))), CAddress, CAddress, { onAccount: C, amount: testHelper.dec(100, 30) })
        //     assert.equal(txC.result.returnType, 'ok')
	//     assert.isTrue(await contracts.sortedTroves.contains(CAddress))
	// })

	// it("openTrove(): reverts if net debt < minimum net debt", async () => {
	//     const txAPromise = contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, 0, AAddress, AAddress, { onAccount: A, amount: testHelper.dec(100, 30) })
	//     await testHelper.assertRevert(txAPromise, "division by zero")

	//     const txBPromise = contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, await getNetBorrowingAmount(MIN_NET_DEBT - BigInt(1)), BAddress, BAddress, { onAccount: B, amount: testHelper.dec(100, 30) })
	//     await testHelper.assertRevert(txBPromise, "net debt must be greater than minimum")

	//     const txCPromise = contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, MIN_NET_DEBT - BigInt(testHelper.dec(173, 18)), CAddress, CAddress, { onAccount: C, amount: testHelper.dec(100, 30) })
	//     await testHelper.assertRevert(txCPromise, "net debt must be greater than minimum")
	// })

	// it("openTrove(): decays a non-zero base rate", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: bob } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	//     // Artificially make baseRate 5%
	//     await contracts.troveManager.set_base_rate(dec(5, 16))
	//     await contracts.troveManager.set_last_fee_op_time_to_now()

	//     // Check baseRate is now non-zero
	//     const baseRate_1 = await contracts.troveManager.base_rate()
	//     assert.isTrue(baseRate_1 > BigInt(0))

	//     // 2 hours pass
	//     await fastForwardTime(7200)

	//     // D opens trove 
	//     await openTrove({ extraLUSDAmount: testHelper.dec(37, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })

	//     // Check baseRate has decreased
	//     const baseRate_2 = await contracts.troveManager.base_rate()
	//     assert.isTrue(baseRate_2 < baseRate_1)

	//     // 1 hour passes
	//     await fastForwardTime(3600)

	//     // E opens trove 
	//     await openTrove({ extraLUSDAmount: testHelper.dec(12, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: E } })

	//     const baseRate_3 = await contracts.troveManager.base_rate()
	//     assert.isTrue(baseRate_3 < baseRate_2)
	// })

	// it("openTrove(): doesn't change base rate if it is already zero", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: bob } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	//     // Check baseRate is zero
	//     const baseRate_1 = await contracts.troveManager.base_rate()
	//     assert.equal(baseRate_1, '0')

	//     // 2 hours pass
	//     await fastForwardTime(7200)

	//     // D opens trove 
	//     await openTrove({ extraLUSDAmount: testHelper.dec(37, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })

	//     // Check baseRate is still 0
	//     const baseRate_2 = await contracts.troveManager.base_rate()
	//     assert.equal(baseRate_2, '0')

	//     // 1 hour passes
	//     await fastForwardTime(3600)

	//     // E opens trove 
	//     await openTrove({ extraLUSDAmount: testHelper.dec(12, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: E } })

	//     const baseRate_3 = await contracts.troveManager.base_rate()
	//     assert.equal(baseRate_3, '0')
	// })

	// it("openTrove(): lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: bob } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	//     // Artificially make baseRate 5%
	//     await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	//     await contracts.troveManager.set_last_fee_op_time_to_now()

	//     // Check baseRate is now non-zero
	//     const baseRate_1 = await contracts.troveManager.base_rate()
	//     assert.isTrue(baseRate_1 > 0)

	//     const lastFeeOpTime_1 = await contracts.troveManager.get_last_fee_operation_time()

	//     // Borrower D triggers a fee
	//     await openTrove({ extraLUSDAmount: testHelper.dec(1, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })

	//     const lastFeeOpTime_2 = await contracts.troveManager.get_last_fee_operation_time()

	//     // Check that the last fee operation time did not update, as borrower D's debt issuance occured
	//     // since before minimum interval had passed 
	//     assert.isTrue(lastFeeOpTime_2 == lastFeeOpTime_1)

	//     // 1 minute passes
	//     await fastForwardTime(60)

	//     // Check that now, at least one minute has passed since lastFeeOpTime_1 TODO: make sense ?
	//     //const timeNow = await contracts.troveManager.get_timestamp()// TODO: is this equivalent to testHelper.getLatestBlockTimestamp(contracts.sdk) ?
	//     //assert.isTrue(timeNow - lastFeeOpTime_1 >= 3600)

	//     // Borrower E triggers a fee
	//     await openTrove({ extraLUSDAmount: testHelper.dec(1, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: E } })
	    
	//     const lastFeeOpTime_3 = await contracts.troveManager.get_last_fee_operation_time()
	    
	//     // Check that the last fee operation time DID update, as borrower's debt issuance occured
	//     // after minimum interval had passed 
	//     assert.isTrue(lastFeeOpTime_3 > lastFeeOpTime_1)
	// })

	// it("openTrove(): reverts if max fee > 100%", async () => {
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(2, 18), testHelper.dec(10000, 18), AAddress, AAddress, { onAccount: A, amount: dec(1000, 'ae') }), "Max fee percentage must be between 0.5% and 100%")
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.open_trove('1000000000000000001', dec(20000, 18), BAddress, BAddress, { onAccount: B, amount: dec(1000, 'ae') }), "Max fee percentage must be between 0.5% and 100%")
	// })

	// it("openTrove(): reverts if max fee < 0.5% in Normal mode", async () => {
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.open_trove(0, testHelper.dec(195000, 18), AAddress, AAddress, { onAccount: A, amount: testHelper.dec(1200, 'ae') }), "Max fee percentage must be between 0.5% and 100%")
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.open_trove(1, testHelper.dec(195000, 18), AAddress, AAddress, { onAccount: A, amount: testHelper.dec(1000, 'ae') }), "Max fee percentage must be between 0.5% and 100%")
	//     await testHelper.assertRevert(contracts.borrowerOperations.original.methods.open_trove('4999999999999999', testHelper.dec(195000, 18), BAddress, BAddress, { onAccount: B, amount: testHelper.dec(1200, 'ae') }), "Max fee percentage must be between 0.5% and 100%")
	// })

	// it("openTrove(): allows max fee < 0.5% in Recovery Mode", async () => {
	//     //console.log('amount:' + testHelper.dec(2000, 'ae'))
	//     const result = await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, testHelper.dec(195000, 18), AAddress, AAddress, { onAccount: A, amount: testHelper.dec(2000, 'ae') })
	
	//     await contracts.priceFeedTestnet.set_price(testHelper.dec(100, 18))
	    
	//     assert.isTrue(await testHelper.checkRecoveryMode(contracts))

	//     await contracts.borrowerOperations.original.methods.open_trove(0, testHelper.dec(19500, 18), BAddress, BAddress, { onAccount: B, amount: dec(3100, 'ae') })
	//     await contracts.priceFeedTestnet.set_price(testHelper.dec(50, 18))
	//     assert.isTrue(await testHelper.checkRecoveryMode(contracts))
	//     await contracts.borrowerOperations.original.methods.open_trove(1, testHelper.dec(19500, 18), CAddress, CAddress, { onAccount: C, amount: dec(3100, 'ae') })
	//     await contracts.priceFeedTestnet.set_price(testHelper.dec(25, 18))
	//     assert.isTrue(await testHelper.checkRecoveryMode(contracts))
	//     await contracts.borrowerOperations.original.methods.open_trove('4999999999999999', testHelper.dec(19500, 18), DAddress, DAddress, { onAccount: D, amount: testHelper.dec(3100, 'ae') })
	// })

	// it("openTrove(): reverts if fee exceeds max fee percentage", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	//     const totalSupply = await contracts.aeusdToken.total_supply()

	//     // Artificially make baseRate 5%
	//     await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	//     await contracts.troveManager.set_last_fee_op_time_to_now()

	//     //       actual fee percentage: 0.005000000186264514
	//     // user's max fee percentage:  0.0049999999999999999
	//     let borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect max(0.5 + 5%, 5%) rate
	//     assert.equal(borrowingRate, testHelper.dec(5, 16))

	//     const lessThan5pct = '49999999999999999'
	//     const txPromiseD = contracts.borrowerOperations.original.methods.open_trove(lessThan5pct, testHelper.dec(30000, 18), AAddress, AAddress, { onAccount: D, amount: testHelper.dec(1000, 'ae') })
	//     await testHelper.assertRevert(txPromiseD, "Fee exceeded provided maximum")

	//     borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	//     assert.equal(borrowingRate, testHelper.dec(5, 16))
	//     // Attempt with maxFee 1%
	//     const txPromiseD2 = contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(1, 16), testHelper.dec(30000, 18), AAddress, AAddress, { onAccount: D, amount: testHelper.dec(1000, 'ae') })	    
	//     await testHelper.assertRevert(txPromiseD2, "Fee exceeded provided maximum")

	//     borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	//     assert.equal(borrowingRate, testHelper.dec(5, 16))
	//     // Attempt with maxFee 3.754%
	//     const txPromiseD3 = contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(3754, 13), testHelper.dec(30000, 18), AAddress, AAddress, { onAccount: D, amount: testHelper.dec(1000, 'ae') })	    	    
	//     await testHelper.assertRevert(txPromiseD3, "Fee exceeded provided maximum")


	//     borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	//     assert.equal(borrowingRate, testHelper.dec(5, 16))
	//     // Attempt with maxFee 1e-16%
	//     const txPromiseD4 = contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(5, 15), testHelper.dec(30000, 18), AAddress, AAddress, { onAccount: D, amount: testHelper.dec(1000, 'ae') })	    	    
	//     await testHelper.assertRevert(txPromiseD4, "Fee exceeded provided maximum")
	// })

	// it("openTrove(): succeeds when fee is less than max fee percentage", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	//     // Artificially make baseRate 5%
	//     await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	//     await contracts.troveManager.set_last_fee_op_time_to_now()

	//     let borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect min(0.5 + 5%, 5%) rate
	//     assert.equal(borrowingRate, testHelper.dec(5, 16))

	//     // Attempt with maxFee > 5%
	//     const moreThan5pct = '50000000000000001'
	//     const tx1 = await contracts.borrowerOperations.original.methods.open_trove(moreThan5pct, testHelper.dec(10000, 18), AAddress, AAddress, { onAccount: D, amount: testHelper.dec(100, 'ae') })
	//     assert.equal(tx1.result.returnType, 'ok')	    

	//     borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	//     assert.equal(borrowingRate, testHelper.dec(5, 16))

	//     // Attempt with maxFee = 5%
	//     const tx2 = await contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(5, 16), testHelper.dec(10000, 18), AAddress, AAddress, { onAccount: E, amount: testHelper.dec(100, 'ae') })
	//     assert.equal(tx2.result.returnType, 'ok')	    

	//     borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	//     assert.equal(borrowingRate, testHelper.dec(5, 16))

	//     // Attempt with maxFee 10%
	//     const tx3 = await contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(1, 17), testHelper.dec(10000, 18), AAddress, AAddress, { onAccount: bob, amount: testHelper.dec(100, 'ae') })
	//     assert.equal(tx3.result.returnType, 'ok')	    

	//     borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
	//     assert.equal(borrowingRate, testHelper.dec(5, 16))

	//     // Attempt with maxFee 37.659%
	//     const tx4 = await contracts.borrowerOperations.original.methods.open_trove(testHelper.dec(37659, 13), testHelper.dec(10000, 18), AAddress, AAddress, { onAccount: alice, amount: testHelper.dec(100, 'ae') })
	//     assert.equal(tx4.result.returnType, 'ok')	    

	//     // TODO: MISSING EXTRA WALLET
	//     // // Attempt with maxFee 100% 
	//     // const tx5 = await borrowerOperations.openTrove(testHelper.dec(1, 18), testHelper.dec(10000, 18), A, A, { onAccount: G, amount: testHelper.dec(100, 'ether') })
	//     // assert.isTrue(tx5.receipt.status)
	// })

	// it("openTrove(): borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: alice } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	//     // Artificially make baseRate 5%
	//     await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	//     await contracts.troveManager.set_last_fee_op_time_to_now()

	//     // Check baseRate is non-zero
	//     const baseRate_1 = await contracts.troveManager.base_rate()
	//     assert.isTrue(baseRate_1 > 0n)

	//     // 59 minutes pass
	//     await fastForwardTime(3540)

	//     // Assume Borrower also owns accounts D and E
	//     // Borrower triggers a fee, before decay interval has passed
	//     await openTrove({ extraLUSDAmount: testHelper.dec(1, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })

	//     // 1 minute pass
	//     await fastForwardTime(3540)	    

	//     // Borrower triggers another fee
	//     await openTrove({ extraLUSDAmount: testHelper.dec(1, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: E } })
	    
	//     // Check base rate has decreased even though Borrower tried to stop it decaying
	//     const baseRate_2 = await contracts.troveManager.base_rate()
	//     assert.isTrue(baseRate_2 < baseRate_1)
	// })	

	// it("openTrove(): borrowing at non-zero base rate sends LUSD fee to LQTY staking contract", async () => {
	//     // time fast-forwards 1 year, and multisig stakes 1 LQTY
	//     await fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR)
	//     const lqtyStakingAddress = LQTYContracts.lqtyStaking.address
	//     const lqtyStakingAccountAddress = lqtyStakingAddress.replace("ct_", "ak_");	    
	//     await LQTYContracts.lqtyToken.create_allowance(lqtyStakingAccountAddress, testHelper.dec(1, 18), { onAccount: multisig })
	//     await LQTYContracts.lqtyStaking.stake(testHelper.dec(1, 18), { onAccount: multisig })

	//     // Check LQTY LUSD balance before == 0
	//     const lqtyStaking_aeusd_balance_before = await contracts.aeusdToken.balance(lqtyStakingAccountAddress)
	//     assert.equal(lqtyStaking_aeusd_balance_before, undefined)

	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: alice } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })


	//     // Artificially make baseRate 5%
	//     await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	//     await contracts.troveManager.set_last_fee_op_time_to_now()

	//     // Check baseRate is now non-zero
	//     const baseRate_1 = await contracts.troveManager.base_rate()
	//     assert.isTrue(baseRate_1 > 0)

	//     // 2 hours pass
	//     await fastForwardTime(7200)

	//     // D opens trove 
	//     await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })

	//     // Check LQTY LUSD balance after has increased
	//     const lqtyStaking_aeusd_balance_after = await contracts.aeusdToken.balance(lqtyStakingAccountAddress)
	//     //console.log('aeusd_balance:'+lqtyStaking_aeusd_balance_after)
	//     assert.isTrue(lqtyStaking_aeusd_balance_after > 0)
	// })

	// it("openTrove(): borrowing at non-zero base records the (drawn debt + fee  + liq. reserve) on the Trove struct", async () => {
        //     // time fast-forwards 1 year, and multisig stakes 1 LQTY
        //     await fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR)
        //     await LQTYContracts.lqtyToken.create_allowance(LQTYContracts.lqtyStaking.accountAddress, testHelper.dec(1, 18), { onAccount: multisig })
        //     await LQTYContracts.lqtyStaking.stake(testHelper.dec(1, 18), { onAccount: multisig })

        //     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: alice } })
        //     await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
        //     await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
        //     await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

   	//     // Artificially make baseRate 5%
	//     await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	//     await contracts.troveManager.set_last_fee_op_time_to_now()

        //     // Check baseRate is now non-zero
        //     const baseRate_1 = await contracts.troveManager.base_rate()
        //     assert.isTrue(baseRate_1 > 0)

        //     // 2 hours pass
        //     await fastForwardTime(7200)

        //     const D_LUSDRequest = testHelper.dec(20000, 18)

        //    // D withdraws LUSD
        //     const openTroveTx = await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, D_LUSDRequest, AAddress, AAddress, { onAccount: D, amount: testHelper.dec(200, 'ae') })

        //     const emittedFee = BigInt(testHelper.getAEUSDFeeFromAEUSDBorrowingEvent(openTroveTx))
        //     assert.isTrue(BigInt(emittedFee) > 0)

        //     const newDebt = (await contracts.troveManager.troves()).get(DAddress).debt

        //     // Check debt on Trove struct equals drawn debt plus emitted fee
        //     testHelper.assertIsApproximatelyEqual(newDebt, D_LUSDRequest + emittedFee + LUSD_GAS_COMPENSATION, 100000)
	// })

	// it("openTrove(): Borrowing at non-zero base rate increases the LQTY staking contract LUSD fees-per-unit-staked", async () => {
	//     // time fast-forwards 1 year, and multisig stakes 1 LQTY
        //     await fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR)
        //     await LQTYContracts.lqtyToken.create_allowance(LQTYContracts.lqtyStaking.accountAddress, testHelper.dec(1, 18), { onAccount: multisig })
        //     await LQTYContracts.lqtyStaking.stake(testHelper.dec(1, 18), { onAccount: multisig })

	//     // Check LQTY contract LUSD fees-per-unit-staked is zero
	//     const f_aeusd_Before = await LQTYContracts.lqtyStaking.f_aeusd()
	//     assert.equal(f_aeusd_Before, '0')

	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: alice } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

   	//     // Artificially make baseRate 5%
	//     await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	//     await contracts.troveManager.set_last_fee_op_time_to_now()

        //     // Check baseRate is now non-zero
        //     const baseRate_1 = await contracts.troveManager.base_rate()
        //     assert.isTrue(baseRate_1 > 0)

	//     // 2 hours pass
	//     await fastForwardTime(7200)

	//     // D opens trove 
	//     await openTrove({ extraLUSDAmount: testHelper.dec(37, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })

	//     // Check LQTY contract LUSD fees-per-unit-staked has increased
	//     const f_aeusd_Afer = await LQTYContracts.lqtyStaking.f_aeusd()	    
	//     assert.isTrue(f_aeusd_Afer > f_aeusd_Before)
	// })

	// it("openTrove(): Borrowing at non-zero base rate sends requested amount to the user", async () => {
	//     // time fast-forwards 1 year, and multisig stakes 1 LQTY
        //     await fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR)
        //     await LQTYContracts.lqtyToken.create_allowance(LQTYContracts.lqtyStaking.accountAddress, testHelper.dec(1, 18), { onAccount: multisig })
        //     await LQTYContracts.lqtyStaking.stake(testHelper.dec(1, 18), { onAccount: multisig })
	    
	//     // Check LQTY LUSD balance before == 0
	//     const lqtyStaking_aeusd_balance_before = await contracts.aeusdToken.balance(LQTYContracts.lqtyStaking.accountAddress)
	//     assert.equal(lqtyStaking_aeusd_balance_before, undefined)

	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: alice } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(20000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(30000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(40000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

   	//     // Artificially make baseRate 5%
	//     await contracts.troveManager.set_base_rate(testHelper.dec(5, 16))
	//     await contracts.troveManager.set_last_fee_op_time_to_now()

	//     // Check baseRate is now non-zero
        //     const baseRate_1 = await contracts.troveManager.base_rate()
        //     assert.isTrue(baseRate_1 > 0)

	//     // 2 hours pass
	//     await fastForwardTime(7200)

	//     // D opens trove
	//     const LUSDRequest_D = testHelper.dec(40000, 18)	    
        //     const openTroveTx = await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, LUSDRequest_D, DAddress, DAddress, { onAccount: D, amount: testHelper.dec(500, 'ae') })

	//     // Check LQTY staking LUSD balance has increased
	//     const lqtyStaking_aeusd_balance_after = await contracts.aeusdToken.balance(LQTYContracts.lqtyStaking.accountAddress)
	//     assert.isTrue(lqtyStaking_aeusd_balance_after > 0)

	//     // Check D's LUSD balance now equals their requested LUSD
	//     const LUSDBalance_D = await contracts.aeusdToken.balance(DAddress)
	//     assert.isTrue(LUSDRequest_D == LUSDBalance_D)
	// })

	// it("openTrove(): Borrowing at zero base rate changes the LQTY staking contract LUSD fees-per-unit-staked", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: C } })

	//     // Check baseRate is zero
	//     const baseRate_1 = await contracts.troveManager.base_rate()
	//     assert.equal(baseRate_1, '0')

	//     // 2 hours pass
	//     await fastForwardTime(7200)

	//     // Check LUSD reward per LQTY staked == 0
	//     const f_aeusd_Before = await LQTYContracts.lqtyStaking.f_aeusd()
	//     assert.equal(f_aeusd_Before, '0')

	//     // A stakes LQTY
	//     await LQTYContracts.lqtyToken.unprotected_mint(AAddress, testHelper.dec(100, 18))
	//     await LQTYContracts.lqtyStaking.stake(testHelper.dec(100, 18), { onAccount: A })

	//     // D opens trove 
	//     await openTrove({ extraLUSDAmount: testHelper.dec(37, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: D } })

	//     // Check LUSD reward per LQTY staked > 0
	//     const F_LUSD_After = await LQTYContracts.lqtyStaking.f_aeusd()
	//     assert.isTrue(F_LUSD_After > 0)
	// })

	// it("openTrove(): Borrowing at zero base rate charges minimum fee", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: B } })

	//     const LUSDRequest = testHelper.dec(10000, 18)
	//     const txC = await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, LUSDRequest, CAddress, CAddress, { amount: dec(100, 'ae'), onAccount: C })
	//     const _LUSDFee = testHelper.getEventArgByIndex(txC, "AEUSDBorrowingFeePaid", 1)

	//     const expectedFee = BORROWING_FEE_FLOOR * LUSDRequest / testHelper.dec(1, 18)
	//     assert.equal(_LUSDFee, expectedFee)
	// })

	// it("openTrove(): reverts when system is in Recovery Mode and ICR < CCR", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     assert.isFalse(await testHelper.checkRecoveryMode(contracts))

	//     // price drops, and Recovery Mode kicks in
	//     await contracts.priceFeedTestnet.set_price(testHelper.dec(105, 18))

	//     assert.isTrue(await testHelper.checkRecoveryMode(contracts))

	//     // Bob tries to open a trove with 149% ICR during Recovery Mode
	//     const txPromise = openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(149, 16), extraParams: { onAccount: bob } })	    
	//     await testHelper.assertRevertOpenTrove(txPromise, "BorrowerOps: Operation must leave trove with ICR >= CCR")
	// })	

	// // test number 20 !
	// it("openTrove(): reverts when trove ICR < MCR", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })

	//     assert.isFalse(await testHelper.checkRecoveryMode(contracts))

	//     // Bob attempts to open a 109% ICR trove in Normal Mode
	//     const txPromise = openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(109, 16), extraParams: { onAccount: bob } })
	//     await testHelper.assertRevertOpenTrove(txPromise, "BorrowerOps: An operation that would result in ICR < MCR is not permitted")

	//     // price drops, and Recovery Mode kicks in
	//     await contracts.priceFeedTestnet.set_price(testHelper.dec(105, 18))

	//     assert.isTrue(await testHelper.checkRecoveryMode(contracts))

	//     // Bob attempts to open a 109% ICR trove in Recovery Mode
	//     const txPromise2 = openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(109, 16), extraParams: { onAccount: bob } })
	//     await testHelper.assertRevertOpenTrove(txPromise2, "BorrowerOps: Operation must leave trove with ICR >= CCR")	    
	// })

	// it("openTrove(): reverts when opening the trove would cause the TCR of the system to fall below the CCR", async () => {
	//     await contracts.priceFeedTestnet.set_price(testHelper.dec(100, 18))

	//     // Alice creates trove with 150% ICR.  System TCR = 150%.
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(15, 17), extraParams: { onAccount: alice } })

	//     const TCR = await testHelper.getTCR(contracts)
	//     assert.equal(TCR, testHelper.dec(150, 16))

	//     // Bob attempts to open a trove with ICR = 149% 
	//     // System TCR would fall below 150%
	//     const txPromise = openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(149, 16), extraParams: { onAccount: bob } })
	//     await testHelper.assertRevertOpenTrove(txPromise, "BorrowerOps: An operation that would result in TCR < CCR is not permitted")	    
	// })

	// it("openTrove(): reverts if trove is already active", async () => {
	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(10, 18), extraParams: { onAccount: A } })

	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(15, 17), extraParams: { onAccount: alice } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(15, 17), extraParams: { onAccount: bob } })

	//     const txPromiseBob = openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(3, 18), extraParams: { onAccount: bob } })
	//     await testHelper.assertRevertOpenTrove(txPromiseBob, "BorrowerOps: Trove is active")	    

	//     const txPromiseAlice = openTrove({ ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     await testHelper.assertRevertOpenTrove(txPromiseAlice, "BorrowerOps: Trove is active")	    	    
	// })

	// it("openTrove(): Can open a trove with ICR >= CCR when system is in Recovery Mode", async () => {
	//     // --- SETUP ---
	//     //  Alice and Bob add coll and withdraw such  that the TCR is ~150%
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(15, 17), extraParams: { onAccount: alice } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(15, 17), extraParams: { onAccount: bob } })

	//     const TCR = (await testHelper.getTCR(contracts)).toString()
	//     assert.equal(TCR, '1500000000000000000')

	//     // price drops to 1ETH:100LUSD, reducing TCR below 150%
	//     await contracts.priceFeedTestnet.set_price(BigInt('100000000000000000000'))
	//     const price = await contracts.priceFeedTestnet.get_price()

	//     assert.isTrue(await testHelper.checkRecoveryMode(contracts))

	//     // A opens at 150% ICR in Recovery Mode
	//     const txA = (await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(15, 17), extraParams: { onAccount: A } })).tx
	//     assert.equal(txA.result.returnType, 'ok')
	//     assert.isTrue(await contracts.sortedTroves.contains(AAddress))

	//     const A_TroveStatus = await contracts.troveManager.get_trove_status(AAddress)
	//     assert.equal(A_TroveStatus, 1)

	//     const A_ICR = await contracts.troveManager.get_current_icr(AAddress, price)
	//     assert.isTrue(A_ICR > testHelper.dec(150, 16))
	// })

	// it("openTrove(): Reverts opening a trove with min debt when system is in Recovery Mode", async () => {
	//     // --- SETUP ---
	//     //  Alice and Bob add coll and withdraw such  that the TCR is ~150%
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(15, 17), extraParams: { onAccount: alice } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(15, 17), extraParams: { onAccount: bob } })

	//     const TCR = (await testHelper.getTCR(contracts)).toString()
	//     assert.equal(TCR, '1500000000000000000')

	//     // price drops to 1ETH:100LUSD, reducing TCR below 150%
	//     await contracts.priceFeedTestnet.set_price(BigInt('100000000000000000000'))

	//     assert.isTrue(await testHelper.checkRecoveryMode(contracts))

	//     const txPromise = contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, await getNetBorrowingAmount(MIN_NET_DEBT), AAddress, AAddress, { onAccount: A, amount: testHelper.dec(1, 'ae') })
	//     await testHelper.assertRevert(txPromise,"BorrowerOps: Trove\'s net debt must be greater than minimum")
	// })

	// it("openTrove(): creates a new Trove and assigns the correct collateral and debt amount", async () => {
	//     const debt_Before = await getTroveEntireDebt(aliceAddress)
	//     const coll_Before = await getTroveEntireColl(aliceAddress)
	//     const status_Before = await contracts.troveManager.get_trove_status(aliceAddress)

	//     // check coll and debt before
	//     assert.equal(debt_Before, 0)
	//     assert.equal(coll_Before, 0)

	//     // check non-existent status
	//     assert.equal(status_Before, 0)

	//     const LUSDRequest = MIN_NET_DEBT
	//     await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, MIN_NET_DEBT, aliceAddress, aliceAddress, { onAccount: alice, amount: dec(100, 'ae') })

	//     // Get the expected debt based on the LUSD request (adding fee and liq. reserve on top)
	//     const expectedDebt = LUSDRequest +
	// 	  (await contracts.troveManager.get_borrowing_fee(LUSDRequest)) +
	// 	  LUSD_GAS_COMPENSATION

	//     const debt_After = await getTroveEntireDebt(aliceAddress)
	//     const coll_After = await getTroveEntireColl(aliceAddress)
	//     const status_After = await contracts.troveManager.get_trove_status(aliceAddress)

	//     // check coll and debt after
	//     assert.isTrue(coll_After > 0)
	//     assert.isTrue(debt_After > 0)

	//     assert.equal(debt_After, expectedDebt)

	//     // check active status
	//     assert.equal(status_After, 1)
	// })

	// it("openTrove(): adds Trove owner to TroveOwners array", async () => {
	//     const TroveOwnersCount_Before = (await contracts.troveManager.get_trove_owners_count()).toString();
	//     assert.equal(TroveOwnersCount_Before, '0')
	    
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(15, 17), extraParams: { onAccount: alice } })
	    
	//     const TroveOwnersCount_After = (await contracts.troveManager.get_trove_owners_count()).toString();
	//     assert.equal(TroveOwnersCount_After, '1')
	// })

	// it("openTrove(): creates a stake and adds it to total stakes", async () => {
	//     const aliceStakeBefore = await getTroveStake(aliceAddress)
	//     const totalStakesBefore = await contracts.troveManager.total_stakes()

	//     assert.equal(aliceStakeBefore, '0')
	//     assert.equal(totalStakesBefore, '0')

	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     const aliceCollAfter = await getTroveEntireColl(aliceAddress)
	//     const aliceStakeAfter = await getTroveStake(aliceAddress)
	//     assert.isTrue(aliceCollAfter > 0)
	//     assert.equal(aliceStakeAfter ,aliceCollAfter)
	    
	//     const totalStakesAfter = await contracts.troveManager.total_stakes()

	//     assert.equal(totalStakesAfter, aliceStakeAfter)
	// })

	// it("openTrove(): inserts Trove to Sorted Troves list", async () => {
	//     // Check before
	//     const aliceTroveInList_Before = await contracts.sortedTroves.contains(aliceAddress)
	//     const listIsEmpty_Before = await contracts.sortedTroves.is_empty()
	//     assert.isFalse(aliceTroveInList_Before)
	//     assert.isTrue(listIsEmpty_Before)

	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })

	//     // check after
	//     const aliceTroveInList_After = await contracts.sortedTroves.contains(aliceAddress)
	//     const listIsEmpty_After = await contracts.sortedTroves.is_empty()
	//     assert.isTrue(aliceTroveInList_After)
	//     assert.isFalse(listIsEmpty_After)
	// })

	// it("openTrove(): Increases the activePool AE and raw ether balance by correct amount", async () => {
	//     const activePool_ETH_Before = await contracts.activePool.get_ae()
	//     const activePool_RawEther_Before = await contracts.sdk.getBalance(contracts.activePool.address)
	//     assert.equal(activePool_ETH_Before, 0)
	//     assert.equal(activePool_RawEther_Before, 0)

	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     const aliceCollAfter = await getTroveEntireColl(aliceAddress)

	//     const activePool_ETH_After = await contracts.activePool.get_ae()
	//     const activePool_RawEther_After = BigInt(await contracts.sdk.getBalance(contracts.activePool.address))
	//     assert.equal(activePool_ETH_After, aliceCollAfter)
	//     assert.equal(activePool_RawEther_After, aliceCollAfter)
	// })

	// it("openTrove(): records up-to-date initial snapshots of L_AE and L_AEUSDDebt", async () => {
	//     // --- SETUP ---

	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })

	//     // --- TEST ---

	//     // price drops to 1ae:100ae_usd, reducing A's ICR below MCR
	//     await contracts.priceFeedTestnet.set_price(testHelper.dec(100, 18))	

	//     assert.isTrue(await testHelper.checkRecoveryMode(contracts))
	    
	//     // close A's Trove, liquidating her 1 ether and 180LUSD.
	//     // const liquidation = await contracts.troveManager.batch_liquidate_troves_aux([AAddress], { onAccount: B })
	//     // console.log(liquidation)
	//     const liquidationTx = await contracts.troveManager.original.methods.liquidate(AAddress, { onAccount: B }) // TODO: here B address is owner proxy ?
	//     const [liquidatedDebt, liquidatedColl, gasComp, laeusdGasComp] = testHelper.getEmittedLiquidationValues(liquidationTx)

	//     /* with total stakes = 10 ether, after liquidation, L_ETH should equal 1/10 ether per-ether-staked,
	//        and L_LUSD should equal 18 LUSD per-ether-staked. */

	//     const L_AE = await contracts.troveManager.l_ae()
	//     const L_AEUSD = await contracts.troveManager.l_aeusd_debt()

	//     assert.isTrue(L_AE > 0)
	//     assert.isTrue(L_AEUSD > 0 )

	//     // Bob opens trove
	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: bob } })

	//     // // Check Bob's snapshots of l_ae and l_aeusd equal the respective current values
	//     const bob_rewardSnapshot = await contracts.troveManager.reward_snapshots(bobAddress)
	//     const bob_ETHrewardSnapshot = bob_rewardSnapshot.ae
	//     const bob_LUSDDebtRewardSnapshot = bob_rewardSnapshot.aeusd_debt
	    
	//     assert.isAtMost(testHelper.getDifference(bob_ETHrewardSnapshot, L_AE), 1000)
	//     assert.isAtMost(testHelper.getDifference(bob_LUSDDebtRewardSnapshot, L_AEUSD), 1000)
	// })

	// it("openTrove(): allows a user to open a Trove, then close it, then re-open it", async () => {
	//     // Open Troves
	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: bob } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: A } })

	//     // Check Trove is active
	//     const alice_Trove_status_1 = await contracts.troveManager.get_trove_status(aliceAddress)
	//     assert.equal(alice_Trove_status_1, 1)
	//     assert.isTrue(await contracts.sortedTroves.contains(aliceAddress))

	//     // to compensate borrowing fees
	//     await contracts.aeusdToken.transfer(aliceAddress, testHelper.dec(10000, 18), { onAccount: bob })

	//     // Repay and close Trove
	//     await contracts.borrowerOperations.close_trove({ onAccount: alice })

	//     // Check Trove is closed
	//     const alice_Trove_status_2 = await contracts.troveManager.get_trove_status(aliceAddress)
	//     assert.equal(alice_Trove_status_2, 2)
	//     assert.isFalse(await contracts.sortedTroves.contains(aliceAddress))

	//     // Re-open Trove
	//     await openTrove({ extraLUSDAmount: testHelper.dec(5000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })

	//     // Check Trove is re-opened
	//     const alice_Trove_status_3 = await contracts.troveManager.get_trove_status(aliceAddress)
	//     assert.equal(alice_Trove_status_3, 1)
	//     assert.isTrue(await contracts.sortedTroves.contains(aliceAddress))
	// })

	// it("openTrove(): increases the Trove's ae_usd debt by the correct amount", async () => {
	//     // check before
	//     const alice_Trove_debt_Before = await contracts.troveManager.get_trove_debt(aliceAddress)
	//     assert.equal(alice_Trove_debt_Before, 0)

	//     await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, await getOpenTroveLUSDAmount(testHelper.dec(10000, 18)), aliceAddress, aliceAddress, { onAccount: alice, amount: testHelper.dec(100, 'ae') })
	    
	//     // check after
	//     const alice_Trove_debt_After = await contracts.troveManager.get_trove_debt(aliceAddress)
	//     testHelper.assertIsApproximatelyEqual(alice_Trove_debt_After, testHelper.dec(10000, 18), 10000)
	// })

	// it("openTrove(): increases ae usd debt in ActivePool by the debt of the trove", async () => {
	//     const activePool_aeusd_debt_Before = await contracts.activePool.get_aeusd_debt() 
	//     assert.equal(activePool_aeusd_debt_Before, 0)

	//     await openTrove({ extraLUSDAmount: testHelper.dec(10000, 18), ICR: testHelper.dec(2, 18), extraParams: { onAccount: alice } })
	//     const aliceDebt = await getTroveEntireDebt(aliceAddress)
	//     assert.isTrue(aliceDebt > 0)

	//     const activePool_aeusd_debt_After = await contracts.activePool.get_aeusd_debt() 
	//     assert.equal(activePool_aeusd_debt_After, aliceDebt)
	// })

	// it("openTrove(): increases user LUSDToken balance by correct amount", async () => {
	//     // check before
	//     const alice_aeusd_TokenBalance_Before = await contracts.aeusdToken.balance(aliceAddress)
	//     assert.equal(alice_aeusd_TokenBalance_Before, undefined)

	//     await contracts.borrowerOperations.original.methods.open_trove(testHelper._100pct, testHelper.dec(10000, 18), aliceAddress, aliceAddress, { onAccount: alice, amount: testHelper.dec(100, 'ae') })	    
	    
	//     // check after
	//     const alice_aesusd_TokenBalance_After = await contracts.aeusdToken.balance(aliceAddress)
	//     assert.equal(alice_aesusd_TokenBalance_After, dec(10000, 18))
	// })	
	
    } )
} )
