const { assert, expect } = require( 'chai' )

import utils from '../utils/contract-utils'
import { wrapContractInstance } from '../utils/wrapper'
import { setupDeployment, connectCoreContracts  } from './shared/deploymentHelper'
import { testHelper, expectToRevert } from './shared/testHelper'
const { dec } = testHelper

import wallets from '../config/wallets.json'
const accounts = wallets.defaultWallets.map( x => x.publicKey )

const [ 
    denisAddress,
    erinAddress,
    whaleAddress,
    DAddress,
    carolAddress,
    bobAddress,
    aliceAddress,
    bountyAddress,
    lpRewardsAddress,
    multisigAddress ] = accounts.slice( accounts.length - 10, accounts.length )

let bob
let alice
let whale
let carol
let A
let B
let C
let D
let E

const AAddress = denisAddress
const BAddress = erinAddress
const CAddress = carolAddress
const EAddress = bobAddress
describe( 'SortedTroves Tests', () => {
    describe( 'SortedTroves', () => {
        let contracts
        let LQTYContracts
        const openTrove = async ( params ) => testHelper.openTrove( contracts, params )
        const getTrove = ( address ) => contracts.troveManager.troves( address )

        utils.beforeEachWithSnapshot( 'deploy contract', async () => {
            const { deployLiquityCore, deployLQTYContracts } = await setupDeployment()
            contracts = await deployLiquityCore()
            LQTYContracts = await deployLQTYContracts( bountyAddress, lpRewardsAddress, multisigAddress )

            console.log( "connecting contracts" )
            await connectCoreContracts( contracts, LQTYContracts )

            bob = contracts.sdk.accounts[bobAddress]
            alice = contracts.sdk.accounts[aliceAddress]
            whale = contracts.sdk.accounts[whaleAddress]
            D = contracts.sdk.accounts[DAddress]
            carol = contracts.sdk.accounts[carolAddress]

            A = contracts.sdk.accounts[AAddress]
            B = contracts.sdk.accounts[BAddress]
            C = contracts.sdk.accounts[CAddress]
            D = contracts.sdk.accounts[DAddress]
            E = contracts.sdk.accounts[EAddress]

        } )
        it( 'contains(): returns true for addresses that have opened troves', async () => {
            await openTrove( { ICR: dec( 150, 16 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 20, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { ICR: dec( 2000, 18 ), extraParams: { onAccount: carol } } )

            // Confirm trove statuses became active
            expect( ( await getTrove( aliceAddress ) ).status ).to.have.all.keys( 'Active' )
            expect( ( await getTrove( bobAddress ) ).status ).to.have.all.keys( 'Active' )
            expect( ( await getTrove( carolAddress ) ).status ).to.have.all.keys( 'Active' )

            // Check sorted list contains troves
            assert.isTrue( await contracts.sortedTroves.contains( aliceAddress ) )
            assert.isTrue( await contracts.sortedTroves.contains( bobAddress ) )
            assert.isTrue( await contracts.sortedTroves.contains( carolAddress ) )

        } )

        it( 'contains(): returns false for addresses that have not opened troves', async () => {
            await openTrove( { ICR: dec( 150, 16 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 20, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { ICR: dec( 2000, 18 ), extraParams: { onAccount: carol } } )

            // Confirm troves have non-existent status

            // Confirm troves have non-existent status
            expect( ( await getTrove( denisAddress ) ) ).equal( undefined )
            expect( ( await getTrove( erinAddress ) ) ).equal( undefined )

            // Check sorted list do not contain troves
            assert.isFalse( await contracts.sortedTroves.contains( denisAddress ) )
            assert.isFalse( await contracts.sortedTroves.contains( erinAddress ) )
        } )

        it( 'contains(): returns false for addresses that opened and then closed a trove', async () => {
            await openTrove( { ICR: dec( 1000, 18 ), extraLUSDAmount: dec( 3000, 18 ), extraParams: { onAccount: whale } } )

            await openTrove( { ICR: dec( 150, 16 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 20, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { ICR: dec( 2000, 18 ), extraParams: { onAccount: carol } } )

            // to compensate borrowing fees
            await contracts.aeusdToken.transfer( aliceAddress, dec( 1000, 18 ), { onAccount: whale } )
            await contracts.aeusdToken.transfer( bobAddress, dec( 1000, 18 ), { onAccount: whale } )
            await contracts.aeusdToken.transfer( carolAddress, dec( 1000, 18 ), { onAccount: whale } )

            // A, B, C close troves
            await contracts.borrowerOperations.close_trove( { onAccount: alice } )
            await contracts.borrowerOperations.close_trove( { onAccount: bob } )
            await contracts.borrowerOperations.close_trove( { onAccount: carol } )

            // Confirm trove statuses became closed

            expect( ( await getTrove( aliceAddress ) ).status ).to.have.all.keys( 'ClosedByOwner' )
            expect( ( await getTrove( bobAddress ) ).status ).to.have.all.keys( 'ClosedByOwner' )
            expect( ( await getTrove( carolAddress ) ).status ).to.have.all.keys( 'ClosedByOwner' )

            // Check sorted list does not contain troves
            assert.isFalse( await contracts.sortedTroves.contains( aliceAddress ) )
            assert.isFalse( await contracts.sortedTroves.contains( bobAddress ) )
            assert.isFalse( await contracts.sortedTroves.contains( carolAddress ) )
        } )
        //
        // true for addresses that opened -> closed -> opened a trove
        it( 'contains(): returns true for addresses that opened, closed and then re-opened a trove', async () => {
            await openTrove( { ICR: dec( 1000, 18 ), extraLUSDAmount: dec( 3000, 18 ), extraParams: { onAccount: whale } } )

            await openTrove( { ICR: dec( 150, 16 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 20, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { ICR: dec( 2000, 18 ), extraParams: { onAccount: carol } } )

            // to compensate borrowing fees
            await contracts.aeusdToken.transfer( aliceAddress, dec( 1000, 18 ), { onAccount: whale } )
            await contracts.aeusdToken.transfer( bobAddress, dec( 1000, 18 ), { onAccount: whale } )
            await contracts.aeusdToken.transfer( carolAddress, dec( 1000, 18 ), { onAccount: whale } )

            // A, B, C close troves
            await contracts.borrowerOperations.close_trove( { onAccount: alice } )
            await contracts.borrowerOperations.close_trove( { onAccount: bob } )
            await contracts.borrowerOperations.close_trove( { onAccount: carol } )

            // Confirm trove statuses became closed
            expect( ( await getTrove( aliceAddress ) ).status ).to.have.all.keys( 'ClosedByOwner' )
            expect( ( await getTrove( bobAddress ) ).status ).to.have.all.keys( 'ClosedByOwner' )
            expect( ( await getTrove( carolAddress ) ).status ).to.have.all.keys( 'ClosedByOwner' )

            await openTrove( { ICR: dec( 1000, 16 ), extraParams: { onAccount: alice } } )
            await openTrove( { ICR: dec( 2000, 18 ), extraParams: { onAccount: bob } } )
            await openTrove( { ICR: dec( 3000, 18 ), extraParams: { onAccount: carol } } )

            // Confirm trove statuses became open again
            expect( ( await getTrove( aliceAddress ) ).status ).to.have.all.keys( 'Active' )
            expect( ( await getTrove( bobAddress ) ).status ).to.have.all.keys( 'Active' )
            expect( ( await getTrove( carolAddress ) ).status ).to.have.all.keys( 'Active' )

            // Check sorted list does  contain troves
            assert.isTrue( await contracts.sortedTroves.contains( aliceAddress ) )
            assert.isTrue( await contracts.sortedTroves.contains( bobAddress ) )
            assert.isTrue( await contracts.sortedTroves.contains( carolAddress ) )
        } )
        // false when list size is 0
        it( 'contains(): returns false when there are no troves in the system', async () => {
            assert.isFalse( await contracts.sortedTroves.contains( aliceAddress ) )
            assert.isFalse( await contracts.sortedTroves.contains( bobAddress ) )
            assert.isFalse( await contracts.sortedTroves.contains( carolAddress ) )
        } )
        // true when list size is 1 and the trove the only one in system
        it( 'contains(): true when list size is 1 and the trove the only one in system', async () => {
            await openTrove( { ICR: dec( 150, 16 ), extraParams: { onAccount: alice } } )

            assert.isTrue( await contracts.sortedTroves.contains( aliceAddress ) )
        } )

        // false when list size is 1 and trove is not in the system
        it( 'contains(): false when list size is 1 and trove is not in the system', async () => {
            await openTrove( { ICR: dec( 150, 16 ), extraParams: { onAccount: alice } } )

            assert.isFalse( await contracts.sortedTroves.contains( bobAddress ) )
        } )
        // --- getMaxSize ---

        it.skip( "TODO: getMaxSize(): Returns the maximum list size", async () => {
            //const max = await sortedTroves.getMaxSize()
            //assert.equal( web3.utils.toHex( max ), th.maxBytes32 )
        } )
        // --- findInsertPosition ---

        it( "Finds the correct insert position given two addresses that loosely bound the correct position", async () => {
            await contracts.priceFeedTestnet.set_price( testHelper.dec( 100, 18 ) )

            // NICR sorted in descending order
            await openTrove( { ICR: dec( 500, 18 ), extraParams: { onAccount: whale } } )
            await openTrove( { ICR: dec( 10, 18 ), extraParams: { onAccount: A } } )
            await openTrove( { ICR: dec( 5, 18 ), extraParams: { onAccount: B } } )
            await openTrove( { ICR: dec( 250, 16 ), extraParams: { onAccount: C } } )
            await openTrove( { ICR: dec( 166, 16 ), extraParams: { onAccount: D } } )
            await openTrove( { ICR: dec( 125, 16 ), extraParams: { onAccount: E } } )

            // Expect a trove with NICR 300% to be inserted between B and C
            const targetNICR = dec( 3, 18 )

            // Pass addresses that loosely bound the right postiion
            let hints = await contracts.sortedTroves.find_insert_position( targetNICR, AAddress, EAddress )

            // Expect the exact correct insert hints have been returned
            assert.equal( hints[0], BAddress )
            assert.equal( hints[1], CAddress )

            // The price doesn’t affect the hints
            await contracts.priceFeedTestnet.set_price( testHelper.dec( 500, 18 ) )
            hints = await contracts.sortedTroves.find_insert_position( targetNICR, AAddress, EAddress )

            // Expect the exact correct insert hints have been returned
            assert.equal( hints[0], BAddress )
            assert.equal( hints[1], CAddress )
        } )
    } )
    describe( 'SortedTroves with mock dependencies', () => {
        let sortedTrovesTester
        let sortedTroves
        let trovesManagerAddress
        const commonDeploy = async () => {
            const sdk = await utils.createSdkInstance()
            const deployContract = utils.deployContract( sdk )

            sortedTroves = wrapContractInstance(
                await deployContract( './contracts/SortedTroves.aes', [] )
            )

            sortedTrovesTester = wrapContractInstance(
                await deployContract( './test/contracts/SortedTroves.tester.aes', [ sortedTroves.address ] )
            )
            trovesManagerAddress = await sortedTrovesTester.get_troves_manager()
            bob = sdk.accounts[bobAddress]
            alice = sdk.accounts[aliceAddress]
            carol = sdk.accounts[carolAddress]
        }

        describe( 'when params are wrongly set', () => {
            before( commonDeploy )
            it( 'setParams(): reverts if size is zero', async () => {
                await expectToRevert(
                    () => sortedTroves.set_params( 0, trovesManagerAddress, sortedTrovesTester.address ),
                    "SortedTroves: Size can’t be zero"
                )
            } )
        } )
        describe( 'when params are properly set', () => {
            utils.beforeEachWithSnapshot( 'set params', async() => {
                await commonDeploy()
            } )
            beforeEach( async () => {
                await sortedTroves.set_params( 2, trovesManagerAddress, sortedTrovesTester.address )
            } )
            it( 'insert(): fails if list is full', async () => {
                await sortedTrovesTester.insert( aliceAddress, 1, aliceAddress, aliceAddress )
                await sortedTrovesTester.insert( bobAddress, 1, aliceAddress, aliceAddress )
                await expectToRevert(
                    () => sortedTrovesTester.insert( carolAddress, 1, aliceAddress, aliceAddress ),
                    'SortedTroves: List is full' 
                )
            } )
            it( 'insert(): fails if list already contains the node', async () => {
                await sortedTrovesTester.insert( aliceAddress, 1, aliceAddress, aliceAddress )
                await expectToRevert(
                    () => sortedTrovesTester.insert( aliceAddress, 1, aliceAddress, aliceAddress )
                    , 'SortedTroves: List already contains the node' 
                )
            } )
            it( 'remove(): fails if id is not in the list', async () => {
                await expectToRevert(
                    () => sortedTrovesTester.remove( aliceAddress ),
                    'SortedTroves: List does not contain the id' 
                )
            } )
            it( 'reInsert(): fails if list doesn’t contain the node', async () => {
                await expectToRevert(
                    () => sortedTrovesTester.re_insert( aliceAddress, 1, aliceAddress, aliceAddress ),
                    'SortedTroves: List does not contain the id' 
                )
            } )
            it( 'reInsert(): fails if new NICR is zero', async () => {
                await sortedTrovesTester.insert( aliceAddress, 1, aliceAddress, aliceAddress )
                assert.isTrue( await sortedTroves.contains( aliceAddress ), 'list should contain element' )
                await expectToRevert(
                    () => sortedTrovesTester.re_insert( aliceAddress, 0, aliceAddress, aliceAddress ),
                    'SortedTroves: NICR must be positive' 
                )
                assert.isTrue( await sortedTroves.contains( aliceAddress ), 'list should contain element' )
            } )

            it( 'findInsertPosition(): No prevId for hint - ascend list starting from nextId, result is after the tail', async () => {
                await sortedTrovesTester.insert( aliceAddress, 1, aliceAddress, aliceAddress )
                const pos = await sortedTroves.find_insert_position( 1, undefined, aliceAddress )
                assert.equal( pos[0], aliceAddress, 'prevId result should be nextId param' )
                assert.equal( pos[1], undefined, 'nextId result should be zero' )
            } )
        } )

    } )
} )
