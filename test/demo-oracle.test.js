const { assert, expect } = require( 'chai' );
const { fork } = require('child_process');

import utils from '../utils/contract-utils'
import { wrapContractInstance } from '../utils/wrapper'
import { setupDeployment, connectCoreContracts  } from './shared/deploymentHelper'
import {
    testHelper, timeValues, expectToRevert, withFee, MoneyValues
} from './shared/testHelper'
import { initPriceService } from '../price-service/price-service.js'

const { dec, getDifference, assertRevert } = testHelper

import wallets from '../config/wallets.json'
const accounts = wallets.defaultWallets.map( x => x.publicKey )

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe( 'Demo using oracle', () => {

    describe( 'Demo use case using oracle ...', () => {
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

        var child;

        utils.beforeAfterEachWithSnapshot( 'deploy contract', async () => {
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

            console.log('price feed address:', contracts.priceFeedTestnet.address);    
            process.env.CONTRACT_ADDRESS = contracts.priceFeedTestnet.address;

            // oracle installing and pooling service
            child = fork("./price-service/price-service.js", []);
            
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
        }, async () => {
            process.kill(child.pid)
        } )


        it( "demo oracle: open three troves and liquidate one", async () => {
            await sleep(10000);
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
            // await contracts.priceFeedTestnet.set_price( '100000000000000000000' )
        } )

    } )
} )
