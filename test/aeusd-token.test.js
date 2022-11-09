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

describe( 'AEUSD Token', () => {
    describe( 'AEUSD Token Tests ...', () => {
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
        
        const [ ownerAddress, aliceAddress, bobAddress, carolAddress, denisAddress, bountyAddress, lpRewardsAddress, multisigAddress ] = accounts.slice( accounts.length - 8, accounts.length )

        let bob
        let alice
        let owner
        let carol
        let denis
        let multisig

        let tokenName
        
        utils.beforeEachWithSnapshot( 'deploy contracts', async () => {
            const { deployLiquityCore, deployLQTYContracts } = await setupDeployment()
            contracts = await deployLiquityCore()
            LQTYContracts = await deployLQTYContracts( bountyAddress, lpRewardsAddress, multisigAddress )

            const deployContract = utils.deployContract( contracts.sdk )

            timeOffsetForDebugger = wrapContractInstance(
                await deployContract( './test/contracts/TimeOffsetForDebug.aes', )
            )

            await contracts.troveManager.set_timestamp_offset_for_debug( timeOffsetForDebugger.address )
            await contracts.aeusdToken.set_timestamp_offset_for_debug( timeOffsetForDebugger.address )
            await LQTYContracts.lqtyToken.set_timestamp_offset_for_debug( timeOffsetForDebugger.address )

            //connect contracts
            console.log( "connecting contracts" )
            await connectCoreContracts( contracts, LQTYContracts )

            bob = contracts.sdk.accounts[bobAddress]
            alice = contracts.sdk.accounts[aliceAddress]
            owner = contracts.sdk.accounts[ownerAddress]
            carol = contracts.sdk.accounts[carolAddress]
            denis = contracts.sdk.accounts[denisAddress]
            multisig = contracts.sdk.accounts[multisigAddress]

            tokenName = await contracts.aeusdToken.meta_info().name

            await contracts.aeusdToken.unprotected_mint( aliceAddress, 150 )
            await contracts.aeusdToken.unprotected_mint( bobAddress, 100 )
            await contracts.aeusdToken.unprotected_mint( carolAddress, 50 )           
        } )

        it( "balanceOf(): gets the balance of the account", async () => {
            const aliceBalance = await contracts.aeusdToken.balance( aliceAddress )
            const bobBalance = await contracts.aeusdToken.balance( bobAddress )
            const carolBalance = await contracts.aeusdToken.balance( carolAddress )

            assert.equal( aliceBalance, 150 )
            assert.equal( bobBalance, 100 )
            assert.equal( carolBalance, 50 )
        } )

        it( 'totalSupply(): gets the total supply', async () => {
            const total = ( await contracts.aeusdToken.total_supply() )
            assert.equal( total, '300' ) // 300
        } )

        it( "name(): returns the token's name", async () => {
            const meta_info = await contracts.aeusdToken.meta_info()
            assert.equal( meta_info.name, "AEUSD Stablecoin" )
            assert.equal( meta_info.symbol, "AEUSD" )
            assert.equal( meta_info.decimals, 18 )                    
        } )

        it( "allowance(): returns an account's spending allowance for another account's balance", async () => {
            await contracts.aeusdToken.create_allowance( aliceAddress, 100, { onAccount: bob } )

            const allowance_A = await contracts.aeusdToken.allowance( { from_account: bobAddress, for_account: aliceAddress } )
            const allowance_D = await contracts.aeusdToken.allowance( { from_account: bobAddress, for_account: denisAddress } )

            assert.equal( allowance_A, 100 )
            assert.equal( allowance_D, undefined )
        } )

        it( "approve(): approves an account to spend the specified amount", async () => {
            const allowance_A_before = await contracts.aeusdToken.allowance( { from_account: bobAddress, for_account: aliceAddress } )
            assert.equal( allowance_A_before, undefined )

            await contracts.aeusdToken.create_allowance( aliceAddress, 100, { onAccount: bob } )

            const allowance_A_after = await contracts.aeusdToken.allowance( { from_account: bobAddress, for_account: aliceAddress } )
            assert.equal( allowance_A_after, 100 )
        } )

        it( "transferFrom(): successfully transfers from an account which is it approved to transfer from", async () => {
            const allowance_A_0 = await contracts.aeusdToken.allowance( { from_account: bobAddress, for_account: aliceAddress } )
            assert.equal( allowance_A_0, undefined )

            await contracts.aeusdToken.create_allowance( aliceAddress, 50, { onAccount: bob } )         

            // Check A's allowance of Bob's funds has increased
            const allowance_A_1 = await contracts.aeusdToken.allowance( { from_account: bobAddress, for_account: aliceAddress } )
            assert.equal( allowance_A_1, 50 )

            assert.equal( await contracts.aeusdToken.balance( carolAddress ), 50 )

            // Alice transfers from bob to Carol, using up her allowance
            await contracts.aeusdToken.transfer_allowance( bobAddress, carolAddress, 50, { onAccount: alice } )
            assert.equal( await contracts.aeusdToken.balance( carolAddress ), 100 )

            // Check A's allowance of Bob's funds has decreased
            const allowance_A_2 = await contracts.aeusdToken.allowance( { from_account: bobAddress, for_account: aliceAddress } )
            assert.equal( allowance_A_2, 0 )

            // Check bob's balance has decreased
            assert.equal( await contracts.aeusdToken.balance( bobAddress ), 50 )

            // Alice tries to transfer more tokens from bob's account to carol than she's allowed
            const txPromise = contracts.aeusdToken.original.methods.transfer_allowance( bobAddress, carolAddress, 50, { from: alice } )
            await testHelper.assertRevert( txPromise, "ALLOWANCE_NOT_EXISTENT" )
        } )

        it( "transfer(): increases the recipient's balance by the correct amount", async () => {
            assert.equal( await contracts.aeusdToken.balance( aliceAddress ), 150 )

            await contracts.aeusdToken.transfer( aliceAddress, 37, { onAccount: bob } )

            assert.equal( await contracts.aeusdToken.balance( aliceAddress ), 187 )
        } )

        it( "transfer(): reverts if amount exceeds sender's balance", async () => {
            assert.equal( await contracts.aeusdToken.balance( bobAddress ), 100 )

            const txPromise = contracts.aeusdToken.original.methods.transfer( aliceAddress, 101, { onAccount: bob } )
            await testHelper.assertRevert( txPromise, "ACCOUNT_INSUFFICIENT_BALANCE" )
        } )

        it( 'transfer(): transferring to a blacklisted address reverts', async () => {
            await testHelper.assertRevert( contracts.aeusdToken.original.methods.transfer( contracts.aeusdToken.accountAddress, 1, { onAccount: alice } ), "" )
            //await testHelper.assertRevert(contracts.aeusdToken.original.methods.transfer(ZERO_ADDRESS, 1, { onAccount: alice }))
            await testHelper.assertRevert( contracts.aeusdToken.original.methods.transfer( contracts.troveManager.accountAddress, 1, { onAccount: alice } ), "" )
            await testHelper.assertRevert( contracts.aeusdToken.original.methods.transfer( contracts.stabilityPool.accountAddress, 1, { onAccount: alice } ), "" )
            await testHelper.assertRevert( contracts.aeusdToken.original.methods.transfer( contracts.borrowerOperations.accountAddress, 1, { onAccount: alice } ), "" )
        } )

        it( "increaseAllowance(): increases an account's allowance by the correct amount", async () => {
            const allowance_A_Before = await contracts.aeusdToken.allowance( { from_account: bobAddress, for_account: aliceAddress } )
            assert.equal( allowance_A_Before, undefined )

            // modified change_allowance to create the allowance if it do not exists like here
            await contracts.aeusdToken.change_allowance( aliceAddress, 100, { onAccount: bob } )

            const allowance_A_After = await contracts.aeusdToken.allowance( { from_account: bobAddress, for_account: aliceAddress } )
            assert.equal( allowance_A_After, 100 )
        } )

        it( 'mint(): issues correct amount of tokens to the given address', async () => {
            const alice_balanceBefore = await contracts.aeusdToken.balance( aliceAddress )
            assert.equal( alice_balanceBefore, 150 )

            await contracts.aeusdToken.unprotected_mint( aliceAddress, 100 )

            const alice_BalanceAfter = await contracts.aeusdToken.balance( aliceAddress )
            assert.equal( alice_BalanceAfter, 250 )
        } )

        it( 'burn(): burns correct amount of tokens from the given address', async () => {
            const alice_balanceBefore = await contracts.aeusdToken.balance( aliceAddress )
            assert.equal( alice_balanceBefore, 150 )

            // TODO: problem with negative numbers
            //await contracts.aeusdToken.unprotected_mint(aliceAddress, - 70)       
            await contracts.aeusdToken.unprotected_burn( aliceAddress, 70 )

            const alice_BalanceAfter = await contracts.aeusdToken.balance( aliceAddress )     
            assert.equal( alice_BalanceAfter, 80 )
        } )

        it( 'sendToPool(): changes balances of Stability pool and user by the correct amounts', async () => {
            const stabilityPool_BalanceBefore = await contracts.aeusdToken.balance( contracts.stabilityPool.accountAddress ) 
            const bob_BalanceBefore = await contracts.aeusdToken.balance( bobAddress )
            assert.equal( stabilityPool_BalanceBefore, undefined )
            assert.equal( bob_BalanceBefore, 100 )

            await await contracts.aeusdToken.unprotected_send_to_pool( bobAddress, contracts.stabilityPool.accountAddress, 75 )

            const stabilityPool_BalanceAfter = await contracts.aeusdToken.balance( contracts.stabilityPool.accountAddress ) 
            const bob_BalanceAfter = await contracts.aeusdToken.balance( bobAddress )
            assert.equal( stabilityPool_BalanceAfter, 75 )
            assert.equal( bob_BalanceAfter, 25 )
        } )

        it( 'returnFromPool(): changes balances of Stability pool and user by the correct amounts', async () => {
            /// --- SETUP --- give pool 100 LUSD
            await contracts.aeusdToken.unprotected_mint( contracts.stabilityPool.accountAddress, 100 )

            /// --- TEST ---
            const stabilityPool_BalanceBefore = await contracts.aeusdToken.balance( contracts.stabilityPool.accountAddress ) 
            const  bob_BalanceBefore = await contracts.aeusdToken.balance( bobAddress )
            assert.equal( stabilityPool_BalanceBefore, 100 )
            assert.equal( bob_BalanceBefore, 100 )

            await contracts.aeusdToken.unprotected_return_from_pool( contracts.stabilityPool.accountAddress, bobAddress, 75 )

            const stabilityPool_BalanceAfter = await contracts.aeusdToken.balance( contracts.stabilityPool.accountAddress ) 
            const bob_BalanceAfter = await contracts.aeusdToken.balance( bobAddress )
            assert.equal( stabilityPool_BalanceAfter, 25 )
            assert.equal( bob_BalanceAfter, 175 )
        } )

        it( 'decreaseAllowance(): decreases allowance by the expected amount', async () => {
            await contracts.aeusdToken.create_allowance( bobAddress, testHelper.dec( 3, 18 ), { onAccount: alice } )            
            assert.equal( ( await contracts.aeusdToken.allowance( { from_account: aliceAddress, for_account: bobAddress } ) ), testHelper.dec( 3, 18 ) )

            await contracts.aeusdToken.change_allowance( bobAddress, - testHelper.dec( 1, 18 ), { onAccount: alice } )
            assert.equal( ( await contracts.aeusdToken.allowance( { from_account: aliceAddress, for_account: bobAddress } ) ), testHelper.dec( 2, 18 ) )
        } )

        // TODO: EIP2612 tests ?
        
    } )
} )
