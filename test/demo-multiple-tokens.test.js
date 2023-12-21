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

describe( 'Demo multiple stable tokens', () => {

    describe( 'Demo multiple stable coins case ...', () => {
        let contracts
        let LQTYContracts
        let sdk

        let contracts2
        let LQTYContracts2
        
        let timeOffsetForDebugger

        const openTrove = async ( params ) => testHelper.openTrove( contracts, params )
        const openTrove2 = async ( params ) => testHelper.openTrove( contracts2, params )        
        
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

        // let aeusdToken, borrowerOperations, troveManager, priceFeed, sortedTroves, activePool, defaultPool

        let poolsState = async function ( contracts , lqty) {
            console.log('active    pool AE    balance : ' + MoneyValues.get(await contracts.sdk.getBalance( contracts.activePool.accountAddress ) ))
            //console.log('active    pool AEUSD balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( contracts.activePool.accountAddress) ))
            console.log('stability pool AE    balance : ' + MoneyValues.get(await contracts.sdk.getBalance( contracts.stabilityPool.accountAddress ) ))
            //console.log('stability pool AEUSD balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( contracts.stabilityPool.accountAddress) ))
            console.log('default   pool AE    balance : ' + MoneyValues.get(await contracts.sdk.getBalance( contracts.defaultPool.accountAddress ) ))
            //console.log('default   pool AEUSD balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( contracts.defaultPool.accountAddress) ))
            //console.log('gas       pool AE    balance : ' + MoneyValues.get(await contracts.sdk.getBalance( contracts.gasPool.accountAddress ) ))
            console.log('gas       pool AEUSD balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( contracts.gasPool.accountAddress) ))
            console.log('lqty stacking  AEUSD balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( lqty.lqtyStaking.address.replace( "ct_", "ak_" ) )))

        }

        let icrs = async function () {
            const price = await contracts.priceFeedTestnet.get_price()
            console.log('alice ICR :' + MoneyValues.get(await contracts.troveManager.get_current_icr( aliceAddress, price )))
            console.log('bob   ICR :' + MoneyValues.get(await contracts.troveManager.get_current_icr( bobAddress, price )))
            console.log('carol ICR :' + MoneyValues.get(await contracts.troveManager.get_current_icr( CAddress, price )))
        }

        let deployToken = async function ( token , sdk ) {
            const { deployLiquityCore, deployLQTYContracts } = await setupDeployment( token, sdk )
            const contracts = await deployLiquityCore()

            // ;( {
            //     aeusdToken, borrowerOperations, troveManager, priceFeedTestnet: priceFeed,
            //     sortedTroves, activePool, defaultPool
            // } = contracts )

            const LQTYContracts = await deployLQTYContracts( bountyAddress, lpRewardsAddress, multisigAddress )

            const deployContract = utils.deployContract( contracts.sdk )

            timeOffsetForDebugger = wrapContractInstance(
                await deployContract( './test/contracts/TimeOffsetForDebug.aes', )
            )

            await contracts.troveManager.set_timestamp_offset_for_debug( timeOffsetForDebugger.address )
            await LQTYContracts.lqtyToken.set_timestamp_offset_for_debug( timeOffsetForDebugger.address )

            //connect contracts
            console.log( "connecting contracts AEEUR" )
            await connectCoreContracts( contracts, LQTYContracts )
            return {'contracts': contracts, 'lqty' :LQTYContracts }
        }
        
        utils.beforeEachWithSnapshot( 'deploy contract', async () => {
            sdk = await utils.createSdkInstance();
            const res = await deployToken( './contracts/AEUSDToken.aes' , sdk);
            contracts = res.contracts
            LQTYContracts = res.lqty
            const res2 = await deployToken( './contracts/AEEURToken.aes' , sdk );
            contracts2 = res2.contracts
            LQTYContracts2 = res2.lqty
            
            // ;({
            //     aeusdToken, borrowerOperations, troveManager, priceFeedTestnet: priceFeed,
            //     sortedTroves, activePool, defaultPool
            // } = contracts)
            
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


        it( "demo eur: open three troves and liquidate one", async () => {
            const carol = C
            const carolAddress = CAddress
            const ted = A
            const tedAddress = AAddress

            console.log('stable token                        : ' + contracts.aeusdToken.meta_info())
            console.log('ae initial price                    : ' + MoneyValues.get(await contracts.priceFeedTestnet.get_price()))
            assert.isFalse( await contracts.troveManager.check_recovery_mode( await contracts.priceFeedTestnet.get_price()))
            console.log('min debt + 1 :' + MoneyValues.get(await testHelper.getNetBorrowingAmount( contracts, await contracts.borrowerOperations.min_net_debt() + 1n)))

            await poolsState( contracts ,LQTYContracts )

            await poolsState( contracts2, LQTYContracts2 )

            const aliceAE = await contracts.sdk.getBalance( aliceAddress )
            const { collateral: aliceCollBefore, totalDebt: aliceDebtBefore } = await openTrove( { extraAEUSDAmount: dec( 15000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: alice } } )
            console.log('alice opens a torve ===============================================================================')
            console.log('alice opens a tove with collateral  : ' + MoneyValues.get(aliceCollBefore) + ' and debt: ' + MoneyValues.get(aliceDebtBefore) + ' and ICR: 2')
            console.log('alice spent ae                      : ' + MoneyValues.get((aliceAE - await contracts.sdk.getBalance( aliceAddress ))))
            console.log('alice received AEUSD token          : ' + MoneyValues.get(await contracts.aeusdToken.balance (aliceAddress)))
            console.log('alice  AEEUR token          : ' + MoneyValues.get(await contracts2.aeusdToken.balance (aliceAddress)))            

            await poolsState( contracts ,LQTYContracts )

            await poolsState( contracts2, LQTYContracts2 )

            const activePool_AE_Before = await contracts2.activePool.get_ae()
            const activePool_Rawae_Before = await contracts2.sdk.getBalance( contracts2.activePool.accountAddress )
            assert.equal(activePool_AE_Before, activePool_Rawae_Before )

            const { collateral: bobCollBefore, totalDebt: bobDebtBefore } = await openTrove2( { extraAEUSDAmount: dec( 10000, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: bob } } )
            console.log('bob opens a torve ===============================================================================')
            console.log('bob opens a tove with collateral    : ' + MoneyValues.get(bobCollBefore) + ' and debt: ' + MoneyValues.get(bobDebtBefore)+ ' and ICR:2')
            console.log('bob AEUSD token            : ' + MoneyValues.get(await contracts.aeusdToken.balance (bobAddress)))
            console.log('bob received AEEUR token            : ' + MoneyValues.get(await contracts2.aeusdToken.balance (bobAddress)))            

            await poolsState( contracts ,LQTYContracts )

            await poolsState( contracts2, LQTYContracts2 )


        } )
    } )
} )
