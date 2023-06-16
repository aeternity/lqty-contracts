const { assert, expect } = require( 'chai' )

import utils from '../utils/contract-utils'
import { wrapContractInstance } from '../utils/wrapper'
import { setupDeployment, connectCoreContracts  } from './shared/deploymentHelper'
import {
    testHelper, timeValues, expectToRevert, withFee, MoneyValues
} from './shared/testHelper'
const { dec, getDifference, assertRevert } = testHelper

import wallets from '../config/wallets.json'
const accounts = wallets.defaultWallets.map( x => x.publicKey )

describe( 'Demo', () => {

    describe( 'Demo use case ...', () => {
        let contracts
        let LQTYContracts
        let timeOffsetForDebugger

        const getOpenTroveAEUSDAmount = async ( totalDebt ) => testHelper.getOpenTroveAEUSDAmount( contracts, totalDebt )
        const getNetBorrowingAmount = async ( debtWithFee ) => testHelper.getNetBorrowingAmount( contracts, debtWithFee )
        const getActualDebtFromComposite = async ( compositeDebt ) => testHelper.getActualDebtFromComposite( compositeDebt, contracts )
        const openTrove = async ( params ) => testHelper.openTrove( contracts, params )
        const getTroveEntireColl = async ( trove ) => testHelper.getTroveEntireColl( contracts, trove )
        const getTroveEntireDebt = async ( trove ) => testHelper.getTroveEntireDebt( contracts, trove )
        const getTroveStake = async ( trove ) => testHelper.getTroveStake( contracts, trove )
        
        let AEUSD_GAS_COMPENSATION
        const getTrove = ( address ) => contracts.troveManager.troves( address )

        let MIN_NET_DEBT
        let BORROWING_FEE_FLOOR

        const fastForwardTime = async ( seconds ) => timeOffsetForDebugger.fast_forward_time(
            BigInt( seconds ) * 1000n
        )

        const getTimestampOffset = async (  ) => BigInt( await timeOffsetForDebugger.get_timestamp_offset() ) * 1000n

        const [ AAddress, BAddress, CAddress, DAddress, EAddress, bobAddress, aliceAddress, bountyAddress, lpRewardsAddress, multisigAddress ] = accounts

        let bob
        let owner
        let alice
        let A
        let B
        let C
        let D
        let E
        let whale
        let dennis
        const ownerAddress = AAddress
        const dennisAddress = BAddress
        const whaleAddress = CAddress
        let multisig

        let aeusdToken, borrowerOperations, troveManager, priceFeed, sortedTroves, activePool, defaultPool

        let poolsState = async function () {
            console.log('active    pool AE    balance : ' + MoneyValues.get(await contracts.sdk.getBalance( contracts.activePool.accountAddress ) ))
            //console.log('active    pool AEUSD balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( contracts.activePool.accountAddress) ))
            console.log('stability pool AE    balance : ' + MoneyValues.get(await contracts.sdk.getBalance( contracts.stabilityPool.accountAddress ) ))
            //console.log('stability pool AEUSD balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( contracts.stabilityPool.accountAddress) ))
            console.log('default   pool AE    balance : ' + MoneyValues.get(await contracts.sdk.getBalance( contracts.defaultPool.accountAddress ) ))
            //console.log('default   pool AEUSD balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( contracts.defaultPool.accountAddress) ))
            //console.log('gas       pool AE    balance : ' + MoneyValues.get(await contracts.sdk.getBalance( contracts.gasPool.accountAddress ) ))
            console.log('gas       pool AEUSD balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( contracts.gasPool.accountAddress) ))
            console.log('lqty stacking  AEUSD balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.address.replace( "ct_", "ak_" ) )))

        }

        let icrs = async function () {
            const price = await contracts.priceFeedTestnet.get_price()
            console.log('alice ICR :' + MoneyValues.get(await contracts.troveManager.get_current_icr( aliceAddress, price )))
            console.log('bob   ICR :' + MoneyValues.get(await contracts.troveManager.get_current_icr( bobAddress, price )))
            console.log('carol ICR :' + MoneyValues.get(await contracts.troveManager.get_current_icr( CAddress, price )))
        }

        utils.beforeEachWithSnapshot( 'deploy contract', async () => {
            const { deployLiquityCore, deployLQTYContracts } = await setupDeployment()
            contracts = await deployLiquityCore()

            ;( {
                aeusdToken, borrowerOperations, troveManager, priceFeedTestnet: priceFeed,
                sortedTroves, activePool, defaultPool
            } = contracts )

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

            AEUSD_GAS_COMPENSATION = await contracts.borrowerOperations.aeusd_gas_compensation()
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
            whale = contracts.sdk.accounts[whaleAddress]
            owner = contracts.sdk.accounts[ownerAddress]
        } )


        it( "demo 1: open three troves and liquidate one", async () => {
            const carol = C
            const carolAddress = CAddress
            const ted = A
            const tedAddress = AAddress

            console.log('ae initial price                    : ' + MoneyValues.get(await contracts.priceFeedTestnet.get_price()))
            assert.isFalse( await contracts.troveManager.check_recovery_mode( await contracts.priceFeedTestnet.get_price()))
            console.log('min debt + 1 :' + MoneyValues.get(await testHelper.getNetBorrowingAmount( contracts, await contracts.borrowerOperations.min_net_debt() + 1n)))

            poolsState()

            const aliceAE = await contracts.sdk.getBalance( aliceAddress )
            const { collateral: aliceCollBefore, totalDebt: aliceDebtBefore } = await openTrove( { extraAEUSDAmount: dec( 15000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            console.log('alice opens a torve ===============================================================================')
            console.log('alice opens a tove with collateral  : ' + MoneyValues.get(aliceCollBefore) + ' and debt: ' + MoneyValues.get(aliceDebtBefore) + ' and ICR: 2')
            console.log('alice spent ae                      : ' + MoneyValues.get((aliceAE - await contracts.sdk.getBalance( aliceAddress ))))
            console.log('alice received AEUSD token          : ' + MoneyValues.get(await contracts.aeusdToken.balance (aliceAddress)))

            poolsState()

            const activePool_AE_Before = await contracts.activePool.get_ae()
            const activePool_Rawae_Before = await contracts.sdk.getBalance( contracts.activePool.accountAddress )
            assert.equal(activePool_AE_Before, activePool_Rawae_Before )

            const { collateral: bobCollBefore, totalDebt: bobDebtBefore } = await openTrove( { extraAEUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            console.log('bob opens a torve ===============================================================================')
            console.log('bob opens a tove with collateral    : ' + MoneyValues.get(bobCollBefore) + ' and debt: ' + MoneyValues.get(bobDebtBefore)+ ' and ICR:2')
            console.log('bob received AEUSD token            : ' + MoneyValues.get(await contracts.aeusdToken.balance (bobAddress)))

            poolsState()

            // open Carol trove
            const { collateral: carolCollBefore, totalDebt: carolDebtBefore } = await openTrove( { extraAEUSDAmount: dec( 5000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: carol } } )
            console.log('carol opens a torve ===============================================================================')
            console.log('carol opens a tove with collateral  : ' + MoneyValues.get(carolCollBefore) + '  and debt: ' + MoneyValues.get(carolDebtBefore))
            console.log('carol received AEUSD token          : ' + MoneyValues.get(await contracts.aeusdToken.balance (carolAddress)))

            await icrs()
            await poolsState()

            // price drops to 1AE:100AEUSD, reducing Carol's ICR below MCR
            await contracts.priceFeedTestnet.set_price( '100000000000000000000' )
            const price1 = await contracts.priceFeedTestnet.get_price()
            console.log('ae price drops and is in Recovery mode ============================================================')
            console.log('ae price drops to                : ' + MoneyValues.get(price1))
            assert.isTrue( await contracts.troveManager.check_recovery_mode( price1 ) )

            await icrs()

            const tedAE = await contracts.sdk.getBalance( tedAddress )

            // Liquidate Carol's Trove,
            const tx = await contracts.troveManager.liquidate( carolAddress, { onAccount: ted } )
            assert.isFalse( await contracts.sortedTroves.contains( carolAddress ) )
            console.log('carol trove is liquidated by ted ==========================================================================')
            console.log('alice ICR : ' + MoneyValues.get(await contracts.troveManager.get_current_icr( aliceAddress, price1 )))
            console.log('bob   ICR : ' + MoneyValues.get(await contracts.troveManager.get_current_icr( bobAddress, price1 )))
            console.log('ted gets 200 aeusd token       : ' + MoneyValues.get(await contracts.aeusdToken.balance (tedAddress)))
            console.log('ted gains ae                   : ' + MoneyValues.get((await contracts.sdk.getBalance( tedAddress ) - tedAE)))
            assert.isTrue( await contracts.troveManager.check_recovery_mode( price1 ) )
            await poolsState()

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

            const alicePendingAEReward = await contracts.troveManager.get_pending_ae_reward( aliceAddress )
            console.log('alice pending ae reward    : ' + MoneyValues.get(alicePendingAEReward))
            const bobPendingAEReward = await contracts.troveManager.get_pending_ae_reward( bobAddress )
            console.log('bob pending ae reward      : ' + MoneyValues.get(bobPendingAEReward))
            const alicePendingAEUSDDebtReward = await contracts.troveManager.get_pending_aeusd_debt_reward( aliceAddress )
            console.log('alice pending aeusd reward : ' + MoneyValues.get(alicePendingAEUSDDebtReward))
            const bobPendingAEUSDDebtReward = await contracts.troveManager.get_pending_aeusd_debt_reward( bobAddress )
            console.log('bob pending aeusd reward   : ' + MoneyValues.get(bobPendingAEUSDDebtReward))

            var reward
            for ( reward of [ alicePendingAEReward, bobPendingAEReward, alicePendingAEUSDDebtReward, bobPendingAEUSDDebtReward ] ) {
                assert.isTrue( reward > 0 )
            }

            // Alice and Bob top up their Troves
            const aliceTopUp = dec( 5, 'ae' )
            await contracts.borrowerOperations.add_coll( aliceAddress, aliceAddress, { onAccount: alice, amount: aliceTopUp } )
            console.log('alice adds 5 ae collateral =========================================================================')
            console.log('alice ICR : ' + MoneyValues.get(await contracts.troveManager.get_current_icr( aliceAddress, price1 )))
            console.log('bob   ICR : ' + MoneyValues.get(await contracts.troveManager.get_current_icr( bobAddress, price1 )))
            await poolsState()

            // Check that both alice and Bob have had pending rewards applied in addition to their top-ups. 
            const aliceNewColl = await getTroveEntireColl( aliceAddress )
            const aliceNewDebt = await getTroveEntireDebt( aliceAddress )

            console.log('ae')
            console.log('alice original coll        : ' + MoneyValues.get(aliceCollBefore))
            console.log('alice added coll           : ' + MoneyValues.get(aliceTopUp))
            console.log('alice new coll with rewards: ' + MoneyValues.get(aliceNewColl))
            console.log('aeusd')
            console.log('alice original debt        : ' + MoneyValues.get(aliceDebtBefore))
            console.log('alice reward debt          : ' + MoneyValues.get(alicePendingAEUSDDebtReward))
            console.log('alice new debt with rewards: ' + MoneyValues.get(aliceNewDebt))
            console.log('alice wallet aeusd         : ' + MoneyValues.get(await contracts.aeusdToken.balance (aliceAddress)))

            const bobTopUp = dec( 1, 'ae' )
            await contracts.borrowerOperations.add_coll( bobAddress, bobAddress, { onAccount: bob, amount: bobTopUp } )
            console.log('bob adds 1 ae collateral ============================================================================')
            console.log('alice ICR : ' + MoneyValues.get(await contracts.troveManager.get_current_icr( aliceAddress, price1 )))
            console.log('bob   ICR : ' + MoneyValues.get(await contracts.troveManager.get_current_icr( bobAddress, price1 )))
            await poolsState()

            const bobNewColl = await getTroveEntireColl( bobAddress )
            const bobNewDebt = await getTroveEntireDebt( bobAddress )

            console.log('ae')
            console.log('bob original coll        : ' + MoneyValues.get(bobCollBefore))
            console.log('bob added coll           : ' + MoneyValues.get(bobTopUp))
            console.log('bob new coll with rewards: ' + MoneyValues.get(bobNewColl))
            console.log('aeusd')
            console.log('bob original debt        : ' + MoneyValues.get(bobDebtBefore))
            console.log('bob reward debt          : ' + MoneyValues.get(bobPendingAEUSDDebtReward))
            console.log('bob new debt with rewards: ' + MoneyValues.get(bobNewDebt))
            console.log('bob wallet aeusd         : ' + MoneyValues.get(await contracts.aeusdToken.balance (bobAddress)))

            assert.equal( aliceNewColl, aliceCollBefore + alicePendingAEReward + aliceTopUp )
            assert.equal( aliceNewDebt, aliceDebtBefore + alicePendingAEUSDDebtReward )
            assert.equal( bobNewColl, bobCollBefore + bobPendingAEReward + bobTopUp )
            assert.equal( bobNewDebt, bobDebtBefore + bobPendingAEUSDDebtReward )

            /* Check that both Alice and Bob's snapshots of the rewards-per-unit-staked metrics should be updated
        to the latest amounts of L_AE and L_AEUSDDebt */
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

            assert.isTrue( await contracts.troveManager.check_recovery_mode( price1 ) )
        } )

    } )
} )
