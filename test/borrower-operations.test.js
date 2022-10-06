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
    describe( 'troveManager', () => {
        let troveManagerTester
        let contracts
        let LQTYContracts
        let timeOffsetForDebugger
        let borrowerOperationsTester
        const fastForwardTime = ( seconds ) => timeOffsetForDebugger.fast_forward_time(
            BigInt( seconds ) * 1000n
        )

        const [ bob, alice, bountyAddress, lpRewardsAddress, multisig ] = accounts.slice( accounts.length - 5, accounts.length )

        utils.beforeEachWithSnapshot( 'deploy contract', async () => {
            const { deployLiquityCore, deployLQTYContracts } = await setupDeployment()
            contracts = await deployLiquityCore()
            LQTYContracts = await deployLQTYContracts( bountyAddress, lpRewardsAddress, multisig )
            troveManagerTester = contracts.troveManager
            borrowerOperationsTester = contracts.borrowerOperations

            const deployContract = utils.deployContract( contracts.sdk )

            timeOffsetForDebugger = wrapContractInstance(
                await deployContract( './test/contracts/TimeOffsetForDebug.aes', )
            )

            //connect contracts
            console.log( "connecting contracts" )
            await connectCoreContracts( contracts, LQTYContracts )

        } )

        it( "Open trove", async () => {
            const name = await borrowerOperationsTester.name()
            //const sortedTroves = await borrowerOperationsTester.sorted_troves()
            const theAccount = contracts.sdk.accounts[bob]
            await borrowerOperationsTester.open_trove(
                5000000000000000,
                1800000000000000000000,
                bountyAddress,
                bountyAddress,
                { onAccount: theAccount, amount: 500000000000 }
            )

            await borrowerOperationsTester.add_coll( bountyAddress, bountyAddress, { onAccount: theAccount, amount: 500000000000 } )

            expect( name ).to.eq( 'BorrowerOperations' )
        } )

        // it( "Add collateral trove", async () => {
        //     const name = await borrowerOperationsTester.name()

        //     expect( name ).to.eq( 'BorrowerOperations' )
        // } )

    } )
} )
