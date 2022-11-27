const { assert } = require( 'chai' )

import utils from '../utils/contract-utils'
import { wrapContractInstance } from '../utils/wrapper'
import { setupDeployment, connectCoreContracts  } from './shared/deploymentHelper'
import {
    testHelper, timeValues
} from './shared/testHelper'
const { dec, getDifference, assertRevert } = testHelper

import wallets from '../config/wallets.json'
const accounts = wallets.defaultWallets.map( x => x.publicKey )

describe( 'Borrower Operations', () => {
    
    describe( 'Borrower Operations Tests ...', () => {
        let contracts
        let LQTYContracts
        let timeOffsetForDebugger
        
        const getOpenTroveLUSDAmount = async ( totalDebt ) => testHelper.getOpenTroveLUSDAmount( contracts, totalDebt )
        const getNetBorrowingAmount = async ( debtWithFee ) => testHelper.getNetBorrowingAmount( contracts, debtWithFee )
        const getActualDebtFromComposite = async ( compositeDebt ) => testHelper.getActualDebtFromComposite( compositeDebt, contracts )
        const openTrove = async ( params ) => testHelper.openTrove( contracts, params )
        const getTroveEntireColl = async ( trove ) => testHelper.getTroveEntireColl( contracts, trove )
        const getTroveEntireDebt = async ( trove ) => testHelper.getTroveEntireDebt( contracts, trove )
        const getTroveStake = async ( trove ) => testHelper.getTroveStake( contracts, trove )
        
        let LUSD_GAS_COMPENSATION
        let MIN_NET_DEBT
        let BORROWING_FEE_FLOOR
        
        const fastForwardTime = async ( seconds ) => timeOffsetForDebugger.fast_forward_time(
            BigInt( seconds ) * 1000n
        )

        const getTimestampOffset = async (  ) => BigInt( await timeOffsetForDebugger.get_timestamp_offset() ) * 1000n
        
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
        //                                "BorrowerOps: An operation that would result in ICR < MCR is not permitted")
        //     // gives an 'v3/transactions error: Invalid tx' error
        // })

        // --- withdrawColl() ---

        it( "withdrawColl(): reverts when withdrawal would leave trove with ICR < MCR", async () => {
            // alice creates a Trove and adds first collateral
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: bob } } )

            // Price drops
            await contracts.priceFeedTestnet.set_price( testHelper.dec( 100, 18 ) )          
            const price = await contracts.priceFeedTestnet.get_price()

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )
            const icr = await contracts.troveManager.get_current_icr( aliceAddress, price )
            assert.isTrue( icr <  testHelper.dec( 110, 16 ) )

            const collWithdrawal = 1  // 1 wei withdrawal
            
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.withdraw_coll( 1, aliceAddress, aliceAddress, { onAccount: alice } ), 
                "BorrowerOps: An operation that would result in ICR < MCR is not permitted" )
        } )

        // reverts when calling address does not have active trove  
        it( "withdrawColl(): reverts when calling address does not have active trove", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: bob } } )

            // Bob successfully withdraws some coll
            const txBob = await contracts.borrowerOperations.original.methods.withdraw_coll( testHelper.dec( 100, 'finney' ), bobAddress, bobAddress, { onAccount: bob } )
            assert.equal( txBob.result.returnType, 'ok' )          

            // Carol with no active trove attempts to withdraw
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.withdraw_coll( testHelper.dec( 1, 'ae' ), AAddress, AAddress, { onAccount: A } ), 
                "BorrowerOps: Trove does not exist or is closed" )
        } )

        it( "withdrawColl(): reverts when system is in Recovery Mode", async () => {
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: bob } } )

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            // Withdrawal possible when recoveryMode == false
            const txAlice = await contracts.borrowerOperations.original.methods.withdraw_coll( 1000, aliceAddress, aliceAddress, { onAccount: alice } )
            assert.equal( txAlice.result.returnType, 'ok' )            

            await contracts.priceFeedTestnet.set_price( '105000000000000000000' )                  

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )         

            //Check withdrawal impossible when recoveryMode == true
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.withdraw_coll( 100, bobAddress, bobAddress, { onAccount: bob } ), 
                "BorrowerOps: Collateral withdrawal not permitted Recovery Mode" )
            
        } )

        it( "withdrawColl(): reverts when requested ETH withdrawal is > the trove's collateral", async () => {
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )

            const AColl = await getTroveEntireColl( AAddress )
            const bobColl = await getTroveEntireColl( bobAddress )
            // A withdraws exactly all her collateral
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.withdraw_coll( AColl, AAddress, AAddress, { onAccount: A } ), 
                "BorrowerOps: An operation that would result in ICR < MCR is not permitted" )

            // Bob attempts to withdraw 1 wei more than his collateral
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.withdraw_coll( bobColl + BigInt( 1 ), bobAddress, bobAddress, { onAccount: bob } ), 
                "Can not withdraw more coll than the available" )
            
        } )

        it( "withdrawColl(): reverts when withdrawal would bring the user's ICR < MCR", async () => {
            await openTrove( { ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: testHelper.dec( 11, 17 ), extraParams: { onAccount: bob } } ) // 110% ICR

            // Bob attempts to withdraws 1 wei, Which would leave him with < 110% ICR.
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.withdraw_coll( BigInt( 1 ), bobAddress, bobAddress, { onAccount: bob } ), 
                "BorrowerOps: An operation that would result in ICR < MCR is not permitted" )
        } )

        it( "withdrawColl(): reverts if system is in Recovery Mode", async () => {
            // --- SETUP ---

            // A and B open troves at 150% ICR
            await openTrove( { ICR: testHelper.dec( 15, 17 ), extraParams: { onAccount: bob } } )
            await openTrove( { ICR: testHelper.dec( 15, 17 ), extraParams: { onAccount: alice } } )

            const TCR = ( await testHelper.getTCR( contracts ) ).toString()
            assert.equal( TCR, '1500000000000000000' )

            // --- TEST ---

            // price drops to 1ae:150LUSD, reducing TCR below 150%
            await contracts.priceFeedTestnet.set_price( '150000000000000000000' )          

            //Alice tries to withdraw collateral during Recovery Mode
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.withdraw_coll( 1, aliceAddress, aliceAddress, { onAccount: alice } ), 
                "BorrowerOps: Collateral withdrawal not permitted Recovery Mode" )
            
        } )

        it( "withdrawColl(): doesn’t allow a user to completely withdraw all collateral from their Trove (due to gas compensation)", async () => {
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )

            const aliceColl = ( await contracts.troveManager.get_entire_debt_and_coll( aliceAddress ) )[1]

            // Check Trove is active
            const status_Before = await contracts.troveManager.get_trove_status( aliceAddress )
            assert.equal( status_Before, 1 )
            assert.isTrue( await contracts.sortedTroves.contains( aliceAddress ) )
            
            // Alice attempts to withdraw all collateral
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.withdraw_coll( aliceColl, aliceAddress, aliceAddress, { onAccount: alice } ), 
                'BorrowerOps: An operation that would result in ICR < MCR is not permitted' )
            
        } )

        it( "withdrawColl(): leaves the Trove active when the user withdraws less than all the collateral", async () => {
            // Open Trove 
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )

            // Check Trove is active
            const status_Before = await contracts.troveManager.get_trove_status( aliceAddress )
            assert.equal( status_Before, 1 )
            assert.isTrue( await contracts.sortedTroves.contains( aliceAddress ) )
            
            // Withdraw some collateral
            await contracts.borrowerOperations.withdraw_coll( testHelper.dec( 100, 'finney' ), aliceAddress, aliceAddress, { onAccount: alice } )

            // Check Trove is still active
            const status_After = await contracts.troveManager.get_trove_status( aliceAddress )
            assert.equal( status_After, 1 )
            assert.isTrue( await contracts.sortedTroves.contains( aliceAddress ) )
        } )   

        it( "withdrawColl(): reduces the Trove's collateral by the correct amount", async () => {
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            const aliceCollBefore = await getTroveEntireColl( aliceAddress )

            // Alice withdraws 1 ether
            await contracts.borrowerOperations.withdraw_coll( testHelper.dec( 1, 'ae' ), aliceAddress, aliceAddress, { onAccount: alice } )

            // Check 1 ether remaining
            const aliceCollAfter = await getTroveEntireColl( aliceAddress )

            assert.isTrue( aliceCollAfter == aliceCollBefore - testHelper.dec( 1, 'ae' ) )
        } )

        it( "withdrawColl(): reduces ActivePool ETH and raw ether by correct amount", async () => {
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            const aliceCollBefore = await getTroveEntireColl( aliceAddress )
            
            // check before
            const activePool_ae_before = BigInt( await contracts.activePool.get_ae() )
            const activePool_RawAe_before = BigInt( await contracts.sdk.getBalance( contracts.activePool.address ) )
            
            await contracts.borrowerOperations.withdraw_coll( testHelper.dec( 1, 'ae' ), aliceAddress, aliceAddress, { onAccount: alice } )

            // check after
            const activePool_ae_After = BigInt( await contracts.activePool.get_ae() )
            const activePool_RawAe_After = BigInt( await contracts.sdk.getBalance( contracts.activePool.address ) )
            assert.isTrue( activePool_ae_After == activePool_ae_before - testHelper.dec( 1, 'ae' ) )
            assert.isTrue( activePool_RawAe_After ==  activePool_RawAe_before - testHelper.dec( 1, 'ae' ) )
        } )

        it( "withdrawColl(): updates the stake and updates the total stakes", async () => {
            //  Alice creates initial Trove with 2 ether
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice, amount: testHelper.dec( 5, 'ae' ) } } )
            const aliceColl = await getTroveEntireColl( aliceAddress )
            assert.isTrue( aliceColl > 0 )
            
            const alice_Trove_Before = await contracts.troveManager.troves( aliceAddress )
            const alice_Stake_Before = BigInt( alice_Trove_Before.stake )
            const totalStakes_Before = BigInt( await contracts.troveManager.total_stakes() )

            assert.isTrue( alice_Stake_Before == aliceColl )
            assert.isTrue( totalStakes_Before == aliceColl )

            // Alice withdraws 1 ether
            await contracts.borrowerOperations.withdraw_coll( testHelper.dec( 1, 'ae' ), aliceAddress, aliceAddress, { onAccount: alice } )

            // Check stake and total stakes get updated
            const alice_Trove_After = await contracts.troveManager.troves( aliceAddress )
            const alice_Stake_After = BigInt( alice_Trove_After.stake )
            const totalStakes_After = BigInt( await contracts.troveManager.total_stakes() )

            assert.isTrue( alice_Stake_After == alice_Stake_Before - testHelper.dec( 1, 'ae' ) )
            assert.isTrue( totalStakes_After == totalStakes_Before - testHelper.dec( 1, 'ae' ) )
        } )

        it( "withdrawColl(): sends the correct amount of ae to the user", async () => {
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice, amount: testHelper.dec( 2, 'ae' ) } } )
            
            const alice_AeBalance_Before = BigInt( await contracts.sdk.getBalance( aliceAddress ) )
            await contracts.borrowerOperations.withdraw_coll( testHelper.dec( 1, 'ae' ), aliceAddress, aliceAddress, { onAccount: alice } ) // , gasPrice: 0

            const alice_AeBalance_After = BigInt( await contracts.sdk.getBalance( aliceAddress ) )
            const balanceDiff = alice_AeBalance_After - alice_AeBalance_Before

            // TODO: check this difference is all about gasPrice 
            assert.isAtMost( testHelper.getDifference( balanceDiff, testHelper.dec( 1, 'ae' ) ), 296440000000000 )
            //assert.equal(balanceDiff, testHelper.dec(1, 'ae'))
        } )   

        it( "withdrawColl(): applies pending rewards and updates user's L_AE, L_LUSDDebt snapshots", async () => {
            // --- SETUP ---
            // Alice adds 15 ae, Bob adds 5 ae, B adds 1 ae
            await openTrove( { ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: A /* whale */ } } )
            await openTrove( { ICR: testHelper.dec( 3, 18 ), extraParams: { onAccount: alice, amount: testHelper.dec( 100, 'ae' ) } } )
            await openTrove( { ICR: testHelper.dec( 3, 18 ), extraParams: { onAccount: bob, amount: testHelper.dec( 100, 'ae' ) } } )
            await openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B /* carol */, amount: testHelper.dec( 10, 'ae' ) } } )

            const aliceCollBefore = await getTroveEntireColl( aliceAddress )
            const aliceDebtBefore = await getTroveEntireDebt( aliceAddress )
            const bobCollBefore = await getTroveEntireColl( bobAddress )
            const bobDebtBefore = await getTroveEntireDebt( bobAddress )

            // --- TEST ---

            // price drops to 1AE:100AEUSD, reducing B's ICR below MCR
            await contracts.priceFeedTestnet.set_price( '100000000000000000000' )           

            // close B's Trove, liquidating her 1 ae and 180AEUSD.
            await contracts.troveManager.liquidate( BAddress, { onAccount: C /*owner*/ } )

            const L_AE = await contracts.troveManager.l_ae()
            const L_AEUSDDebt = await contracts.troveManager.l_aeusd_debt()

            // check Alice and Bob's reward snapshots are zero before they alter their Troves
            const alice_rewardSnapshot_Before = await contracts.troveManager.reward_snapshots( aliceAddress )
            const alice_AErewardSnapshot_Before = alice_rewardSnapshot_Before.ae
            const alice_AEUSDDebtRewardSnapshot_Before = alice_rewardSnapshot_Before.aeusd_debt
            
            const bob_rewardSnapshot_Before = await contracts.troveManager.reward_snapshots( bobAddress )
            const bob_AErewardSnapshot_Before = bob_rewardSnapshot_Before.ae
            const bob_AEUSDDebtRewardSnapshot_Before = bob_rewardSnapshot_Before.aeusd_debt

            assert.equal( alice_AErewardSnapshot_Before, 0 )
            assert.equal( alice_AEUSDDebtRewardSnapshot_Before, 0 )
            assert.equal( bob_AErewardSnapshot_Before, 0 )
            assert.equal( bob_AEUSDDebtRewardSnapshot_Before, 0 )

            // Check A and B have pending rewards
            const pendingCollReward_A = await contracts.troveManager.get_pending_ae_reward( aliceAddress )
            const pendingDebtReward_A = await contracts.troveManager.get_pending_aeusd_debt_reward( aliceAddress )
            const pendingCollReward_B = await contracts.troveManager.get_pending_ae_reward( bobAddress )
            const pendingDebtReward_B = await contracts.troveManager.get_pending_aeusd_debt_reward( bobAddress )

            var reward
            for ( reward of [ pendingCollReward_A, pendingDebtReward_A, pendingCollReward_B, pendingDebtReward_B ] ) {
                assert.isTrue( reward > 0 )
            }

            // Alice and Bob withdraw from their Troves
            const aliceCollWithdrawal = testHelper.dec( 5, 'ae' )
            const bobCollWithdrawal = testHelper.dec( 1, 'ae' )
            
            await contracts.borrowerOperations.withdraw_coll( aliceCollWithdrawal, aliceAddress, aliceAddress, { onAccount: alice } )
            await contracts.borrowerOperations.withdraw_coll( bobCollWithdrawal, bobAddress, bobAddress, { onAccount: bob } )

            // Check that both alice and Bob have had pending rewards applied in addition to their top-ups. 
            const aliceCollAfter = await getTroveEntireColl( aliceAddress )
            const aliceDebtAfter = await getTroveEntireDebt( aliceAddress )
            const bobCollAfter = await getTroveEntireColl( bobAddress )
            const bobDebtAfter = await getTroveEntireDebt( bobAddress )

            // Check rewards have been applied to troves
            testHelper.assertIsApproximatelyEqual( aliceCollAfter, aliceCollBefore + pendingCollReward_A  - aliceCollWithdrawal, 10000 )
            testHelper.assertIsApproximatelyEqual( aliceDebtAfter, aliceDebtBefore + pendingDebtReward_A, 10000 )
            testHelper.assertIsApproximatelyEqual( bobCollAfter, bobCollBefore + pendingCollReward_B - bobCollWithdrawal, 10000 )
            testHelper.assertIsApproximatelyEqual( bobDebtAfter, bobDebtBefore + pendingDebtReward_B, 10000 )

            /* After top up, both Alice and Bob's snapshots of the rewards-per-unit-staked metrics should be updated
               to the latest values of L_AE and L_AEUSDDebt */
            const alice_rewardSnapshot_After = await contracts.troveManager.reward_snapshots( aliceAddress ) 
            const alice_AErewardSnapshot_After = alice_rewardSnapshot_After.ae
            const alice_AEUSDDebtRewardSnapshot_After = alice_rewardSnapshot_After.aeusd_debt

            const bob_rewardSnapshot_After = await contracts.troveManager.reward_snapshots( bobAddress )
            const bob_AErewardSnapshot_After = bob_rewardSnapshot_After.ae
            const bob_AEUSDDebtRewardSnapshot_After = bob_rewardSnapshot_After.aeusd_debt

            assert.isAtMost( testHelper.getDifference( alice_AErewardSnapshot_After, L_AE ), 100 )
            assert.isAtMost( testHelper.getDifference( alice_AEUSDDebtRewardSnapshot_After, L_AEUSDDebt ), 100 )
            assert.isAtMost( testHelper.getDifference( bob_AErewardSnapshot_After, L_AE ), 100 )
            assert.isAtMost( testHelper.getDifference( bob_AEUSDDebtRewardSnapshot_After, L_AEUSDDebt ), 100 )
        } )

        // --- withdrawLUSD() ---

        it( "withdrawLUSD(): reverts when withdrawal would leave trove with ICR < MCR", async () => {
            // alice creates a Trove and adds first collateral
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            // Price drops
            await contracts.priceFeedTestnet.set_price( dec( 100, 18 ) )
            const price = await contracts.priceFeedTestnet.get_price()

            assert.isFalse( await contracts.troveManager.check_recovery_mode( price ) )
            assert.isTrue( ( await contracts.troveManager.get_current_icr( aliceAddress, price ) ) <  dec( 110, 16 ) ) 

            const aeusdwithdrawal = 1  // withdraw 1 wei aeusd

            const txPromise = contracts.borrowerOperations.original.methods.withdraw_aeusd( testHelper._100pct, aeusdwithdrawal, aliceAddress, aliceAddress, { onAccount: alice } ) 
            await assertRevert( txPromise,
                "BorrowerOps: An operation that would result in ICR < MCR is not permitted" )
        } )

        it( "withdrawLUSD(): decays a non-zero base rate", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            await openTrove( { extraLUSDAmount: dec( 20, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 20, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 20, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )
            await openTrove( { extraLUSDAmount: dec( 20, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: E } } )

            const A_LUSDBal = await contracts.aeusdToken.balance( AAddress )

            // Artificially set base rate to 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 >  '0' )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D withdraws LUSD
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 1, 18 ), AAddress, AAddress, { onAccount: D } )

            // Check baseRate has decreased
            const baseRate_2 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_2 <  baseRate_1 )

            // 1 hour passes
            await fastForwardTime( 3600 )

            // E withdraws LUSD
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 1, 18 ), AAddress, AAddress, { onAccount: E } )

            const baseRate_3 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_3 <  baseRate_2 )
        } )

        it( "withdrawLUSD(): reverts if max fee > 100%", async () => {
            await openTrove( { extraLUSDAmount: dec( 10, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 20, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            await assertRevert( contracts.borrowerOperations.original.methods.withdraw_aeusd( dec( 2, 18 ), dec( 1, 18 ), AAddress, AAddress, { onAccount: A } ), "Max fee percentage must be between 0.5% and 100%" )
            await assertRevert( contracts.borrowerOperations.original.methods.withdraw_aeusd( '1000000000000000001', dec( 1, 18 ), AAddress, AAddress, { onAccount: A } ), "Max fee percentage must be between 0.5% and 100%" )
        } )

        it( "withdrawLUSD(): reverts if max fee < 0.5% in Normal mode", async () => {
            await openTrove( { extraLUSDAmount: dec( 10, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 20, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            await assertRevert( contracts.borrowerOperations.original.methods.withdraw_aeusd( 0, dec( 1, 18 ), AAddress, AAddress, { onAccount: A } ), "Max fee percentage must be between 0.5% and 100%" )
            await assertRevert( contracts.borrowerOperations.original.methods.withdraw_aeusd( 1, dec( 1, 18 ), AAddress, AAddress, { onAccount: A } ), "Max fee percentage must be between 0.5% and 100%" )
            await assertRevert( contracts.borrowerOperations.original.methods.withdraw_aeusd( '4999999999999999', dec( 1, 18 ), AAddress, AAddress, { onAccount: A } ), "Max fee percentage must be between 0.5% and 100%" )
        } )

        it( "withdrawLUSD(): reverts if fee exceeds max fee percentage", async () => {
            await openTrove( { extraLUSDAmount: dec( 60, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 60, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 70, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 80, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )
            await openTrove( { extraLUSDAmount: dec( 180, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: E } } )

            const totalSupply = await contracts.aeusdToken.total_supply()

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            let baseRate = await contracts.troveManager.base_rate() // expect 5% base rate
            assert.equal( baseRate, dec( 5, 16 ) )

            // 100%: 1e18,  10%: 1e17,  1%: 1e16,  0.1%: 1e15
            // 5%: 5e16
            // 0.5%: 5e15
            // actual: 0.5%, 5e15

            // LUSDFee:                  15000000558793542
            // absolute _fee:            15000000558793542
            // actual feePercentage:      5000000186264514
            // user's _maxFeePercentage: 49999999999999999

            const lessThan5pct = '49999999999999999'
            await assertRevert( contracts.borrowerOperations.original.methods.withdraw_aeusd( lessThan5pct, dec( 3, 18 ), AAddress, AAddress, { onAccount: A } ), "Fee exceeded provided maximum" )

            baseRate = await contracts.troveManager.base_rate() // expect 5% base rate
            assert.equal( baseRate, dec( 5, 16 ) )
            // Attempt with maxFee 1%
            await assertRevert( contracts.borrowerOperations.original.methods.withdraw_aeusd( dec( 1, 16 ), dec( 1, 18 ), AAddress, AAddress, { onAccount: B } ), "Fee exceeded provided maximum" )

            baseRate = await contracts.troveManager.base_rate()  // expect 5% base rate
            assert.equal( baseRate, dec( 5, 16 ) )
            // Attempt with maxFee 3.754%
            await assertRevert( contracts.borrowerOperations.original.methods.withdraw_aeusd( dec( 3754, 13 ), dec( 1, 18 ), AAddress, AAddress, { onAccount: C } ), "Fee exceeded provided maximum" )

            baseRate = await contracts.troveManager.base_rate()  // expect 5% base rate
            assert.equal( baseRate, dec( 5, 16 ) )
            // Attempt with maxFee 0.5%%
            await assertRevert( contracts.borrowerOperations.original.methods.withdraw_aeusd( dec( 5, 15 ), dec( 1, 18 ), AAddress, AAddress, { onAccount: D } ), "Fee exceeded provided maximum" )
        } )

        it( "withdrawLUSD(): succeeds when fee is less than max fee percentage", async () => {
            await openTrove( { extraLUSDAmount: dec( 60, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 60, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 70, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 80, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )
            await openTrove( { extraLUSDAmount: dec( 180, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: E } } )

            const totalSupply = await contracts.aeusdToken.total_supply()

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            let baseRate = await contracts.troveManager.base_rate() // expect 5% base rate
            assert.equal( baseRate,  dec( 5, 16 ) )

            // Attempt with maxFee > 5%
            const moreThan5pct = '50000000000000001'
            const tx1 = await contracts.borrowerOperations.original.methods.withdraw_aeusd( moreThan5pct, dec( 1, 18 ), AAddress, AAddress, { onAccount: A } )
            assert.equal( tx1.result.returnType, 'ok' )

            baseRate = await contracts.troveManager.base_rate() // expect 5% base rate
            assert.equal( baseRate, dec( 5, 16 ) )

            // Attempt with maxFee = 5%
            const tx2 = await contracts.borrowerOperations.original.methods.withdraw_aeusd( dec( 5, 16 ), dec( 1, 18 ), AAddress, AAddress, { onAccount: B } )
            assert.equal( tx2.result.returnType, 'ok' )

            baseRate = await contracts.troveManager.base_rate() // expect 5% base rate
            assert.equal( baseRate, dec( 5, 16 ) )

            // Attempt with maxFee 10%
            const tx3 = await contracts.borrowerOperations.original.methods.withdraw_aeusd( dec( 1, 17 ), dec( 1, 18 ), AAddress, AAddress, { onAccount: C } )
            assert.equal( tx3.result.returnType, 'ok' )

            baseRate = await contracts.troveManager.base_rate() // expect 5% base rate
            assert.equal( baseRate, dec( 5, 16 ) )

            // Attempt with maxFee 37.659%
            const tx4 = await contracts.borrowerOperations.original.methods.withdraw_aeusd( dec( 37659, 13 ), dec( 1, 18 ), AAddress, AAddress, { onAccount: D } )
            assert.equal( tx4.result.returnType, 'ok' )

            // Attempt with maxFee 100%
            const tx5 = await contracts.borrowerOperations.original.methods.withdraw_aeusd( dec( 1, 18 ), dec( 1, 18 ), AAddress, AAddress, { onAccount: E } )
            assert.equal( tx5.result.returnType, 'ok' )
        } )

        it( "withdrawLUSD(): doesn't change base rate if it is already zero", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: E } } )

            // Check baseRate is zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_1, '0' )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D withdraws LUSD
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 37, 18 ), AAddress, AAddress, { onAccount: D } )

            // Check baseRate is still 0
            const baseRate_2 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_2, '0' )

            // 1 hour passes
            await fastForwardTime( 3600 )

            // E opens trove 
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 12, 18 ), AAddress, AAddress, { onAccount: E } )

            const baseRate_3 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_3, '0' )
        } )

        it( "owithdrawLUSD(): lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            const lastFeeOpTime_1 = await contracts.troveManager.get_last_fee_operation_time()

            // 10 seconds pass
            await fastForwardTime( 10 )

            // Borrower C triggers a fee
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 1, 18 ), CAddress, CAddress, { onAccount: C } )

            const lastFeeOpTime_2 = await contracts.troveManager.get_last_fee_operation_time()

            // Check that the last fee operation time did not update, as borrower D's debt issuance occured
            // since before minimum interval had passed 
            assert.equal( lastFeeOpTime_2, lastFeeOpTime_1 )

            // 60 seconds passes
            await fastForwardTime( 60 )

            // Check that now, at least one minute has passed since lastFeeOpTime_1
            const timeNow = await contracts.troveManager.get_timestamp_exported()// TODO: is not equivalent to await testHelper.getLatestBlockTimestamp(contracts.sdk) ? 
            assert.isTrue( BigInt( timeNow ) - lastFeeOpTime_1 >= BigInt( 60 ) )

            // Borrower C triggers a fee
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 1, 18 ), CAddress, CAddress, { onAccount: C } )

            const lastFeeOpTime_3 = await contracts.troveManager.get_last_fee_operation_time()

            // Check that the last fee operation time DID update, as borrower's debt issuance occured
            // after minimum interval had passed 
            assert.isTrue( lastFeeOpTime_3 > lastFeeOpTime_1 )
        } )

        it( "withdrawLUSD(): borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 30 seconds pass
            await fastForwardTime( 30 )

            // Borrower C triggers a fee, before decay interval has passed
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 1, 18 ), CAddress, CAddress, { onAccount: C } )

            // 30 seconds pass
            await fastForwardTime( 30 )

            // Borrower C triggers another fee
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 1, 18 ), CAddress, CAddress, { onAccount: C } )

            // Check base rate has decreased even though Borrower tried to stop it decaying
            const baseRate_2 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_2 < baseRate_1 )
        } )

        it( "withdrawLUSD(): borrowing at non-zero base rate sends LUSD fee to LQTY staking contract", async () => {
            // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( dec( 1, 18 ), { onAccount: multisig } )

            // Check LQTY LUSD balance before == 0
            const lqtyStaking_LUSDBalance_Before = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.equal( lqtyStaking_LUSDBalance_Before, undefined )

            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D withdraws LUSD
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 37, 18 ), CAddress, CAddress, { onAccount: D } )

            // Check LQTY LUSD balance after has increased
            const lqtyStaking_LUSDBalance_After = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.isTrue( lqtyStaking_LUSDBalance_After > 0 )
        } )

        it( "withdrawLUSD(): borrowing at non-zero base records the (drawn debt + fee) on the Trove struct", async () => {
        // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( dec( 1, 18 ), { onAccount: multisig } )

            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )
            const D_debtBefore = await getTroveEntireDebt( DAddress )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D withdraws LUSD
            const withdrawal_D = dec( 37, 18 )
            const withdrawalTx = await contracts.borrowerOperations.original.methods.withdraw_aeusd( testHelper._100pct, withdrawal_D, DAddress, DAddress, { onAccount: D } )
            const emittedFee = testHelper.getAEUSDFeeFromAEUSDBorrowingEvent( withdrawalTx )
            assert.isTrue( emittedFee > 0 )

            const newDebt = ( await contracts.troveManager.troves( DAddress ) ).debt

            // Check debt on Trove struct equals initial debt + withdrawal + emitted fee
            testHelper.assertIsApproximatelyEqual( newDebt, D_debtBefore + withdrawal_D + emittedFee, 10000 )
        } )

        it( "withdrawLUSD(): Borrowing at non-zero base rate increases the LQTY staking contract LUSD fees-per-unit-staked", async () => {
            // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( dec( 1, 18 ), { onAccount: multisig } )

            // Check LQTY contract LUSD fees-per-unit-staked is zero
            const F_LUSD_Before = await LQTYContracts.lqtyStaking.f_aeusd()
            assert.equal( F_LUSD_Before, 0 )

            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D withdraws LUSD
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 37, 18 ), DAddress, DAddress, { onAccount: D } )

            // Check LQTY contract LUSD fees-per-unit-staked has increased
            const F_LUSD_After = await LQTYContracts.lqtyStaking.f_aeusd()
            assert.isTrue( F_LUSD_After >  F_LUSD_Before )
        } )

        it( "withdrawLUSD(): Borrowing at non-zero base rate sends requested amount to the user", async () => {
            // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( dec( 1, 18 ), { onAccount: multisig } )

            // Check LQTY Staking contract balance before == 0
            const lqtyStaking_LUSDBalance_Before = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.equal( lqtyStaking_LUSDBalance_Before, undefined )

            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            const D_LUSDBalanceBefore = await contracts.aeusdToken.balance( DAddress )

            // D withdraws LUSD
            const D_LUSDRequest = dec( 37, 18 )
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, D_LUSDRequest, DAddress, DAddress, { onAccount: D } )

            // Check LQTY staking LUSD balance has increased
            const lqtyStaking_LUSDBalance_After = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.isTrue( lqtyStaking_LUSDBalance_After > 0 )

            // Check D's LUSD balance now equals their initial balance plus request LUSD
            const D_LUSDBalanceAfter = await contracts.aeusdToken.balance( DAddress )
            assert.equal( D_LUSDBalanceAfter, D_LUSDBalanceBefore + D_LUSDRequest )
        } )

        it( "withdrawLUSD(): Borrowing at zero base rate changes LUSD fees-per-unit-staked", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check baseRate is zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_1, 0 )

            // A artificially receives LQTY, then stakes it
            await LQTYContracts.lqtyToken.unprotected_mint( AAddress, dec( 100, 18 ) )
            await LQTYContracts.lqtyStaking.stake( dec( 100, 18 ), { onAccount: A } )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // Check LQTY LUSD balance before == 0
            const F_LUSD_Before = await LQTYContracts.lqtyStaking.f_aeusd()
            assert.equal( F_LUSD_Before, 0 )

            // D withdraws LUSD
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 37, 18 ), DAddress, DAddress, { onAccount: D } )

            // Check LQTY LUSD balance after > 0
            const F_LUSD_After = await LQTYContracts.lqtyStaking.f_aeusd()
            assert.isTrue( F_LUSD_After > 0 )
        } )

        it( "withdrawLUSD(): Borrowing at zero base rate sends debt request to user", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check baseRate is zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_1, 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            const D_LUSDBalanceBefore = await contracts.aeusdToken.balance( DAddress )

            // D withdraws LUSD
            const D_LUSDRequest = dec( 37, 18 )
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 37, 18 ), DAddress, DAddress, { onAccount: D } )

            // Check D's LUSD balance now equals their requested LUSD
            const D_LUSDBalanceAfter = await contracts.aeusdToken.balance( DAddress )

            // Check D's trove debt == D's LUSD balance + liquidation reserve
            assert.equal( D_LUSDBalanceAfter,  D_LUSDBalanceBefore + D_LUSDRequest )
        } )

        it( "withdrawLUSD(): reverts when calling address does not have active trove", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )

            // Bob successfully withdraws LUSD
            const txBob = await contracts.borrowerOperations.original.methods.withdraw_aeusd( testHelper._100pct, dec( 100, 18 ), bobAddress, bobAddress, { onAccount: bob } )
            assert.equal( txBob.result.returnType, 'ok' )

            // A account with no active trove attempts to withdraw LUSD
            const txPromise = contracts.borrowerOperations.original.methods.withdraw_aeusd( testHelper._100pct, dec( 100, 18 ), AAddress, AAddress, { onAccount: A } )
            await assertRevert( txPromise, "BorrowerOps: Trove does not exist or is closed" )
        } )

        it( "withdrawLUSD(): reverts when requested withdrawal amount is zero LUSD", async () => {
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )

            // Bob successfully withdraws 1e-18 LUSD
            const txBob = await contracts.borrowerOperations.original.methods.withdraw_aeusd( testHelper._100pct, 1, bobAddress, bobAddress, { onAccount: bob } )
            assert.equal( txBob.result.returnType, 'ok' )

            // Alice attempts to withdraw 0 LUSD
            const txAlice = contracts.borrowerOperations.original.methods.withdraw_aeusd( testHelper._100pct, 0, aliceAddress, aliceAddress, { onAccount: alice } )
            await assertRevert( txAlice, "BorrowerOps: Debt increase requires non-zero debtChange" )
        } )

        it( "withdrawLUSD(): reverts when system is in Recovery Mode", async () => {
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            // Withdrawal possible when recoveryMode == false
            const txAlice = await contracts.borrowerOperations.original.methods.withdraw_aeusd( testHelper._100pct, dec( 100, 18 ), aliceAddress, aliceAddress, { onAccount: alice } )
            assert.equal( txAlice.result.returnType, 'ok' )

            await contracts.priceFeedTestnet.set_price( '50000000000000000000' )

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            //Check LUSD withdrawal impossible when recoveryMode == true

            const txBob = contracts.borrowerOperations.original.methods.withdraw_aeusd( testHelper._100pct, 1, bobAddress, bobAddress, { onAccount: bob } )
            await assertRevert( txBob, "BorrowerOps: Operation must leave trove with ICR >= CCR" )
        } )

        it( "withdrawLUSD(): reverts when withdrawal would bring the trove's ICR < MCR", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 11, 17 ), extraParams: { onAccount: bob } } )

            // Bob tries to withdraw LUSD that would bring his ICR < MCR

            const txBob = contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, 1, bobAddress, bobAddress, { onAccount: bob } )
            await assertRevert( txBob, "BorrowerOps: An operation that would result in ICR < MCR is not permitted" )
        } )

        it( "withdrawLUSD(): reverts when a withdrawal would cause the TCR of the system to fall below the CCR", async () => {
            await contracts.priceFeedTestnet.set_price( dec( 100, 18 ) )
            const price = await contracts.priceFeedTestnet.get_price()

            // Alice and Bob creates troves with 150% ICR.  System TCR = 150%.
            await openTrove( { ICR: dec( 15, 17 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 15, 17 ), extraParams: { onAccount: bob } } )

            var TCR = ( await testHelper.getTCR( contracts ) ).toString()
            assert.equal( TCR, '1500000000000000000' )

            // Bob attempts to withdraw 1 LUSD.
            // System TCR would be: ((3+3) * 100 ) / (200+201) = 600/401 = 149.62%, i.e. below CCR of 150%.
            const txBob = contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 1, 18 ), bobAddress, bobAddress, { onAccount: bob } )
            await assertRevert( txBob, "BorrowerOps: An operation that would result in TCR < CCR is not permitted" )
        } )

        it( "withdrawLUSD(): reverts if system is in Recovery Mode", async () => {
            // --- SETUP ---
            await openTrove( { ICR: dec( 15, 17 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 15, 17 ), extraParams: { onAccount: bob } } )

            // --- TEST ---

            // price drops to 1ETH:150LUSD, reducing TCR below 150%
            await contracts.priceFeedTestnet.set_price( '150000000000000000000' )
            assert.isTrue( ( await testHelper.getTCR( contracts ) ) < dec( 15, 17 ) )

            const txData = contracts.borrowerOperations.original.methods.withdraw_aeusd( testHelper._100pct, '200', aliceAddress, aliceAddress, { onAccount: alice } )
            await assertRevert( txData, "BorrowerOps: Operation must leave trove with ICR >= CCR" )
        } )

        it( "withdrawLUSD(): increases the Trove's LUSD debt by the correct amount", async () => {
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )

            // check before
            const aliceDebtBefore = await getTroveEntireDebt( aliceAddress )
            assert.isTrue( aliceDebtBefore > 0 )

            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, await getNetBorrowingAmount( 100 ), aliceAddress, aliceAddress, { onAccount: alice } )

            // check after
            const aliceDebtAfter = await getTroveEntireDebt( aliceAddress )
            testHelper.assertIsApproximatelyEqual( aliceDebtAfter, aliceDebtBefore + BigInt( 100 ) )
        } )

        // it( "withdrawLUSD(): increases LUSD debt in ActivePool by correct amount", async () => {
        //     await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: alice, amount: dec( 100, 'ae' ) } } )

        //     const aliceDebtBefore = await getTroveEntireDebt( aliceAddress )
        //     assert.isTrue( aliceDebtBefore > 0 )

        //     // check before
        //     const activePool_LUSD_Before = await contracts.activePool.get_aeusd_debt()
        //     assert.equal( activePool_LUSD_Before, aliceDebtBefore )

        //     await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, await getNetBorrowingAmount( dec( 10000, 18 ) ), aliceAddress, aliceAddress, { onAccount: alice } )

        //     // check after
        //     const activePool_LUSD_After = await contracts.activePool.get_aeusd_debt()
        //     testHelper.assertIsApproximatelyEqual( activePool_LUSD_After, activePool_LUSD_Before + dec( 10000, 18 ) )
        // } )

        it( "withdrawLUSD(): increases user LUSDToken balance by correct amount", async () => {
            await openTrove( { extraParams: { amount: dec( 100, 'ae' ), onAccount: alice } } )

            // check before
            const alice_LUSDTokenBalance_Before = await contracts.aeusdToken.balance( aliceAddress )
            assert.isTrue( alice_LUSDTokenBalance_Before > 0 )

            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 10000, 18 ), aliceAddress, aliceAddress, { onAccount: alice } )

            // check after
            const alice_LUSDTokenBalance_After = await contracts.aeusdToken.balance( aliceAddress )
            assert.equal( alice_LUSDTokenBalance_After,  alice_LUSDTokenBalance_Before + dec( 10000, 18 ) )
        } )

        // --- repayLUSD() ---
        it( "repayLUSD(): reverts when repayment would leave trove with ICR < MCR", async () => {
            // alice creates a Trove and adds first collateral
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            // Price drops
            await contracts.priceFeedTestnet.set_price( testHelper.dec( 100, 18 ) )            
            const price = await contracts.priceFeedTestnet.get_price()

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )
            assert.isTrue( ( await contracts.troveManager.get_current_icr( aliceAddress, price ) ) <  dec( 110, 16 ) )

            const AeUSDRepayment = 1  // 1 wei repayment

            const txPromise = contracts.borrowerOperations.original.methods.repay_aeusd( AeUSDRepayment, aliceAddress, aliceAddress, { onAccount: alice } )
            await assertRevert( txPromise, "BorrowerOps: An operation that would result in ICR < MCR is not permitted" )
        } )

        it( "repayLUSD(): Succeeds when it would leave trove with net debt >= minimum net debt", async () => {
            // Make the LUSD request 2 wei above min net debt to correct for floor division, and make net debt = min net debt + 1 wei
            await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, await getNetBorrowingAmount( MIN_NET_DEBT + BigInt( 2 )  ), AAddress, AAddress, { onAccount: A, amount: dec( 100, 30 ) } )

            const repayTxA = await contracts.borrowerOperations.original.methods.repay_aeusd( 1, AAddress, AAddress, { onAccount: A } )
            assert.equal( repayTxA.result.returnType, 'ok' )

            await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, dec( 20, 25 ), BAddress, BAddress, { onAccount: B, amount: dec( 100, 30 ) } )

            const repayTxB = await contracts.borrowerOperations.original.methods.repay_aeusd( dec( 19, 25 ), BAddress, BAddress, { onAccount: B } )
            assert.equal( repayTxB.result.returnType, 'ok' )
        } )

        it( "repayLUSD(): reverts when it would leave trove with net debt < minimum net debt", async () => {
            // Make the LUSD request 2 wei above min net debt to correct for floor division, and make net debt = min net debt + 1 wei
            await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, await getNetBorrowingAmount( MIN_NET_DEBT + BigInt( '2' ) ), AAddress, AAddress, { onAccount: A, amount: dec( 100, 30 ) } )

            const repayTxAPromise = contracts.borrowerOperations.original.methods.repay_aeusd( 2, AAddress, AAddress, { onAccount: A } )
            await assertRevert( repayTxAPromise, "BorrowerOps: Trove's net debt must be greater than minimum" )
        } )

        it( "repayLUSD(): reverts when calling address does not have active trove", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            // Bob successfully repays some LUSD
            const txBob = await contracts.borrowerOperations.original.methods.repay_aeusd( dec( 10, 18 ), bobAddress, bobAddress, { onAccount: bob } )
            assert.equal( txBob.result.returnType, 'ok' )

            // A with no active trove attempts to repayLUSD
            const repayTxAPromise = contracts.borrowerOperations.original.methods.repay_aeusd( 2, AAddress, AAddress, { onAccount: A } )
            await assertRevert( repayTxAPromise, "BorrowerOps: Trove does not exist or is closed" )
        } )

        it( "repayLUSD(): reverts when attempted repayment is > the debt of the trove", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            const aliceDebt = await getTroveEntireDebt( aliceAddress )

            // Bob successfully repays some LUSD
            const txBob = await contracts.borrowerOperations.original.methods.repay_aeusd( dec( 10, 18 ), bobAddress, bobAddress, { onAccount: bob } )
            assert.equal( txBob.result.returnType, 'ok' )

            // Alice attempts to repay more than her debt
            const repayTxAPromise = contracts.borrowerOperations.original.methods.repay_aeusd( aliceDebt + dec( 1, 18 ), aliceAddress, aliceAddress, { onAccount: alice } )
            await assertRevert( repayTxAPromise, "Can not reduce the debt more than the existent" )
        } )

        //repayLUSD: reduces LUSD debt in Trove
        it( "repayLUSD(): reduces the Trove's LUSD debt by the correct amount", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            const aliceDebtBefore = await getTroveEntireDebt( aliceAddress )
            assert.isTrue( aliceDebtBefore > 0 )

            await contracts.borrowerOperations.repay_aeusd( aliceDebtBefore / BigInt( 10 ), aliceAddress, aliceAddress, { onAccount: alice } )  // Repays 1/10 her debt

            const aliceDebtAfter = await getTroveEntireDebt( aliceAddress )
            assert.isTrue( aliceDebtAfter > 0 )

            testHelper.assertIsApproximatelyEqual( aliceDebtAfter, aliceDebtBefore * BigInt( 9 ) / BigInt( 10 ) )  // check 9/10 debt remaining
        } )

        it( "repayLUSD(): decreases LUSD debt in ActivePool by correct amount", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            const aliceDebtBefore = await getTroveEntireDebt( aliceAddress )
            assert.isTrue( aliceDebtBefore > 0 )

            // Check before
            const activePool_aeusd_Before = await contracts.activePool.get_aeusd_debt()
            assert.isTrue( activePool_aeusd_Before > 0 )

            await contracts.borrowerOperations.repay_aeusd( aliceDebtBefore / BigInt( 10 ), aliceAddress, aliceAddress, { onAccount: alice } )  // Repays 1/10 her debt

            // check after
            const activePool_aeusd_After = await contracts.activePool.get_aeusd_debt()
            testHelper.assertIsApproximatelyEqual( activePool_aeusd_After, activePool_aeusd_Before - ( aliceDebtBefore / BigInt( 10 ) ) )
        } )

        it( "repayLUSD(): decreases user LUSDToken balance by correct amount", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            const aliceDebtBefore = await getTroveEntireDebt( aliceAddress )
            assert.isTrue( aliceDebtBefore > 0 )

            // check before
            const alice_aeusdTokenBalance_Before = await contracts.aeusdToken.balance( aliceAddress )
            assert.isTrue( alice_aeusdTokenBalance_Before > 0 )

            await contracts.borrowerOperations.repay_aeusd( aliceDebtBefore / BigInt( 10 ), aliceAddress, aliceAddress, { onAccount: alice } )  // Repays 1/10 her debt

            // check after
            const alice_aeusdTokenBalance_After = await contracts.aeusdToken.balance( aliceAddress )
            testHelper.assertIsApproximatelyEqual( alice_aeusdTokenBalance_After, alice_aeusdTokenBalance_Before - aliceDebtBefore / BigInt( 10 ) ) 
        } )

        it( 'repayLUSD(): can repay debt in Recovery Mode', async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            const aliceDebtBefore = await getTroveEntireDebt( aliceAddress )
            assert.isTrue( aliceDebtBefore > 0 )

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            await contracts.priceFeedTestnet.set_price( '105000000000000000000' )

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            const tx = await contracts.borrowerOperations.original.methods.repay_aeusd( aliceDebtBefore / BigInt(  10 ), aliceAddress, aliceAddress, { onAccount: alice } )
            assert.equal( tx.result.returnType, 'ok' ) 

            // Check Alice's debt: 110 (initial) - 50 (repaid)
            const aliceDebtAfter = await getTroveEntireDebt( aliceAddress )
            testHelper.assertIsApproximatelyEqual( aliceDebtAfter, aliceDebtBefore * BigInt( 9 ) / BigInt( 10 ) )
        } )

        it( "repayLUSD(): Reverts if borrower has insufficient LUSD balance to cover his debt repayment", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            const bobBalBefore = await contracts.aeusdToken.balance( bobAddress )
            assert.isTrue( bobBalBefore > 0 )

            // Bob transfers all but 5 of his aeusd to Carol
            await contracts.aeusdToken.transfer( CAddress, bobBalBefore - dec( 5, 18 ), { onAccount: bob } )

            //Confirm B's LUSD balance has decreased to 5 aeusd
            const bobBalAfter = await contracts.aeusdToken.balance( bobAddress )

            assert.equal( bobBalAfter, dec( 5, 18 ) )
      
            // Bob tries to repay 6 LUSD
            const repayAeusdPromise_B = contracts.borrowerOperations.original.methods.repay_aeusd( dec( 6, 18 ), bobAddress, bobAddress, { onAccount: bob } )
            await testHelper.assertRevert( repayAeusdPromise_B, "Caller doesnt have enough AEUSD to make repayment" )
        } )

        // --- adjustTrove() ---

        it( "adjustTrove(): Reverts if repaid amount is greater than current debt", async () => {
            const { totalDebt } = await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )
            LUSD_GAS_COMPENSATION = await contracts.borrowerOperations.aeusd_gas_compensation()
            const repayAmount = totalDebt - LUSD_GAS_COMPENSATION + BigInt( 1 )
            await openTrove( { extraLUSDAmount: repayAmount, ICR: dec( 150, 16 ), extraParams: { onAccount: bob } } )

            await contracts.aeusdToken.transfer( aliceAddress, repayAmount, { onAccount: bob } )

            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, repayAmount, false, aliceAddress, aliceAddress, { onAccount: alice } ),
                "SafeMath: subtraction is negative" )
        } )

        it( "adjustTrove(): reverts when adjustment would leave trove with ICR < MCR", async () => {
            // alice creates a Trove and adds first collateral
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            // Price drops
            await contracts.priceFeedTestnet.set_price( dec( 100, 18 ) )
            const price = await contracts.priceFeedTestnet.get_price()

            assert.isFalse( await contracts.troveManager.check_recovery_mode( price ) )
            assert.isTrue( ( await contracts.troveManager.get_current_icr( aliceAddress, price ) ) < dec( 110, 16 ) )

            const LUSDRepayment = 1  // 1 wei repayment
            const collTopUp = 1

            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, LUSDRepayment, false, aliceAddress, aliceAddress, { onAccount: alice, amount: collTopUp } ), 
                "BorrowerOps: An operation that would result in ICR < MCR is not permitted" )
        } )

        it( "adjustTrove(): reverts if max fee < 0.5% in Normal mode", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )

            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( 0, 0, dec( 1, 18 ), true, AAddress, AAddress, { onAccount: A, amount: dec( 2, 16 ) } ), "Max fee percentage must be between 0.5% and 100%" )
            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( 1, 0, dec( 1, 18 ), true, AAddress, AAddress, { onAccount: A, amount: dec( 2, 16 ) } ), "Max fee percentage must be between 0.5% and 100%" )
            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( BigInt( 4999999999999999 ), 0, dec( 1, 18 ), true, AAddress, AAddress, { onAccount: A, amount: dec( 2, 16 ) } ), "Max fee percentage must be between 0.5% and 100%" )
        } )

        it( "adjustTrove(): allows max fee < 0.5% in Recovery mode", async () => {
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: bob, amount: dec( 100, 'ae' ) } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )

            await contracts.priceFeedTestnet.set_price( dec( 120, 18 ) )
            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            await contracts.borrowerOperations.adjust_trove( 0, 0, dec( 1, 9 ), true, AAddress, AAddress, { onAccount: A, amount: dec( 300, 18 ) } )
            await contracts.priceFeedTestnet.set_price( dec( 1, 18 ) )
            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )
            await contracts.borrowerOperations.adjust_trove( 1, 0, dec( 1, 9 ), true, AAddress, AAddress, { onAccount: A, amount: dec( 30000, 18 ) } )
            await contracts.priceFeedTestnet.set_price( dec( 1, 16 ) )
            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )
            await contracts.borrowerOperations.adjust_trove( '4999999999999999', 0, dec( 1, 9 ), true, AAddress, AAddress, { onAccount: A, amount: dec( 3000000, 18 ) } )
        } )

        it( "adjustTrove(): decays a non-zero base rate", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: E } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D adjusts trove
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 37, 18 ), true, DAddress, DAddress, { onAccount: D } )

            // Check baseRate has decreased
            const baseRate_2 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_2 < baseRate_1 )

            // 1 hour passes
            await fastForwardTime( 3600 )

            // E adjusts trove
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 37, 15 ), true, EAddress, EAddress, { onAccount: D } )

            const baseRate_3 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_3 < baseRate_2 )
        } )

        it( "adjustTrove(): doesn't decay a non-zero base rate when user issues 0 debt", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // D opens trove 
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D adjusts trove with 0 debt
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, 0, false, DAddress, DAddress, { onAccount: D, amount: dec( 1, 'ae' ) } )

            // Check baseRate has not decreased 
            const baseRate_2 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_2, baseRate_1 )
        } )

        it( "adjustTrove(): doesn't change base rate if it is already zero", async () => {
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: E } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check baseRate is zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_1, 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D adjusts trove
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 37, 18 ), true, DAddress, DAddress, { onAccount: D } )

            // Check baseRate is still 0
            const baseRate_2 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_2, '0' )

            // 1 hour passes
            await fastForwardTime( 3600 )

            // E adjusts trove
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 37, 15 ), true, EAddress, EAddress, { onAccount: D } )

            const baseRate_3 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_3, 0 )
        } )

        it( "adjustTrove(): lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            const lastFeeOpTime_1 = await contracts.troveManager.get_last_fee_operation_time()

            // 10 seconds pass
            await fastForwardTime( 10 )

            // Borrower C triggers a fee
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 1, 18 ), true, CAddress, CAddress, { onAccount: C } )

            const lastFeeOpTime_2 = await contracts.troveManager.get_last_fee_operation_time()

            // Check that the last fee operation time did not update, as borrower D's debt issuance occured
            // since before minimum interval had passed 
            assert.equal( lastFeeOpTime_2, lastFeeOpTime_1 )

            // 60 seconds passes
            await fastForwardTime( 60 )

            // Check that now, at least one minute has passed since lastFeeOpTime_1
            const timeNow = await contracts.troveManager.get_timestamp_exported() // TODO: await testHelper.getLatestBlockTimestamp(web3)
            assert.isTrue( timeNow - lastFeeOpTime_1 >= 60 )

            // Borrower C triggers a fee
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 1, 18 ), true, CAddress, CAddress, { onAccount: C } )

            const lastFeeOpTime_3 = await contracts.troveManager.get_last_fee_operation_time()

            // Check that the last fee operation time DID update, as borrower's debt issuance occured
            // after minimum interval had passed 
            assert.isTrue( lastFeeOpTime_3 > lastFeeOpTime_1 )
        } )

        it( "adjustTrove(): borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // Borrower C triggers a fee, before decay interval of 1 minute has passed
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 1, 18 ), true, CAddress, CAddress, { onAccount: C } )

            // 1 minute passes
            await fastForwardTime( 60 )

            // Borrower C triggers another fee
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 1, 18 ), true, CAddress, CAddress, { onAccount: C } )

            // Check base rate has decreased even though Borrower tried to stop it decaying
            const baseRate_2 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_2 < baseRate_1 )
        } )

        it( "adjustTrove(): borrowing at non-zero base rate sends LUSD fee to LQTY staking contract", async () => {
            // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( dec( 1, 18 ), { onAccount: multisig } )

            // Check LQTY LUSD balance before == 0
            const lqtyStaking_LUSDBalance_Before = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.equal( lqtyStaking_LUSDBalance_Before, undefined )

            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D adjusts trove
            await openTrove( { extraLUSDAmount: dec( 37, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check LQTY LUSD balance after has increased
            const lqtyStaking_LUSDBalance_After = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.isTrue( lqtyStaking_LUSDBalance_After > 0 )
        } )

        it( "adjustTrove(): borrowing at non-zero base records the (drawn debt + fee) on the Trove struct", async () => {
        // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( dec( 1, 18 ), { onAccount: multisig } )

            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )
            const D_debtBefore = await getTroveEntireDebt( DAddress )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            const withdrawal_D = dec( 37, 18 )

            // D withdraws LUSD
            const adjustmentTx = await contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, withdrawal_D, true, DAddress, DAddress, { onAccount: D } )

            const emittedFee = testHelper.getAEUSDFeeFromAEUSDBorrowingEvent( adjustmentTx )
            assert.isTrue( emittedFee > 0 )

            const D_newDebt = ( await contracts.troveManager.troves( DAddress ) ).debt
    
            // Check debt on Trove struct equals initila debt plus drawn debt plus emitted fee
            assert.isTrue( D_newDebt ==  D_debtBefore + withdrawal_D + emittedFee )
        } )

        it( "adjustTrove(): Borrowing at non-zero base rate increases the LQTY staking contract LUSD fees-per-unit-staked", async () => {
            // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( dec( 1, 18 ), { onAccount: multisig } )

            // Check LQTY contract LUSD fees-per-unit-staked is zero
            const F_LUSD_Before = await LQTYContracts.lqtyStaking.f_aeusd()
            assert.equal( F_LUSD_Before, 0 )

            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 >  0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D adjusts trove
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 37, 18 ), true, DAddress, DAddress, { onAccount: D } )

            // Check LQTY contract LUSD fees-per-unit-staked has increased
            const F_LUSD_After = await LQTYContracts.lqtyStaking.f_aeusd()
            assert.isTrue( F_LUSD_After > F_LUSD_Before )
        } )

        it( "adjustTrove(): Borrowing at non-zero base rate sends requested amount to the user", async () => {
            // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( dec( 1, 18 ), { onAccount: multisig } )

            // Check LQTY Staking contract balance before == 0
            const lqtyStaking_LUSDBalance_Before = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.equal( lqtyStaking_LUSDBalance_Before, undefined )

            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            const D_LUSDBalanceBefore = await contracts.aeusdToken.balance( DAddress )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D adjusts trove
            const LUSDRequest_D = dec( 40, 18 )
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, LUSDRequest_D, true, DAddress, DAddress, { onAccount: D } )

            // Check LQTY staking LUSD balance has increased
            const lqtyStaking_LUSDBalance_After = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.isTrue( lqtyStaking_LUSDBalance_After > 0 )

            // Check D's LUSD balance has increased by their requested LUSD
            const D_LUSDBalanceAfter = await contracts.aeusdToken.balance( DAddress )
            assert.equal( D_LUSDBalanceAfter, D_LUSDBalanceBefore + LUSDRequest_D )
        } )

        it( "adjustTrove(): Borrowing at zero base rate changes LUSD balance of LQTY staking contract", async () => {
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 30, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check baseRate is zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_1, 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // Check staking LUSD balance before > 0
            const lqtyStaking_LUSDBalance_Before = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.isTrue( lqtyStaking_LUSDBalance_Before > 0 )

            // D adjusts trove
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 37, 18 ), true, DAddress, DAddress, { onAccount: D } )

            // Check staking LUSD balance after > staking balance before
            const lqtyStaking_LUSDBalance_After = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.isTrue( lqtyStaking_LUSDBalance_After >  lqtyStaking_LUSDBalance_Before )
        } )

        it( "adjustTrove(): Borrowing at zero base rate changes LQTY staking contract LUSD fees-per-unit-staked", async () => {
            await openTrove( { extraLUSDAmount: dec( 20000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob, amount: dec( 100, 'ae' ) } } )
            await openTrove( { extraLUSDAmount: dec( 40000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 40000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 40000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check baseRate is zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_1, 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // A artificially receives LQTY, then stakes it
            await LQTYContracts.lqtyToken.unprotected_mint( AAddress, dec( 100, 18 ) )
            await LQTYContracts.lqtyStaking.stake( dec( 100, 18 ), { onAccount: A } )

            // Check staking LUSD balance before == 0
            const F_LUSD_Before = await LQTYContracts.lqtyStaking.f_aeusd()
            assert.equal( F_LUSD_Before, 0 )

            // D adjusts trove
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 37, 18 ), true, DAddress, DAddress, { onAccount: D } )

            // Check staking LUSD balance increases
            const F_LUSD_After = await LQTYContracts.lqtyStaking.f_aeusd()
            assert.isTrue( F_LUSD_After > F_LUSD_Before )
        } )

        it( "adjustTrove(): Borrowing at zero base rate sends total requested LUSD to the user", async () => {
            await openTrove( { extraLUSDAmount: dec( 20000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob, amount: dec( 100, 'ae' ) } } )
            await openTrove( { extraLUSDAmount: dec( 40000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: dec( 40000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: dec( 40000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )
            await openTrove( { extraLUSDAmount: dec( 40000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )

            const D_LUSDBalBefore = await contracts.aeusdToken.balance( DAddress )
            // Check baseRate is zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_1, 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            const DUSDBalanceBefore = await contracts.aeusdToken.balance( DAddress )

            // D adjusts trove
            const LUSDRequest_D = dec( 40, 18 )
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, LUSDRequest_D, true, DAddress, DAddress, { onAccount: D } )

            // Check D's LUSD balance increased by their requested LUSD
            const LUSDBalanceAfter = await contracts.aeusdToken.balance( DAddress )
            assert.equal( LUSDBalanceAfter, D_LUSDBalBefore + LUSDRequest_D )
        } )

        it( "adjustTrove(): reverts when calling address has no active trove", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 20000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )

            // Alice coll and debt increase(+1 ETH, +50LUSD)
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 50, 18 ), true, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 1, 'ae' ) } )

            await testHelper.assertRevert( contracts.borrowerOperations.original.methods. adjust_trove( testHelper._100pct, 0, dec( 50, 18 ), true, AAddress, AAddress, { onAccount: A, amount: dec( 1, 'ae' ) } ),
                                           "BorrowerOps: Trove does not exist or is closed" )
        } )

        it( "adjustTrove(): reverts in Recovery Mode when the adjustment would reduce the TCR", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 20000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            const txAlice = await contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, dec( 50, 18 ), true, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 1, 'ae' ) } )
            assert.equal( txAlice.result.returnType, 'ok' )

            await contracts.priceFeedTestnet.set_price( dec( 120, 18 ) ) // trigger drop in ETH price

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            // collateral withdrawal should also fail
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, dec( 1, 'ae' ), 0, false, aliceAddress, aliceAddress, { onAccount: alice } ),
                "BorrowerOps: Collateral withdrawal not permitted Recovery Mode" )

            //debt increase should fail
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, dec( 50, 18 ), true, bobAddress, bobAddress, { onAccount: bob } ),
                "BorrowerOps: Operation must leave trove with ICR >= CCR" )

            // debt increase that's also a collateral increase should also fail, if ICR will be worse off
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, dec( 111, 18 ), true, bobAddress, bobAddress, { onAccount: bob, amount: dec( 1, 'ae' ) } ),
                "BorrowerOps: Operation must leave trove with ICR >= CCR" )
        } )

        it( "adjustTrove(): collateral withdrawal reverts in Recovery Mode", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 20000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            await contracts.priceFeedTestnet.set_price( dec( 120, 18 ) ) // trigger drop in ETH price

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            // Alice attempts an adjustment that repays half her debt BUT withdraws 1 wei collateral, and fails
            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 1, dec( 5000, 18 ), false, aliceAddress, aliceAddress, { onAccount: alice } ),
                "BorrowerOps: Collateral withdrawal not permitted Recovery Mode" )
        } )

        it( "adjustTrove(): debt increase that would leave ICR < 150% reverts in Recovery Mode", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 20000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            const CCR = await contracts.troveManager.ccr()

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            await contracts.priceFeedTestnet.set_price( dec( 120, 18 ) ) // trigger drop in ETH price
            const price = await contracts.priceFeedTestnet.get_price()

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            const ICR_A = await contracts.troveManager.get_current_icr( aliceAddress, price )

            const aliceDebt = await getTroveEntireDebt( aliceAddress )
            const aliceColl = await getTroveEntireColl( aliceAddress )
            const debtIncrease = dec( 50, 18 )
            const collIncrease = dec( 1, 'ae' )

            // Check the new ICR would be an improvement, but less than the CCR (150%)
            const newICR = await contracts.troveManager.compute_icr( aliceColl + collIncrease, aliceDebt + debtIncrease, price )

            assert.isTrue( newICR > ICR_A && newICR < CCR )

            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, debtIncrease, true, aliceAddress, aliceAddress, { onAccount: alice, amount: collIncrease } ),
                "BorrowerOps: Operation must leave trove with ICR >= CCR" )
        } )

        it( "adjustTrove(): debt increase that would reduce the ICR reverts in Recovery Mode", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 3, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            const CCR = await contracts.troveManager.ccr()

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            await contracts.priceFeedTestnet.set_price( dec( 105, 18 ) ) // trigger drop in ETH price
            const price = await contracts.priceFeedTestnet.get_price()

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            //--- Alice with ICR > 150% tries to reduce her ICR ---

            const ICR_A = await contracts.troveManager.get_current_icr( aliceAddress, price )

            // Check Alice's initial ICR is above 150%
            assert.isTrue( ICR_A > CCR )

            const aliceDebt = await getTroveEntireDebt( aliceAddress )
            const aliceColl = await getTroveEntireColl( aliceAddress )
            const aliceDebtIncrease = dec( 150, 18 )
            const aliceCollIncrease = dec( 1, 'ae' )

            const newICR_A = await contracts.troveManager.compute_icr( aliceColl + aliceCollIncrease, aliceDebt + aliceDebtIncrease, price )

            // Check Alice's new ICR would reduce but still be greater than 150%
            assert.isTrue( newICR_A < ICR_A && newICR_A > CCR )

            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, aliceDebtIncrease, true, aliceAddress, aliceAddress, { onAccount: alice, amount: aliceCollIncrease } ),
                "BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode" )

            //--- Bob with ICR < 150% tries to reduce his ICR ---

            const ICR_B = await contracts.troveManager.get_current_icr( bobAddress, price )

            // Check Bob's initial ICR is below 150%
            assert.isTrue( ICR_B < CCR )

            const bobDebt = await getTroveEntireDebt( bobAddress )
            const bobColl = await getTroveEntireColl( bobAddress )
            const bobDebtIncrease = dec( 450, 18 )
            const bobCollIncrease = dec( 1, 'ae' )

            const newICR_B = await contracts.troveManager.compute_icr( bobColl + bobCollIncrease, bobDebt + bobDebtIncrease, price )

            // Check Bob's new ICR would reduce 
            assert.isTrue( newICR_B < ICR_B )

            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, bobDebtIncrease, true, bobAddress, bobAddress, { onAccount: bob, amount: bobCollIncrease } ),
                "BorrowerOps: Operation must leave trove with ICR >= CCR" )
        } )

        it( "adjustTrove(): A trove with ICR < CCR in Recovery Mode can adjust their trove to ICR > CCR", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            const CCR = await contracts.troveManager.ccr()

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            await contracts.priceFeedTestnet.set_price( dec( 100, 18 ) ) // trigger drop in ETH price
            const price = await contracts.priceFeedTestnet.get_price()

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            const ICR_A = await contracts.troveManager.get_current_icr( aliceAddress, price )
            // Check initial ICR is below 150%
            assert.isTrue( ICR_A < CCR )

            const aliceDebt = await getTroveEntireDebt( aliceAddress )
            const aliceColl = await getTroveEntireColl( aliceAddress )
            const debtIncrease = dec( 5000, 18 )
            const collIncrease = dec( 150, 'ae' )

            const newICR = await contracts.troveManager.compute_icr( aliceColl + collIncrease, aliceDebt + debtIncrease, price )

            // Check new ICR would be > 150%
            assert.isTrue( newICR > CCR )

            const tx = await contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, debtIncrease, true, aliceAddress, aliceAddress, { onAccount: alice, amount: collIncrease } )
            assert.equal( tx.result.returnType, 'ok' )

            const actualNewICR = await contracts.troveManager.get_current_icr( aliceAddress, price )
            assert.isTrue( actualNewICR > CCR )
        } )

        it( "adjustTrove(): A trove with ICR > CCR in Recovery Mode can improve their ICR", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 3, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            const CCR = await contracts.troveManager.ccr()

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            await contracts.priceFeedTestnet.set_price( dec( 105, 18 ) ) // trigger drop in ETH price
            const price = await contracts.priceFeedTestnet.get_price()

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            const initialICR = await contracts.troveManager.get_current_icr( aliceAddress, price )
            // Check initial ICR is above 150%
            assert.isTrue( initialICR >  CCR )

            const aliceDebt = await getTroveEntireDebt( aliceAddress )
            const aliceColl = await getTroveEntireColl( aliceAddress )
            const debtIncrease = dec( 5000, 18 )
            const collIncrease = dec( 150, 'ae' )

            const newICR = await contracts.troveManager.compute_icr( aliceColl +  collIncrease, aliceDebt + debtIncrease, price )

            // Check new ICR would be > old ICR
            assert.isTrue( newICR > initialICR )

            const tx = await contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, debtIncrease, true, aliceAddress, aliceAddress, { onAccount: alice, amount: collIncrease } )
            assert.equal( tx.result.returnType, 'ok' )

            const actualNewICR = await contracts.troveManager.get_current_icr( aliceAddress, price )
            assert.isTrue( actualNewICR >  initialICR )
        } )

        it( "adjustTrove(): debt increase in Recovery Mode charges no fee", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 200000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            await contracts.priceFeedTestnet.set_price( dec( 120, 18 ) ) // trigger drop in ETH price

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            // B stakes LQTY
            await LQTYContracts.lqtyToken.unprotected_mint( bobAddress, dec( 100, 18 ) )
            await LQTYContracts.lqtyStaking.stake( dec( 100, 18 ), { onAccount: bob } )

            const lqtyStakingLUSDBalanceBefore = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.isTrue( lqtyStakingLUSDBalanceBefore > 0 )

            const txAlice = await contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, dec( 50, 18 ), true, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 100, 'ae' ) } )
            assert.equal( txAlice.result.returnType, 'ok' )

            // Check emitted fee = 0
            const emittedFee = await testHelper.getEventArgByIndex( txAlice, 'AEUSDBorrowingFeePaid', 1 )
            assert.equal( emittedFee, 0 )

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            // Check no fee was sent to staking contract
            const lqtyStakingLUSDBalanceAfter = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.equal( lqtyStakingLUSDBalanceAfter, lqtyStakingLUSDBalanceBefore )
        } )

        it( "adjustTrove(): reverts when change would cause the TCR of the system to fall below the CCR", async () => {
            await contracts.priceFeedTestnet.set_price( dec( 100, 18 ) )

            await openTrove( { ICR: dec( 15, 17 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 15, 17 ), extraParams: { onAccount: bob } } )

            // Check TCR and Recovery Mode
            const TCR = ( await testHelper.getTCR( contracts ) ).toString()
            assert.equal( TCR, '1500000000000000000' )
            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            // Bob attempts an operation that would bring the TCR below the CCR
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, dec( 1, 18 ), true, bobAddress, bobAddress, { onAccount: bob } ),
                "BorrowerOps: An operation that would result in TCR < CCR is not permitted" )

        } )

        it( "adjustTrove(): reverts when LUSD repaid is > debt of the trove", async () => {
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            const bobOpenTx = ( await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } ) ).tx

            const bobDebt = await getTroveEntireDebt( bobAddress )
            assert.isTrue( bobDebt > 0 )

            const bobFee = await testHelper.getEventArgByIndex( bobOpenTx, 'AEUSDBorrowingFeePaid', 1 )
            assert.isTrue( bobFee > 0 )

            // Alice transfers LUSD to bob to compensate borrowing fees
            await contracts.aeusdToken.transfer( bobAddress, bobFee, { onAccount: alice } )

            const remainingDebt = ( await contracts.troveManager.get_trove_debt( bobAddress ) ) - LUSD_GAS_COMPENSATION

            // Bob attempts an adjustment that would repay 1 wei more than his debt
            await testHelper.assertRevert(
                contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, remainingDebt + BigInt(1), false, bobAddress, bobAddress, { onAccount: bob, amount: dec( 1, 'ae' ) } ),
                "SafeMath: subtraction is negative"
            )
        } )

        it( "adjustTrove(): reverts when attempted ETH withdrawal is >= the trove's collateral", async () => {
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { ICR: dec( 2, 18 ), extraParams: { onAccount: C } } )

            const cColl = await getTroveEntireColl( CAddress )

            // C attempts an adjustment that would withdraw 1 wei more than her ETH
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, cColl + BigInt(1), 0, true, CAddress, CAddress, { onAccount: C } ),
                "BorrowerOps: Debt increase requires non-zero debtChange" )
        } )

        it( "adjustTrove(): reverts when change would cause the ICR of the trove to fall below the MCR", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 100, 18 ), extraParams: { onAccount: A } } )

            await contracts.priceFeedTestnet.set_price( dec( 100, 18 ) )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 11, 17 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 11, 17 ), extraParams: { onAccount: bob } } )

            // Bob attempts to increase debt by 100 LUSD and 1 ae, i.e. a change that constitutes a 100% ratio of coll:debt.
            // Since his ICR prior is 110%, this change would reduce his ICR below MCR.
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, dec( 100, 18 ), true, bobAddress, bobAddress, { onAccount: bob, amount: dec( 1, 'ae' ) } ),
                "BorrowerOps: An operation that would result in ICR < MCR is not permitted" )
        } )

        it( "adjustTrove(): With 0 coll change, doesnt change borrower's coll or ActivePool coll", async () => {
            await openTrove( { extraLUSDAmount:  dec( 10000, 18 ) , ICR:  dec( 2, 18 ) , extraParams: { onAccount: alice } } )

            const aliceCollBefore = await getTroveEntireColl( aliceAddress )
            const activePoolCollBefore = await contracts.activePool.get_ae()

            assert.isTrue( aliceCollBefore > 0 )
            assert.equal( aliceCollBefore, activePoolCollBefore )

            // Alice adjusts trove. No coll change, and a debt increase (+50LUSD)
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 50, 18 ), true, aliceAddress, aliceAddress, { onAccount: alice, amount: 0 } )

            const aliceCollAfter = await getTroveEntireColl( aliceAddress )
            const activePoolCollAfter = await contracts.activePool.get_ae()

            assert.equal( aliceCollAfter, activePoolCollAfter )
            assert.equal( activePoolCollAfter, activePoolCollAfter )
        } )

        it( "adjustTrove(): With 0 debt change, doesnt change borrower's debt or ActivePool debt", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )

            const aliceDebtBefore = await getTroveEntireDebt( aliceAddress )
            const activePoolDebtBefore = await contracts.activePool.get_aeusd_debt()

            assert.isTrue( aliceDebtBefore > 0 )
            assert.equal( aliceDebtBefore, activePoolDebtBefore )

            // Alice adjusts trove. Coll change, no debt change
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, 0, false, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 1, 'ae' ) } )

            const aliceDebtAfter = await getTroveEntireDebt( aliceAddress )
            const activePoolDebtAfter = await contracts.activePool.get_aeusd_debt()

            assert.equal( aliceDebtAfter, aliceDebtBefore )
            assert.equal( activePoolDebtAfter, activePoolDebtBefore )
        } )

        it( "adjustTrove(): updates borrower's debt and coll with an increase in both", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const debtBefore = await getTroveEntireDebt( aliceAddress )
            const collBefore = await getTroveEntireColl( aliceAddress )
            assert.isTrue( debtBefore > 0 )
            assert.isTrue( collBefore > 0 )

            // Alice adjusts trove. Coll and debt increase(+1 ETH, +50LUSD)
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, await getNetBorrowingAmount( dec( 50, 18 ) ), true, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 1, 'ae' ) } )

            const debtAfter = await getTroveEntireDebt( aliceAddress )
            const collAfter = await getTroveEntireColl( aliceAddress )

            testHelper.assertIsApproximatelyEqual( debtAfter, debtBefore +  dec( 50, 18 ), 10000 )
            testHelper.assertIsApproximatelyEqual( collAfter, collBefore +  dec( 1, 18 ), 10000 )
        } )

        it( "adjustTrove(): updates borrower's debt and coll with a decrease in both", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const debtBefore = await getTroveEntireDebt( aliceAddress )
            const collBefore = await getTroveEntireColl( aliceAddress )
            assert.isTrue( debtBefore > 0 )
            assert.isTrue( collBefore > 0 )

            // Alice adjusts trove coll and debt decrease (-0.5 ETH, -50LUSD)
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, dec( 500, 'finney' ), dec( 50, 18 ), false, aliceAddress, aliceAddress, { onAccount: alice } )

            const debtAfter = await getTroveEntireDebt( aliceAddress )
            const collAfter = await getTroveEntireColl( aliceAddress )

            assert.equal( debtAfter, debtBefore - dec( 50, 18 ) )
            assert.equal( collAfter, collBefore - dec( 5, 17 ) )
        } )

        it( "adjustTrove(): updates borrower's  debt and coll with coll increase, debt decrease", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const debtBefore = await getTroveEntireDebt( aliceAddress )
            const collBefore = await getTroveEntireColl( aliceAddress )
            assert.isTrue( debtBefore > 0 )
            assert.isTrue( collBefore > 0 )

            // Alice adjusts trove - coll increase and debt decrease (+0.5 ETH, -50LUSD)
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 50, 18 ), false, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 500, 'finney' ) } )

            const debtAfter = await getTroveEntireDebt( aliceAddress )
            const collAfter = await getTroveEntireColl( aliceAddress )

            testHelper.assertIsApproximatelyEqual( debtAfter, debtBefore - dec( 50, 18 ), 10000 )
            testHelper.assertIsApproximatelyEqual( collAfter, collBefore + dec( 5, 17 ), 10000 )
        } )

        it( "adjustTrove(): updates borrower's debt and coll with coll decrease, debt increase", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const debtBefore = await getTroveEntireDebt( aliceAddress )
            const collBefore = await getTroveEntireColl( aliceAddress )
            assert.isTrue( debtBefore > 0 )
            assert.isTrue( collBefore > 0 )

            // Alice adjusts trove - coll decrease and debt increase (0.1 ETH, 10LUSD)
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, dec( 1, 17 ), await getNetBorrowingAmount( dec( 1, 18 ) ), true, aliceAddress, aliceAddress, { onAccount: alice } )

            const debtAfter = await getTroveEntireDebt( aliceAddress )
            const collAfter = await getTroveEntireColl( aliceAddress )

            testHelper.assertIsApproximatelyEqual( debtAfter, debtBefore + dec( 1, 18 ), 10000 )
            testHelper.assertIsApproximatelyEqual( collAfter, collBefore - dec( 1, 17 ), 10000 )
        } )

        it( "adjustTrove(): updates borrower's stake and totalStakes with a coll increase", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const stakeBefore = await contracts.troveManager.get_trove_stake( aliceAddress )
            const totalStakesBefore = await contracts.troveManager.total_stakes()
            assert.isTrue( stakeBefore > 0 )
            assert.isTrue( totalStakesBefore > 0 )

            // Alice adjusts trove - coll and debt increase (+1 ETH, +50 LUSD)
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 50, 18 ), true, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 1, 'ae' ) } )

            const stakeAfter = await contracts.troveManager.get_trove_stake( aliceAddress )
            const totalStakesAfter = await contracts.troveManager.total_stakes()

            assert.equal( stakeAfter, stakeBefore + dec( 1, 18 ) )
            assert.equal( totalStakesAfter, totalStakesBefore + dec( 1, 18 ) )
        } )

        it( "adjustTrove(): updates borrower's stake and totalStakes with a coll decrease", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const stakeBefore = await contracts.troveManager.get_trove_stake( aliceAddress )
            const totalStakesBefore = await contracts.troveManager.total_stakes()
            assert.isTrue( stakeBefore > 0 )
            assert.isTrue( totalStakesBefore > 0 )

            // Alice adjusts trove - coll decrease and debt decrease
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, dec( 500, 'finney' ), dec( 50, 18 ), false, aliceAddress, aliceAddress, { onAccount: alice } )

            const stakeAfter = await contracts.troveManager.get_trove_stake( aliceAddress )
            const totalStakesAfter = await contracts.troveManager.total_stakes()

            assert.equal( stakeAfter, stakeBefore - dec( 5, 17 ) )
            assert.equal( totalStakesAfter, totalStakesBefore - dec( 5, 17 ) )
        } )

        it( "adjustTrove(): changes LUSDToken balance by the requested decrease", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const alice_LUSDTokenBalance_Before = await contracts.aeusdToken.balance( aliceAddress )
            assert.isTrue( alice_LUSDTokenBalance_Before > 0 )

            // Alice adjusts trove - coll decrease and debt decrease
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, dec( 100, 'finney' ), dec( 10, 18 ), false, aliceAddress, aliceAddress, { onAccount: alice } )

            // check after
            const alice_LUSDTokenBalance_After = await contracts.aeusdToken.balance( aliceAddress )
            assert.equal( alice_LUSDTokenBalance_After,  alice_LUSDTokenBalance_Before - dec( 10, 18 ) )
        } )

        it( "adjustTrove(): changes LUSDToken balance by the requested increase", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const alice_LUSDTokenBalance_Before = await contracts.aeusdToken.balance( aliceAddress )
            assert.isTrue( alice_LUSDTokenBalance_Before > 0 )

            // Alice adjusts trove - coll increase and debt increase
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 100, 18 ), true, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 1, 'ae' ) } )

            // check after
            const alice_LUSDTokenBalance_After = await contracts.aeusdToken.balance( aliceAddress )
            assert.equal( alice_LUSDTokenBalance_After, alice_LUSDTokenBalance_Before + dec( 100, 18 ) )
        } )

        it( "adjustTrove(): Changes the activePool ETH and raw ae balance by the requested decrease", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const activePool_ETH_Before = await contracts.activePool.get_ae()
            const activePool_Rawae_Before = await contracts.sdk.getBalance( contracts.activePool.accountAddress )
            assert.isTrue( activePool_ETH_Before > 0 )
            assert.isTrue( activePool_Rawae_Before > 0 )

            // Alice adjusts trove - coll decrease and debt decrease
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, dec( 100, 'finney' ), dec( 10, 18 ), false, aliceAddress, aliceAddress, { onAccount: alice } )

            const activePool_ETH_After = await contracts.activePool.get_ae()
            const activePool_Rawae_After = await contracts.sdk.getBalance( contracts.activePool.accountAddress )
            assert.equal( activePool_ETH_After, activePool_ETH_Before - dec( 1, 17 ) )
            assert.equal( activePool_Rawae_After, activePool_ETH_Before - dec( 1, 17 ) )
        } )

        it( "adjustTrove(): Changes the activePool ETH and raw ae balance by the amount of ETH sent", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const activePool_ETH_Before = await contracts.activePool.get_ae()
            const activePool_Rawae_Before = await contracts.sdk.getBalance( contracts.activePool.accountAddress )
            assert.isTrue( activePool_ETH_Before > 0 )
            assert.isTrue( activePool_Rawae_Before > 0 )

            // Alice adjusts trove - coll increase and debt increase
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 100, 18 ), true, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 1, 'ae' ) } )

            const activePool_ETH_After = await contracts.activePool.get_ae()
            const activePool_Rawae_After = await contracts.sdk.getBalance( contracts.activePool.accountAddress )
            assert.equal( activePool_ETH_After, activePool_ETH_Before + dec( 1, 18 ) )
            assert.equal( activePool_Rawae_After, activePool_ETH_Before + dec( 1, 18 ) )
        } )

        it( "adjustTrove(): Changes the LUSD debt in ActivePool by requested decrease", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const activePool_LUSDDebt_Before = await contracts.activePool.get_aeusd_debt()
            assert.isTrue( activePool_LUSDDebt_Before > 0 )

            // Alice adjusts trove - coll increase and debt decrease
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, dec( 30, 18 ), false, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 1, 'ae' ) } )

            const activePool_LUSDDebt_After = await contracts.activePool.get_aeusd_debt()
            assert.equal( activePool_LUSDDebt_After, activePool_LUSDDebt_Before - dec( 30, 18 ) )
        } )

        it( "adjustTrove(): Changes the LUSD debt in ActivePool by requested increase", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const activePool_LUSDDebt_Before = await contracts.activePool.get_aeusd_debt()
            assert.isTrue( activePool_LUSDDebt_Before > 0 )

            // Alice adjusts trove - coll increase and debt increase
            await contracts.borrowerOperations.adjust_trove( testHelper._100pct, 0, await getNetBorrowingAmount( dec( 100, 18 ) ), true, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 1, 'ae' ) } )

            const activePool_LUSDDebt_After = await contracts.activePool.get_aeusd_debt()
    
            testHelper.assertIsApproximatelyEqual( activePool_LUSDDebt_After, activePool_LUSDDebt_Before + dec( 100, 18 ) )
        } )

        it( "adjustTrove(): new coll = 0 and new debt = 0 is not allowed, as gas compensation still counts toward ICR", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )
            const aliceColl = await getTroveEntireColl( aliceAddress )
            const aliceDebt = await getTroveEntireColl( aliceAddress )
            const status_Before = await contracts.troveManager.get_trove_status( aliceAddress )
            const isInSortedList_Before = await contracts.sortedTroves.contains( aliceAddress )

            assert.equal( status_Before, 1 )  // 1: Active
            assert.isTrue( isInSortedList_Before )

            await testHelper.assertRevert(
                contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, aliceColl, aliceDebt, true, aliceAddress, aliceAddress, { onAccount: alice } ),
                'BorrowerOps: An operation that would result in ICR < MCR is not permitted'
            )
        } )

        it( "adjustTrove(): Reverts if requested debt increase and amount is zero", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, 0, true, aliceAddress, aliceAddress, { onAccount: alice } ),
                'BorrowerOps: Debt increase requires non-zero debtChange' )
        } )

        it( "adjustTrove(): Reverts if requested coll withdrawal and ae is sent", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, dec( 1, 'ae' ), dec( 100, 18 ), true, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 3, 'ae' ) } ), 'BorrowerOperations: Cannot withdraw and add coll' )
        } )

        it( "adjustTrove(): Reverts if it’s zero adjustment", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, 0, false, aliceAddress, aliceAddress, { onAccount: alice } ),
                'BorrowerOps: There must be either a collateral change or a debt change' )
        } )

        it( "adjustTrove(): Reverts if requested coll withdrawal is greater than trove's collateral", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: alice } } )

            const aliceColl = await getTroveEntireColl( aliceAddress )

            // Requested coll withdrawal > coll in the trove
            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, aliceColl + BigInt( 1 ), 0, false, aliceAddress, aliceAddress, { onAccount: alice } ) , "Can not withdraw more coll than the available" )
            await assertRevert( contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, aliceColl + dec( 37, 'ae' ), 0, false, bobAddress, bobAddress, { onAccount: bob } ) , "Can not withdraw more coll than the available")
        } )

        it( "adjustTrove(): Reverts if borrower has insufficient LUSD balance to cover his debt repayment", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: B } } )
            const bobDebt = await getTroveEntireDebt( BAddress )

            // Bob transfers some LUSD to C
            await contracts.aeusdToken.transfer( CAddress, dec( 10, 18 ), { onAccount: B } )

            //Confirm B's LUSD balance is less than 50 LUSD
            const B_LUSDBal = await contracts.aeusdToken.balance( BAddress )
            assert.isTrue( B_LUSDBal < bobDebt )

            const repayLUSDPromise_B = contracts.borrowerOperations.original.methods.adjust_trove( testHelper._100pct, 0, bobDebt, false, BAddress, BAddress, { onAccount: B } )

            // B attempts to repay all his debt
            await assertRevert( repayLUSDPromise_B, "SafeMath: subtraction is negative" )
        } )

        it( "Internal _adjustTrove(): reverts when op is a withdrawal and _borrower param is not the msg.sender", async () => {
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: D } } )
            await openTrove( { extraLUSDAmount: dec( 10000, 18 ), ICR: dec( 10, 18 ), extraParams: { onAccount: bob } } )

            const txPromise_A = contracts.borrowerOperations.original.methods.call_internal_adjust_loan( aliceAddress, dec( 1, 18 ), dec( 1, 18 ), true, aliceAddress, aliceAddress, { onAccount: bob } )
            await assertRevert( txPromise_A, "Max fee percentage must be between 0.5% and 100%" ) // Original test message is different, but I checked the message there is wrong as original assertRevert methods do not check the error message argument
            const txPromise_B = contracts.borrowerOperations.original.methods.call_internal_adjust_loan( bobAddress, dec( 1, 18 ), dec( 1, 18 ), true, aliceAddress, aliceAddress, { onAccount: D } )
            await assertRevert( txPromise_B, "Max fee percentage must be between 0.5% and 100%" )
            const txPromise_C = contracts.borrowerOperations.original.methods.call_internal_adjust_loan( CAddress, dec( 1, 18 ), dec( 1, 18 ), true, aliceAddress, aliceAddress, { onAccount: bob } )
            await assertRevert( txPromise_C, "Max fee percentage must be between 0.5% and 100%" )
        } )

        // --- openTrove(1) ---
        it( "openTrove(): emits a TroveUpdated event with the correct collateral and debt", async () => {

            const txA = ( await openTrove( { extraLUSDAmount: testHelper.dec( 15000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } ) ).tx
            const txB = ( await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } ) ).tx
            const txC = ( await openTrove( { extraLUSDAmount: testHelper.dec( 3000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } ) ).tx

            //console.log(txA.tx)

            const A_Coll = await getTroveEntireColl( AAddress )
            const B_Coll = await getTroveEntireColl( BAddress )
            const C_Coll = await getTroveEntireColl( CAddress )
            const A_Debt = await getTroveEntireDebt( AAddress )
            const B_Debt = await getTroveEntireDebt( BAddress )
            const C_Debt = await getTroveEntireDebt( CAddress )

            const A_emittedDebt = BigInt( testHelper.getPayloadByIndex( testHelper.getEventArgByIndex( txA, "TroveUpdated", 1 ), 1 ) )
            const A_emittedColl = BigInt( testHelper.getPayloadByIndex( testHelper.getEventArgByIndex( txA, "TroveUpdated", 1 ), 2 ) )
            const B_emittedDebt = BigInt( testHelper.getPayloadByIndex( testHelper.getEventArgByIndex( txB, "TroveUpdated", 1 ), 1 ) )
            const B_emittedColl = BigInt( testHelper.getPayloadByIndex( testHelper.getEventArgByIndex( txB, "TroveUpdated", 1 ), 2 ) )
            const C_emittedDebt = BigInt( testHelper.getPayloadByIndex( testHelper.getEventArgByIndex( txC, "TroveUpdated", 1 ), 1 ) )
            const C_emittedColl = BigInt( testHelper.getPayloadByIndex( testHelper.getEventArgByIndex( txC, "TroveUpdated", 1 ), 2 ) )

            // Check emitted debt values are correct
            assert.isTrue( A_Debt == A_emittedDebt )
            assert.isTrue( B_Debt == B_emittedDebt )
            assert.isTrue( C_Debt == C_emittedDebt )

            // Check emitted coll values are correct
            assert.isTrue( A_Coll == A_emittedColl )
            assert.isTrue( B_Coll == B_emittedColl )
            assert.isTrue( C_Coll == C_emittedColl )

            const baseRateBefore = await contracts.troveManager.base_rate()

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( testHelper.dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            assert.isTrue( ( await contracts.troveManager.base_rate() ) > baseRateBefore )

            const txD = ( await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: D } } ) ).tx
            const txE = ( await openTrove( { extraLUSDAmount: testHelper.dec( 3000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: E } } ) ).tx
            const D_Coll = await getTroveEntireColl( DAddress )
            const E_Coll = await getTroveEntireColl( EAddress )
            const D_Debt = await getTroveEntireDebt( DAddress )
            const E_Debt = await getTroveEntireDebt( EAddress )

            const D_emittedDebt = BigInt( testHelper.getPayloadByIndex( testHelper.getEventArgByIndex( txD, "TroveUpdated", 1 ), 1 ) )
            const D_emittedColl = BigInt( testHelper.getPayloadByIndex( testHelper.getEventArgByIndex( txD, "TroveUpdated", 1 ), 2 ) )
            const E_emittedDebt = BigInt( testHelper.getPayloadByIndex( testHelper.getEventArgByIndex( txE, "TroveUpdated", 1 ), 1 ) )
            const E_emittedColl = BigInt( testHelper.getPayloadByIndex( testHelper.getEventArgByIndex( txE, "TroveUpdated", 1 ), 2 ) )
            
            // Check emitted debt values are correct
            assert.isTrue( D_Debt == D_emittedDebt )
            assert.isTrue( E_Debt == E_emittedDebt )

            // Check emitted coll values are correct
            assert.isTrue( D_Coll == D_emittedColl )
            assert.isTrue( E_Coll == E_emittedColl )
        } )

        it( "openTrove(): Opens a trove with net debt >= minimum net debt", async () => {
            const txA = await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, await getNetBorrowingAmount( MIN_NET_DEBT + BigInt( 1 ) ), AAddress, AAddress, { onAccount: A, amount: testHelper.dec( 100, 30 ) } )
            assert.equal( txA.result.returnType, 'ok' )
            assert.isTrue( await contracts.sortedTroves.contains( AAddress ) )
            
            const txC = await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, await getNetBorrowingAmount( MIN_NET_DEBT + BigInt( testHelper.dec( 47789898, 22 ) ) ), CAddress, CAddress, { onAccount: C, amount: testHelper.dec( 100, 30 ) } )
            assert.equal( txC.result.returnType, 'ok' )
            assert.isTrue( await contracts.sortedTroves.contains( CAddress ) )
        } )

        it( "openTrove(): reverts if net debt < minimum net debt", async () => {
            const txAPromise = contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, 0, AAddress, AAddress, { onAccount: A, amount: testHelper.dec( 100, 30 ) } )
            await testHelper.assertRevert( txAPromise, "division by zero" )

            const txBPromise = contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, await getNetBorrowingAmount( MIN_NET_DEBT - BigInt( 1 ) ), BAddress, BAddress, { onAccount: B, amount: testHelper.dec( 100, 30 ) } )
            await testHelper.assertRevert( txBPromise, "net debt must be greater than minimum" )

            const txCPromise = contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, MIN_NET_DEBT - BigInt( testHelper.dec( 173, 18 ) ), CAddress, CAddress, { onAccount: C, amount: testHelper.dec( 100, 30 ) } )
            await testHelper.assertRevert( txCPromise, "net debt must be greater than minimum" )
        } )

        it( "openTrove(): decays a non-zero base rate", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 20000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 30000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 40000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > BigInt( 0 ) )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D opens trove 
            await openTrove( { extraLUSDAmount: testHelper.dec( 37, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check baseRate has decreased
            const baseRate_2 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_2 < baseRate_1 )

            // 1 hour passes
            await fastForwardTime( 3600 )

            // E opens trove 
            await openTrove( { extraLUSDAmount: testHelper.dec( 12, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: E } } )

            const baseRate_3 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_3 < baseRate_2 )
        } )

        it( "openTrove(): doesn't change base rate if it is already zero", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 20000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 30000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 40000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Check baseRate is zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_1, '0' )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D opens trove 
            await openTrove( { extraLUSDAmount: testHelper.dec( 37, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check baseRate is still 0
            const baseRate_2 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_2, '0' )

            // 1 hour passes
            await fastForwardTime( 3600 )

            // E opens trove 
            await openTrove( { extraLUSDAmount: testHelper.dec( 12, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: E } } )

            const baseRate_3 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_3, '0' )
        } )

        it( "openTrove(): lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 20000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 30000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 40000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( testHelper.dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            const lastFeeOpTime_1 = await contracts.troveManager.get_last_fee_operation_time()

            // Borrower D triggers a fee
            await openTrove( { extraLUSDAmount: testHelper.dec( 1, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: D } } )

            const lastFeeOpTime_2 = await contracts.troveManager.get_last_fee_operation_time()

            // Check that the last fee operation time did not update, as borrower D's debt issuance occured
            // since before minimum interval had passed 
            assert.isTrue( lastFeeOpTime_2 == lastFeeOpTime_1 )

            // 1 minute passes
            await fastForwardTime( 60 )

            // Check that now, at least one minute has passed since lastFeeOpTime_1 TODO: make sense ?
            //const timeNow = await contracts.troveManager.get_timestamp()// TODO: is this equivalent to testHelper.getLatestBlockTimestamp(contracts.sdk) ?
            //assert.isTrue(timeNow - lastFeeOpTime_1 >= 3600)

            // Borrower E triggers a fee
            await openTrove( { extraLUSDAmount: testHelper.dec( 1, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: E } } )
            
            const lastFeeOpTime_3 = await contracts.troveManager.get_last_fee_operation_time()
            
            // Check that the last fee operation time DID update, as borrower's debt issuance occured
            // after minimum interval had passed 
            assert.isTrue( lastFeeOpTime_3 > lastFeeOpTime_1 )
        } )

        it( "openTrove(): reverts if max fee > 100%", async () => {
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.open_trove( testHelper.dec( 2, 18 ), testHelper.dec( 10000, 18 ), AAddress, AAddress, { onAccount: A, amount: dec( 1000, 'ae' ) } ), "Max fee percentage must be between 0.5% and 100%" )
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.open_trove( '1000000000000000001', dec( 20000, 18 ), BAddress, BAddress, { onAccount: B, amount: dec( 1000, 'ae' ) } ), "Max fee percentage must be between 0.5% and 100%" )
        } )

        it( "openTrove(): reverts if max fee < 0.5% in Normal mode", async () => {
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.open_trove( 0, testHelper.dec( 195000, 18 ), AAddress, AAddress, { onAccount: A, amount: testHelper.dec( 1200, 'ae' ) } ), "Max fee percentage must be between 0.5% and 100%" )
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.open_trove( 1, testHelper.dec( 195000, 18 ), AAddress, AAddress, { onAccount: A, amount: testHelper.dec( 1000, 'ae' ) } ), "Max fee percentage must be between 0.5% and 100%" )
            await testHelper.assertRevert( contracts.borrowerOperations.original.methods.open_trove( '4999999999999999', testHelper.dec( 195000, 18 ), BAddress, BAddress, { onAccount: B, amount: testHelper.dec( 1200, 'ae' ) } ), "Max fee percentage must be between 0.5% and 100%" )
        } )

        it( "openTrove(): allows max fee < 0.5% in Recovery Mode", async () => {
            //console.log('amount:' + testHelper.dec(2000, 'ae'))
            const result = await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, testHelper.dec( 195000, 18 ), AAddress, AAddress, { onAccount: A, amount: testHelper.dec( 2000, 'ae' ) } )
        
            await contracts.priceFeedTestnet.set_price( testHelper.dec( 100, 18 ) )
            
            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            await contracts.borrowerOperations.original.methods.open_trove( 0, testHelper.dec( 19500, 18 ), BAddress, BAddress, { onAccount: B, amount: dec( 3100, 'ae' ) } )
            await contracts.priceFeedTestnet.set_price( testHelper.dec( 50, 18 ) )
            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )
            await contracts.borrowerOperations.original.methods.open_trove( 1, testHelper.dec( 19500, 18 ), CAddress, CAddress, { onAccount: C, amount: dec( 3100, 'ae' ) } )
            await contracts.priceFeedTestnet.set_price( testHelper.dec( 25, 18 ) )
            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )
            await contracts.borrowerOperations.original.methods.open_trove( '4999999999999999', testHelper.dec( 19500, 18 ), DAddress, DAddress, { onAccount: D, amount: testHelper.dec( 3100, 'ae' ) } )
        } )

        it( "openTrove(): reverts if fee exceeds max fee percentage", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 20000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 30000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 40000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } )

            const totalSupply = await contracts.aeusdToken.total_supply()

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( testHelper.dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            //       actual fee percentage: 0.005000000186264514
            // user's max fee percentage:  0.0049999999999999999
            let borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect max(0.5 + 5%, 5%) rate
            assert.equal( borrowingRate, testHelper.dec( 5, 16 ) )

            const lessThan5pct = '49999999999999999'
            const txPromiseD = contracts.borrowerOperations.original.methods.open_trove( lessThan5pct, testHelper.dec( 30000, 18 ), AAddress, AAddress, { onAccount: D, amount: testHelper.dec( 1000, 'ae' ) } )
            await testHelper.assertRevert( txPromiseD, "Fee exceeded provided maximum" )

            borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
            assert.equal( borrowingRate, testHelper.dec( 5, 16 ) )
            // Attempt with maxFee 1%
            const txPromiseD2 = contracts.borrowerOperations.original.methods.open_trove( testHelper.dec( 1, 16 ), testHelper.dec( 30000, 18 ), AAddress, AAddress, { onAccount: D, amount: testHelper.dec( 1000, 'ae' ) } )     
            await testHelper.assertRevert( txPromiseD2, "Fee exceeded provided maximum" )

            borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
            assert.equal( borrowingRate, testHelper.dec( 5, 16 ) )
            // Attempt with maxFee 3.754%
            const txPromiseD3 = contracts.borrowerOperations.original.methods.open_trove( testHelper.dec( 3754, 13 ), testHelper.dec( 30000, 18 ), AAddress, AAddress, { onAccount: D, amount: testHelper.dec( 1000, 'ae' ) } )                  
            await testHelper.assertRevert( txPromiseD3, "Fee exceeded provided maximum" )

            borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
            assert.equal( borrowingRate, testHelper.dec( 5, 16 ) )
            // Attempt with maxFee 1e-16%
            const txPromiseD4 = contracts.borrowerOperations.original.methods.open_trove( testHelper.dec( 5, 15 ), testHelper.dec( 30000, 18 ), AAddress, AAddress, { onAccount: D, amount: testHelper.dec( 1000, 'ae' ) } )             
            await testHelper.assertRevert( txPromiseD4, "Fee exceeded provided maximum" )
        } )

        it( "openTrove(): succeeds when fee is less than max fee percentage", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 20000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 30000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 40000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( testHelper.dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            let borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect min(0.5 + 5%, 5%) rate
            assert.equal( borrowingRate, testHelper.dec( 5, 16 ) )

            // Attempt with maxFee > 5%
            const moreThan5pct = '50000000000000001'
            const tx1 = await contracts.borrowerOperations.original.methods.open_trove( moreThan5pct, testHelper.dec( 10000, 18 ), AAddress, AAddress, { onAccount: D, amount: testHelper.dec( 100, 'ae' ) } )
            assert.equal( tx1.result.returnType, 'ok' )            

            borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
            assert.equal( borrowingRate, testHelper.dec( 5, 16 ) )

            // Attempt with maxFee = 5%
            const tx2 = await contracts.borrowerOperations.original.methods.open_trove( testHelper.dec( 5, 16 ), testHelper.dec( 10000, 18 ), AAddress, AAddress, { onAccount: E, amount: testHelper.dec( 100, 'ae' ) } )
            assert.equal( tx2.result.returnType, 'ok' )            

            borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
            assert.equal( borrowingRate, testHelper.dec( 5, 16 ) )

            // Attempt with maxFee 10%
            const tx3 = await contracts.borrowerOperations.original.methods.open_trove( testHelper.dec( 1, 17 ), testHelper.dec( 10000, 18 ), AAddress, AAddress, { onAccount: bob, amount: testHelper.dec( 100, 'ae' ) } )
            assert.equal( tx3.result.returnType, 'ok' )            

            borrowingRate = await contracts.troveManager.get_borrowing_rate() // expect 5% rate
            assert.equal( borrowingRate, testHelper.dec( 5, 16 ) )

            // Attempt with maxFee 37.659%
            const tx4 = await contracts.borrowerOperations.original.methods.open_trove( testHelper.dec( 37659, 13 ), testHelper.dec( 10000, 18 ), AAddress, AAddress, { onAccount: alice, amount: testHelper.dec( 100, 'ae' ) } )
            assert.equal( tx4.result.returnType, 'ok' )            

            // TODO: MISSING EXTRA WALLET
            // // Attempt with maxFee 100% 
            // const tx5 = await borrowerOperations.openTrove(testHelper.dec(1, 18), testHelper.dec(10000, 18), A, A, { onAccount: G, amount: testHelper.dec(100, 'ether') })
            // assert.isTrue(tx5.receipt.status)
        } )

        it( "openTrove(): borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 20000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 30000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 40000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( testHelper.dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0n )

            // 59 minutes pass
            await fastForwardTime( 3540 )

            // Assume Borrower also owns accounts D and E
            // Borrower triggers a fee, before decay interval has passed
            await openTrove( { extraLUSDAmount: testHelper.dec( 1, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: D } } )

            // 1 minute pass
            await fastForwardTime( 3540 )          

            // Borrower triggers another fee
            await openTrove( { extraLUSDAmount: testHelper.dec( 1, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: E } } )
            
            // Check base rate has decreased even though Borrower tried to stop it decaying
            const baseRate_2 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_2 < baseRate_1 )
        } )   

        it( "openTrove(): borrowing at non-zero base rate sends LUSD fee to LQTY staking contract", async () => {
            // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            const lqtyStakingAddress = LQTYContracts.lqtyStaking.address
            const lqtyStakingAccountAddress = lqtyStakingAddress.replace( "ct_", "ak_" )          
            await LQTYContracts.lqtyToken.create_allowance( lqtyStakingAccountAddress, testHelper.dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( testHelper.dec( 1, 18 ), { onAccount: multisig } )

            // Check LQTY LUSD balance before == 0
            const lqtyStaking_aeusd_balance_before = await contracts.aeusdToken.balance( lqtyStakingAccountAddress )
            assert.equal( lqtyStaking_aeusd_balance_before, undefined )

            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 20000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 30000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 40000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( testHelper.dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D opens trove 
            await openTrove( { extraLUSDAmount: testHelper.dec( 40000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check LQTY LUSD balance after has increased
            const lqtyStaking_aeusd_balance_after = await contracts.aeusdToken.balance( lqtyStakingAccountAddress )
            //console.log('aeusd_balance:'+lqtyStaking_aeusd_balance_after)
            assert.isTrue( lqtyStaking_aeusd_balance_after > 0 )
        } )

        it( "openTrove(): borrowing at non-zero base records the (drawn debt + fee  + liq. reserve) on the Trove struct", async () => {
            // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, testHelper.dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( testHelper.dec( 1, 18 ), { onAccount: multisig } )

            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 20000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 30000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 40000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( testHelper.dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            const D_LUSDRequest = testHelper.dec( 20000, 18 )

            // D withdraws LUSD
            const openTroveTx = await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, D_LUSDRequest, AAddress, AAddress, { onAccount: D, amount: testHelper.dec( 200, 'ae' ) } )

            const emittedFee = BigInt( testHelper.getAEUSDFeeFromAEUSDBorrowingEvent( openTroveTx ) )
            assert.isTrue( BigInt( emittedFee ) > 0 )

            const newDebt = ( await contracts.troveManager.troves( DAddress ) ).debt

            // Check debt on Trove struct equals drawn debt plus emitted fee
            testHelper.assertIsApproximatelyEqual( newDebt, D_LUSDRequest + emittedFee + LUSD_GAS_COMPENSATION, 100000 )
        } )

        it( "openTrove(): Borrowing at non-zero base rate increases the LQTY staking contract LUSD fees-per-unit-staked", async () => {
            // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, testHelper.dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( testHelper.dec( 1, 18 ), { onAccount: multisig } )

            // Check LQTY contract LUSD fees-per-unit-staked is zero
            const f_aeusd_Before = await LQTYContracts.lqtyStaking.f_aeusd()
            assert.equal( f_aeusd_Before, '0' )

            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 20000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 30000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 40000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( testHelper.dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D opens trove 
            await openTrove( { extraLUSDAmount: testHelper.dec( 37, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check LQTY contract LUSD fees-per-unit-staked has increased
            const f_aeusd_Afer = await LQTYContracts.lqtyStaking.f_aeusd()       
            assert.isTrue( f_aeusd_Afer > f_aeusd_Before )
        } )

        it( "openTrove(): Borrowing at non-zero base rate sends requested amount to the user", async () => {
            // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, testHelper.dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( testHelper.dec( 1, 18 ), { onAccount: multisig } )
            
            // Check LQTY LUSD balance before == 0
            const lqtyStaking_aeusd_balance_before = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.equal( lqtyStaking_aeusd_balance_before, undefined )

            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 20000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 30000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 40000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Artificially make baseRate 5%
            await contracts.troveManager.set_base_rate( testHelper.dec( 5, 16 ) )
            await contracts.troveManager.set_last_fee_op_time_to_now()

            // Check baseRate is now non-zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.isTrue( baseRate_1 > 0 )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // D opens trove
            const LUSDRequest_D = testHelper.dec( 40000, 18 )      
            const openTroveTx = await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, LUSDRequest_D, DAddress, DAddress, { onAccount: D, amount: testHelper.dec( 500, 'ae' ) } )

            // Check LQTY staking LUSD balance has increased
            const lqtyStaking_aeusd_balance_after = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.isTrue( lqtyStaking_aeusd_balance_after > 0 )

            // Check D's LUSD balance now equals their requested LUSD
            const LUSDBalance_D = await contracts.aeusdToken.balance( DAddress )
            assert.isTrue( LUSDRequest_D == LUSDBalance_D )
        } )

        it( "openTrove(): Borrowing at zero base rate changes the LQTY staking contract LUSD fees-per-unit-staked", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: C } } )

            // Check baseRate is zero
            const baseRate_1 = await contracts.troveManager.base_rate()
            assert.equal( baseRate_1, '0' )

            // 2 hours pass
            await fastForwardTime( 7200 )

            // Check LUSD reward per LQTY staked == 0
            const f_aeusd_Before = await LQTYContracts.lqtyStaking.f_aeusd()
            assert.equal( f_aeusd_Before, '0' )

            // A stakes LQTY
            await LQTYContracts.lqtyToken.unprotected_mint( AAddress, testHelper.dec( 100, 18 ) )
            await LQTYContracts.lqtyStaking.stake( testHelper.dec( 100, 18 ), { onAccount: A } )

            // D opens trove 
            await openTrove( { extraLUSDAmount: testHelper.dec( 37, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: D } } )

            // Check LUSD reward per LQTY staked > 0
            const F_LUSD_After = await LQTYContracts.lqtyStaking.f_aeusd()
            assert.isTrue( F_LUSD_After > 0 )
        } )

        it( "openTrove(): Borrowing at zero base rate charges minimum fee", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: B } } )

            const LUSDRequest = testHelper.dec( 10000, 18 )
            const txC = await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, LUSDRequest, CAddress, CAddress, { amount: dec( 100, 'ae' ), onAccount: C } )
            const _LUSDFee = testHelper.getEventArgByIndex( txC, "AEUSDBorrowingFeePaid", 1 )

            const expectedFee = BORROWING_FEE_FLOOR * LUSDRequest / testHelper.dec( 1, 18 )
            assert.equal( _LUSDFee, expectedFee )
        } )

        it( "openTrove(): reverts when system is in Recovery Mode and ICR < CCR", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            // price drops, and Recovery Mode kicks in
            await contracts.priceFeedTestnet.set_price( testHelper.dec( 105, 18 ) )

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            // Bob tries to open a trove with 149% ICR during Recovery Mode
            const txPromise = openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 149, 16 ), extraParams: { onAccount: bob } } )            
            await testHelper.assertRevertOpenTrove( txPromise, "BorrowerOps: Operation must leave trove with ICR >= CCR" )
        } )   

        // test number 20 !
        it( "openTrove(): reverts when trove ICR < MCR", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )

            assert.isFalse( await testHelper.checkRecoveryMode( contracts ) )

            // Bob attempts to open a 109% ICR trove in Normal Mode
            const txPromise = openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 109, 16 ), extraParams: { onAccount: bob } } )
            await testHelper.assertRevertOpenTrove( txPromise, "BorrowerOps: An operation that would result in ICR < MCR is not permitted" )

            // price drops, and Recovery Mode kicks in
            await contracts.priceFeedTestnet.set_price( testHelper.dec( 105, 18 ) )

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            // Bob attempts to open a 109% ICR trove in Recovery Mode
            const txPromise2 = openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 109, 16 ), extraParams: { onAccount: bob } } )
            await testHelper.assertRevertOpenTrove( txPromise2, "BorrowerOps: Operation must leave trove with ICR >= CCR" )        
        } )

        it( "openTrove(): reverts when opening the trove would cause the TCR of the system to fall below the CCR", async () => {
            await contracts.priceFeedTestnet.set_price( testHelper.dec( 100, 18 ) )

            // Alice creates trove with 150% ICR.  System TCR = 150%.
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 15, 17 ), extraParams: { onAccount: alice } } )

            const TCR = await testHelper.getTCR( contracts )
            assert.equal( TCR, testHelper.dec( 150, 16 ) )

            // Bob attempts to open a trove with ICR = 149% 
            // System TCR would fall below 150%
            const txPromise = openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 149, 16 ), extraParams: { onAccount: bob } } )
            await testHelper.assertRevertOpenTrove( txPromise, "BorrowerOps: An operation that would result in TCR < CCR is not permitted" )       
        } )

        it( "openTrove(): reverts if trove is already active", async () => {
            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 10, 18 ), extraParams: { onAccount: A } } )

            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 15, 17 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 15, 17 ), extraParams: { onAccount: bob } } )

            const txPromiseBob = openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 3, 18 ), extraParams: { onAccount: bob } } )
            await testHelper.assertRevertOpenTrove( txPromiseBob, "BorrowerOps: Trove is active" )         

            const txPromiseAlice = openTrove( { ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await testHelper.assertRevertOpenTrove( txPromiseAlice, "BorrowerOps: Trove is active" )               
        } )

        it( "openTrove(): Can open a trove with ICR >= CCR when system is in Recovery Mode", async () => {
            // --- SETUP ---
            //  Alice and Bob add coll and withdraw such  that the TCR is ~150%
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 15, 17 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 15, 17 ), extraParams: { onAccount: bob } } )

            const TCR = ( await testHelper.getTCR( contracts ) ).toString()
            assert.equal( TCR, '1500000000000000000' )

            // price drops to 1ETH:100LUSD, reducing TCR below 150%
            await contracts.priceFeedTestnet.set_price( BigInt( '100000000000000000000' ) )
            const price = await contracts.priceFeedTestnet.get_price()

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            // A opens at 150% ICR in Recovery Mode
            const txA = ( await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 15, 17 ), extraParams: { onAccount: A } } ) ).tx
            assert.equal( txA.result.returnType, 'ok' )
            assert.isTrue( await contracts.sortedTroves.contains( AAddress ) )

            const A_TroveStatus = await contracts.troveManager.get_trove_status( AAddress )
            assert.equal( A_TroveStatus, 1 )

            const A_ICR = await contracts.troveManager.get_current_icr( AAddress, price )
            assert.isTrue( A_ICR > testHelper.dec( 150, 16 ) )
        } )

        it( "openTrove(): Reverts opening a trove with min debt when system is in Recovery Mode", async () => {
            // --- SETUP ---
            //  Alice and Bob add coll and withdraw such  that the TCR is ~150%
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 15, 17 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 15, 17 ), extraParams: { onAccount: bob } } )

            const TCR = ( await testHelper.getTCR( contracts ) ).toString()
            assert.equal( TCR, '1500000000000000000' )

            // price drops to 1ETH:100LUSD, reducing TCR below 150%
            await contracts.priceFeedTestnet.set_price( BigInt( '100000000000000000000' ) )

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )

            const txPromise = contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, await getNetBorrowingAmount( MIN_NET_DEBT ), AAddress, AAddress, { onAccount: A, amount: testHelper.dec( 1, 'ae' ) } )
            await testHelper.assertRevert( txPromise, "BorrowerOps: Trove's net debt must be greater than minimum" )
        } )

        it( "openTrove(): creates a new Trove and assigns the correct collateral and debt amount", async () => {
            const debt_Before = await getTroveEntireDebt( aliceAddress )
            const coll_Before = await getTroveEntireColl( aliceAddress )
            const status_Before = await contracts.troveManager.get_trove_status( aliceAddress )

            // check coll and debt before
            assert.equal( debt_Before, 0 )
            assert.equal( coll_Before, 0 )

            // check non-existent status
            assert.equal( status_Before, 0 )

            const LUSDRequest = MIN_NET_DEBT
            await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, MIN_NET_DEBT, aliceAddress, aliceAddress, { onAccount: alice, amount: dec( 100, 'ae' ) } )

            // Get the expected debt based on the LUSD request (adding fee and liq. reserve on top)
            const expectedDebt = LUSDRequest +
                   ( await contracts.troveManager.get_borrowing_fee( LUSDRequest ) ) +
                   LUSD_GAS_COMPENSATION

            const debt_After = await getTroveEntireDebt( aliceAddress )
            const coll_After = await getTroveEntireColl( aliceAddress )
            const status_After = await contracts.troveManager.get_trove_status( aliceAddress )

            // check coll and debt after
            assert.isTrue( coll_After > 0 )
            assert.isTrue( debt_After > 0 )

            assert.equal( debt_After, expectedDebt )

            // check active status
            assert.equal( status_After, 1 )
        } )

        it( "openTrove(): adds Trove owner to TroveOwners array", async () => {
            const TroveOwnersCount_Before = ( await contracts.troveManager.get_trove_owners_count() ).toString()
            assert.equal( TroveOwnersCount_Before, '0' )
            
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 15, 17 ), extraParams: { onAccount: alice } } )
            
            const TroveOwnersCount_After = ( await contracts.troveManager.get_trove_owners_count() ).toString()
            assert.equal( TroveOwnersCount_After, '1' )
        } )

        it( "openTrove(): creates a stake and adds it to total stakes", async () => {
            const aliceStakeBefore = await getTroveStake( aliceAddress )
            const totalStakesBefore = await contracts.troveManager.total_stakes()

            assert.equal( aliceStakeBefore, '0' )
            assert.equal( totalStakesBefore, '0' )

            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            const aliceCollAfter = await getTroveEntireColl( aliceAddress )
            const aliceStakeAfter = await getTroveStake( aliceAddress )
            assert.isTrue( aliceCollAfter > 0 )
            assert.equal( aliceStakeAfter, aliceCollAfter )
            
            const totalStakesAfter = await contracts.troveManager.total_stakes()

            assert.equal( totalStakesAfter, aliceStakeAfter )
        } )

        it( "openTrove(): inserts Trove to Sorted Troves list", async () => {
            // Check before
            const aliceTroveInList_Before = await contracts.sortedTroves.contains( aliceAddress )
            const listIsEmpty_Before = await contracts.sortedTroves.is_empty()
            assert.isFalse( aliceTroveInList_Before )
            assert.isTrue( listIsEmpty_Before )

            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )

            // check after
            const aliceTroveInList_After = await contracts.sortedTroves.contains( aliceAddress )
            const listIsEmpty_After = await contracts.sortedTroves.is_empty()
            assert.isTrue( aliceTroveInList_After )
            assert.isFalse( listIsEmpty_After )
        } )

        it( "openTrove(): Increases the activePool AE and raw ether balance by correct amount", async () => {
            const activePool_ETH_Before = await contracts.activePool.get_ae()
            const activePool_RawEther_Before = await contracts.sdk.getBalance( contracts.activePool.address )
            assert.equal( activePool_ETH_Before, 0 )
            assert.equal( activePool_RawEther_Before, 0 )

            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            const aliceCollAfter = await getTroveEntireColl( aliceAddress )

            const activePool_ETH_After = await contracts.activePool.get_ae()
            const activePool_RawEther_After = BigInt( await contracts.sdk.getBalance( contracts.activePool.address ) )
            assert.equal( activePool_ETH_After, aliceCollAfter )
            assert.equal( activePool_RawEther_After, aliceCollAfter )
        } )

        it( "openTrove(): records up-to-date initial snapshots of L_AE and L_AEUSDDebt", async () => {
            // --- SETUP ---

            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )

            // --- TEST ---

            // price drops to 1ae:100ae_usd, reducing A's ICR below MCR
            await contracts.priceFeedTestnet.set_price( testHelper.dec( 100, 18 ) )      

            assert.isTrue( await testHelper.checkRecoveryMode( contracts ) )
            
            // close A's Trove, liquidating her 1 ether and 180LUSD.
            // const liquidation = await contracts.troveManager.batch_liquidate_troves_aux([AAddress], { onAccount: B })
            // console.log(liquidation)
            const liquidationTx = await contracts.troveManager.original.methods.liquidate( AAddress, { onAccount: B } ) // TODO: here B address is owner proxy ?
            const [ liquidatedDebt, liquidatedColl, gasComp, laeusdGasComp ] = testHelper.getEmittedLiquidationValues( liquidationTx )

            /* with total stakes = 10 ether, after liquidation, L_ETH should equal 1/10 ether per-ether-staked,
                   and L_LUSD should equal 18 LUSD per-ether-staked. */

            const L_AE = await contracts.troveManager.l_ae()
            const L_AEUSD = await contracts.troveManager.l_aeusd_debt()

            assert.isTrue( L_AE > 0 )
            assert.isTrue( L_AEUSD > 0 )

            // Bob opens trove
            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: bob } } )

            // // Check Bob's snapshots of l_ae and l_aeusd equal the respective current values
            const bob_rewardSnapshot = await contracts.troveManager.reward_snapshots( bobAddress )
            const bob_ETHrewardSnapshot = bob_rewardSnapshot.ae
            const bob_LUSDDebtRewardSnapshot = bob_rewardSnapshot.aeusd_debt
            
            assert.isAtMost( testHelper.getDifference( bob_ETHrewardSnapshot, L_AE ), 1000 )
            assert.isAtMost( testHelper.getDifference( bob_LUSDDebtRewardSnapshot, L_AEUSD ), 1000 )
        } )

        it( "openTrove(): allows a user to open a Trove, then close it, then re-open it", async () => {
            // Open Troves
            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: A } } )

            // Check Trove is active
            const alice_Trove_status_1 = await contracts.troveManager.get_trove_status( aliceAddress )
            assert.equal( alice_Trove_status_1, 1 )
            assert.isTrue( await contracts.sortedTroves.contains( aliceAddress ) )

            // to compensate borrowing fees
            await contracts.aeusdToken.transfer( aliceAddress, testHelper.dec( 10000, 18 ), { onAccount: bob } )

            // Repay and close Trove
            await contracts.borrowerOperations.close_trove( { onAccount: alice } )

            // Check Trove is closed
            const alice_Trove_status_2 = await contracts.troveManager.get_trove_status( aliceAddress )
            assert.equal( alice_Trove_status_2, 2 )
            assert.isFalse( await contracts.sortedTroves.contains( aliceAddress ) )

            // Re-open Trove
            await openTrove( { extraLUSDAmount: testHelper.dec( 5000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )

            // Check Trove is re-opened
            const alice_Trove_status_3 = await contracts.troveManager.get_trove_status( aliceAddress )
            assert.equal( alice_Trove_status_3, 1 )
            assert.isTrue( await contracts.sortedTroves.contains( aliceAddress ) )
        } )

        it( "openTrove(): increases the Trove's ae_usd debt by the correct amount", async () => {
            // check before
            const alice_Trove_debt_Before = await contracts.troveManager.get_trove_debt( aliceAddress )
            assert.equal( alice_Trove_debt_Before, 0 )

            await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, await getOpenTroveLUSDAmount( testHelper.dec( 10000, 18 ) ), aliceAddress, aliceAddress, { onAccount: alice, amount: testHelper.dec( 100, 'ae' ) } )
            
            // check after
            const alice_Trove_debt_After = await contracts.troveManager.get_trove_debt( aliceAddress )
            testHelper.assertIsApproximatelyEqual( alice_Trove_debt_After, testHelper.dec( 10000, 18 ), 10000 )
        } )

        it( "openTrove(): increases ae usd debt in ActivePool by the debt of the trove", async () => {
            const activePool_aeusd_debt_Before = await contracts.activePool.get_aeusd_debt() 
            assert.equal( activePool_aeusd_debt_Before, 0 )

            await openTrove( { extraLUSDAmount: testHelper.dec( 10000, 18 ), ICR: testHelper.dec( 2, 18 ), extraParams: { onAccount: alice } } )
            const aliceDebt = await getTroveEntireDebt( aliceAddress )
            assert.isTrue( aliceDebt > 0 )

            const activePool_aeusd_debt_After = await contracts.activePool.get_aeusd_debt() 
            assert.equal( activePool_aeusd_debt_After, aliceDebt )
        } )

        it( "openTrove(): increases user LUSDToken balance by correct amount", async () => {
            // check before
            const alice_aeusd_TokenBalance_Before = await contracts.aeusdToken.balance( aliceAddress )
            assert.equal( alice_aeusd_TokenBalance_Before, undefined )

            await contracts.borrowerOperations.original.methods.open_trove( testHelper._100pct, testHelper.dec( 10000, 18 ), aliceAddress, aliceAddress, { onAccount: alice, amount: testHelper.dec( 100, 'ae' ) } )           
            
            // check after
            const alice_aesusd_TokenBalance_After = await contracts.aeusdToken.balance( aliceAddress )
            assert.equal( alice_aesusd_TokenBalance_After, dec( 10000, 18 ) )
        } )   
        
    } )
} )
