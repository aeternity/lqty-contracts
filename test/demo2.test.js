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
            console.log('LQTY stacking  AEUSD balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )))
            console.log('LQTY stacking  LQTY  balance : ' + MoneyValues.get(await await LQTYContracts.lqtyToken.balance( LQTYContracts.lqtyStaking.accountAddress )))
        }

        let icrs = async function () {
            const price = await contracts.priceFeedTestnet.get_price()
            console.log('alice ICR :' + MoneyValues.get(await contracts.troveManager.get_current_icr( DAddress, price )))
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


        // 
        it( "demo 2: LQTY token example; LQTYStaking receives ETH fees from redemptions, and LUSD fees from new debt issuance.", async () => {
            // time fast-forwards 1 year, and multisig stakes 1 LQTY
            await fastForwardTime( timeValues.SECONDS_IN_ONE_YEAR )
            console.log('ted LQTY token balance : ' + MoneyValues.get(await LQTYContracts.lqtyToken.balance( multisigAddress )))
            console.log('ted AE         balance : ' + MoneyValues.get((await contracts.sdk.getBalance( multisigAddress ))))
            await LQTYContracts.lqtyToken.create_allowance( LQTYContracts.lqtyStaking.accountAddress, dec( 1, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( dec( 1, 18 ), { onAccount: multisig } )
            console.log('ted stakes one LQTY ===============================================================================')
            console.log('ted LQTY token balance : ' + MoneyValues.get(await LQTYContracts.lqtyToken.balance( multisigAddress )))
            console.log('ted AEUSD token balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( multisigAddress )))
            console.log('ted AE         balance : ' + MoneyValues.get((await contracts.sdk.getBalance( multisigAddress ))))

            // Check LQTY AEUSD balance before == 0
            const lqtyStaking_AEUSDBalance_Before = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.equal( lqtyStaking_AEUSDBalance_Before, undefined )
            await poolsState()

            console.log('alice opens a trove')
            const aliceAE = await contracts.sdk.getBalance( DAddress )
            const { collateral: aliceCollBefore, totalDebt: aliceDebtBefore } = await openTrove( { extraAEUSDAmount: dec( 50, 18 ), ICR: dec( 2, 18 ), extraParams: { onAccount: D } } )
            console.log('alice opens a torve ===============================================================================')
            console.log('alice opens a tove with collateral  : ' + MoneyValues.get(aliceCollBefore) + ' and debt: ' + MoneyValues.get(aliceDebtBefore) + ' and ICR: 2')
            console.log('alice spent ae                      : ' + MoneyValues.get((aliceAE - await contracts.sdk.getBalance( DAddress ))))
            console.log('alice received AEUSD token          : ' + MoneyValues.get(await contracts.aeusdToken.balance (DAddress)))

            await poolsState()

            //console.log('Make base rate 5%')
            // Artificially make baseRate 5%
            //await contracts.troveManager.set_base_rate( dec( 5, 16 ) )
            //await contracts.troveManager.set_last_fee_op_time_to_now()

            console.log('Base rate is : ' + MoneyValues.get(await contracts.troveManager.base_rate()))

            // 2 hours pass
            //await fastForwardTime( 7200 )

            // D withdraws AEUSD
            const aliceAEUSD2 = await contracts.aeusdToken.balance (DAddress)
            const aliceAE2 = await contracts.sdk.getBalance( DAddress )
            await contracts.borrowerOperations.withdraw_aeusd( testHelper._100pct, dec( 37, 18 ), DAddress, DAddress, { onAccount: D } )
            console.log('alice withdraws 37 aeusd at base rate 5% ===============================================================================')
            console.log('alice spent ae                      : ' + MoneyValues.get((aliceAE2 - await contracts.sdk.getBalance( DAddress ))))
            console.log('alice received AEUSD token          : ' + MoneyValues.get(await contracts.aeusdToken.balance (DAddress) - aliceAEUSD2))

            await icrs()
            await poolsState()

            // Check LQTY AEUSD balance after has increased
            const lqtyStaking_AEUSDBalance_After = await contracts.aeusdToken.balance( LQTYContracts.lqtyStaking.accountAddress )
            assert.isTrue( lqtyStaking_AEUSDBalance_After > 0 )

            console.log('ted stakes another one LQTY ===============================================================================')
            await LQTYContracts.lqtyToken.change_allowance( LQTYContracts.lqtyStaking.accountAddress, dec( 2, 18 ), { onAccount: multisig } )
            await LQTYContracts.lqtyStaking.stake( dec( 1, 18 ), { onAccount: multisig } )

            console.log('ted LQTY token balance : ' + MoneyValues.get(await LQTYContracts.lqtyToken.balance( multisigAddress )))
            console.log('ted AEUSD token balance : ' + MoneyValues.get(await contracts.aeusdToken.balance( multisigAddress )))
            console.log('ted AE         balance : ' + MoneyValues.get((await contracts.sdk.getBalance( multisigAddress ))))

            await poolsState()
        } )
        

    } )
} )
