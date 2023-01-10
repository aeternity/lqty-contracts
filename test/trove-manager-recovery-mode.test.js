const { assert } = require( 'chai' )
const GAS_PRICE = 1000000000n // TODO: 10000000 but IllegalArgumentError: Gas price 10000000 must be bigger then 1000000000

import utils from '../utils/contract-utils'
import { wrapContractInstance } from '../utils/wrapper'
import { setupDeployment, connectCoreContracts  } from './shared/deploymentHelper'
import {
    testHelper, timeValues, moneyValues
} from './shared/testHelper'
const { dec, getDifference, assertRevert } = testHelper

import wallets from '../config/wallets.json'
const accounts = wallets.defaultWallets.map( x => x.publicKey )

describe( 'Trove Manager - Recovery mode', () => {
    
    describe( 'Recovery mode tests ...', () => {
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

        // --- claimCollateral ---

        // --- liquidate(), applied to trove with ICR > 110% that has the lowest ICR, and Stability Pool LUSD is GREATER THAN liquidated debt ---

        it( "liquidate(), with 110% < ICR < TCR, and StabilityPool LUSD > debt to liquidate: offsets the trove entirely with the pool", async () => {
            // --- SETUP ---
            // Alice withdraws up to 1500 LUSD of debt, and Dennis up to 150, resulting in ICRs of 266%.
            // Bob withdraws up to 250 LUSD of debt, resulting in ICR of 240%. Bob has lowest ICR.
            const { collateral: B_coll, totalDebt: B_totalDebt } = await openTrove( { ICR: dec( 240, 16 ), extraLUSDAmount: dec( 250, 18 ), extraParams: { onAccount: bob } } )
            const { collateral: A_coll } = await openTrove( { ICR: dec( 266, 16 ), extraLUSDAmount: B_totalDebt, extraParams: { onAccount: alice } } )
            const { collateral: D_coll } = await openTrove( { ICR: dec( 266, 16 ), extraLUSDAmount: dec( 2000, 18 ), extraParams: { onAccount: D /*dennis*/ } } )

            // Alice deposits LUSD in the Stability Pool
            const spDeposit = B_totalDebt + 1n
            await contracts.stabilityPool.provide_to_sp( spDeposit, null, { onAccount: alice } )

            // --- TEST ---
            // price drops to 1ETH:100LUSD, reducing TCR below 150%
            await contracts.priceFeedTestnet.set_price( '100000000000000000000' )
            const price = await contracts.priceFeedTestnet.get_price()
            const TCR = await testHelper.getTCR( contracts )

            const recoveryMode = await testHelper.checkRecoveryMode( contracts )
            assert.isTrue( recoveryMode )

            // Check Bob's ICR is between 110 and TCR
            const bob_ICR = await contracts.troveManager.get_current_icr( bobAddress, price )

            assert.isTrue( bob_ICR > moneyValues._MCR && bob_ICR < TCR )

            // Liquidate Bob
            const txLiq = await contracts.troveManager.original.methods.liquidate( bobAddress, { onAccount: A /* owner */ } )
            //testHelper.printEvents(txLiq)

            /* Check accrued Stability Pool rewards after. Total Pool deposits was 1490 LUSD, Alice sole depositor.
               As liquidated debt (250 LUSD) was completely offset

               Alice's expected compounded deposit: (1490 - 250) = 1240LUSD
               Alice's expected ETH gain:  Bob's liquidated capped coll (minus gas comp), 2.75*0.995 ae
  
            */
            const aliceExpectedDeposit = await contracts.stabilityPool.get_compounded_aeusd_deposit( aliceAddress )
            console.log(aliceExpectedDeposit)
            const aliceExpectedETHGain = await contracts.stabilityPool.get_depositor_ae_gain( aliceAddress )
            console.log(aliceExpectedETHGain)
            assert.isAtMost( testHelper.getDifference( aliceExpectedDeposit, spDeposit - B_totalDebt ), 2000 )
            assert.isAtMost( testHelper.getDifference( aliceExpectedETHGain, testHelper.applyLiquidationFee( B_totalDebt * dec( 11, 17 ) / price ) ), 3000 )

            // check Bob’s collateral surplus
            const bob_remainingCollateral = B_coll - B_totalDebt * dec( 11, 17 ) / price
            testHelper.assertIsApproximatelyEqual( await contracts.collSurplusPool.get_collateral( bobAddress ), bob_remainingCollateral )
            // can claim collateral
            const bob_balanceBefore = await contracts.sdk.getBalance( bobAddress )
            //const ae = await contracts.collSurplusPool.get_ae()
            //console.log(ae)
            const BOB_GAS = testHelper.gasUsed( await contracts.borrowerOperations.original.methods.claim_collateral( { onAccount: bob, gasPrice: GAS_PRICE  } ) )
            const bob_expectedBalance = BigInt(bob_balanceBefore) - BOB_GAS * GAS_PRICE
            console.log(bob_expectedBalance - bob_remainingCollateral)
            const bob_balanceAfter = BigInt(await contracts.sdk.getBalance( bobAddress ))
            console.log(bob_balanceAfter)
            testHelper.assertIsApproximatelyEqual( bob_balanceAfter, bob_expectedBalance + bob_remainingCollateral )
        } )

    } )
} )
