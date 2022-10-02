import utils from '../../utils/contract-utils'
import wrapper from '../../utils/wrapper'

const deployContract = ( sdk ) => async ( path, params ) =>
    wrapper.wrapContractInstance(
        await ( utils.deployContract( sdk, false, true ) )( path, params )
    )
//const ZERO_ADDRESS = '0x' + '0'.repeat( 40 )
const maxBytes32 = BigInt( '0x' + 'f'.repeat( 64 ) )

const withLoggingAddresses = ( ret ) => {
    console.log( Object.keys( ret ).reduce( ( acc, key ) => {
        const obj = ret[key]
        if ( typeof obj.address === 'string'  ) {
            const cloned = { ...acc }
            cloned[key] = obj.address
            return cloned
        } else acc
    }, {} ) )
    return ret
}
const setupDeployment = async () => {
    const sdk = await utils.createSdkInstance()
    const deploy = deployContract( sdk )
    const troveManager = await deploy( './contracts/TroveManager.aes' )
    const stabilityPool = await deploy( './contracts/StabilityPool.aes' )
    const borrowerOperations = await deploy( './contracts/BorrowerOperations.aes' )

    const communityIssuance = await deploy( './contracts/lqty/CommunityIssuance.aes' )
    const lqtyStaking = await deploy( './contracts/lqty/LQTYStaking.aes' )
    const lockupContractFactory = await deploy( './contracts/lqty/LockupContractFactory.aes' )

    return {
        deployLiquityCore: async () => {
            return withLoggingAddresses( {
                sdk,
                priceFeedTestnet   : await deploy( './test/contracts/PriceFeedTestnet.aes' ),
                sortedTroves       : await deploy( './contracts/SortedTroves.aes' ),
                troveManager       : troveManager,
                collSurplusPool    : await deploy( './contracts/CollSurplusPool.aes' ),
                borrowerOperations : borrowerOperations,
                activePool         : await deploy( './contracts/ActivePool.aes' ),
                defaultPool        : await deploy( './contracts/DefaultPool.aes' ),
                stabilityPool      : stabilityPool,
                gasPool            : await deploy( './contracts/GasPool.aes' ),
                aeusdToken         : await deploy( './contracts/AEUSDToken.aes', [ troveManager.address, stabilityPool.address, borrowerOperations.address ] ),

                //const functionCaller = await FunctionCaller.new()
                //const hintHelpers = await HintHelpers.new()
            } )
        },

        deployLQTYContracts: async ( bountyAddress, lpRewardsAddress, multisigAddress ) => {
            return withLoggingAddresses( {
                lqtyStaking,
                lockupContractFactory,
                communityIssuance,
                lqtyToken: await deploy( './contracts/lqty/LQTYToken.aes', [
                    communityIssuance.address,
                    lqtyStaking.address,
                    lockupContractFactory.address,
                    bountyAddress,
                    lpRewardsAddress,
                    multisigAddress
                ] ),
            } )
        }
    }
}
const connectCoreContracts = async ( contracts, LQTYContracts ) => {

    // interlink necessarily contracts
    await contracts.sortedTroves.set_params(
        maxBytes32,
        contracts.troveManager.address,
        contracts.borrowerOperations.address
    )

    await contracts.troveManager.set_addresses( {
        borrower_operations : contracts.borrowerOperations.address,
        stability_pool      : contracts.stabilityPool.address,
        gas_pool            : contracts.gasPool.accountAddress,
        coll_surplus_pool   : contracts.collSurplusPool.address,
        aeusd_token         : contracts.aeusdToken.address,
        sorted_troves       : contracts.sortedTroves.address,
        default_pool        : contracts.defaultPool.address,
        active_pool         : contracts.activePool.address,
        price_feed          : contracts.priceFeedTestnet.address,
        lqty_token          : LQTYContracts.lqtyToken.address,
        lqty_staking        : LQTYContracts.lqtyStaking.address
    } )
    //
    await contracts.borrowerOperations.set_addresses( {
        trove_manager     : contracts.troveManager.address,
        stability_pool    : contracts.stabilityPool.address,
        default_pool      : contracts.defaultPool.address,
        coll_surplus_pool : contracts.collSurplusPool.address,
        lqty_staking      : LQTYContracts.lqtyStaking.address,
        aeusd_token       : contracts.aeusdToken.address,
        sorted_troves     : contracts.sortedTroves.address,
        active_pool       : contracts.activePool.address,
        price_feed        : contracts.priceFeedTestnet.address,
        gas_pool          : contracts.gasPool.accountAddress,
    }
    )

    await contracts.defaultPool.set_addresses( {
        trove_manager : contracts.troveManager.address,
        active_pool   : contracts.activePool.address,
    } )

    await contracts.activePool.set_addresses( {
        borrower_operations : contracts.borrowerOperations.address,
        trove_manager       : contracts.troveManager.address,
        stability_pool      : contracts.stabilityPool.address,
        default_pool        : contracts.defaultPool.address,
    } )

    await contracts.collSurplusPool.set_addresses( {
        borrower_operations : contracts.borrowerOperations.address,
        trove_manager       : contracts.troveManager.address,
        active_pool         : contracts.activePool.address,
    } )

    await contracts.stabilityPool.set_addresses( {
        borrower_operations : contracts.borrowerOperations.address,
        trove_manager       : contracts.troveManager.address,
        aeusd_token         : contracts.aeusdToken.address,
        sorted_troves       : contracts.sortedTroves.address,
        community_issuance  : LQTYContracts.communityIssuance.address,
        active_pool         : contracts.activePool.address,
        default_pool        : contracts.defaultPool.address,
        price_feed          : contracts.priceFeedTestnet.address,
    } )

    await LQTYContracts.lqtyStaking.set_addresses( {
        lqty_token          : LQTYContracts.lqtyToken.address,
        aeusd_token         : contracts.aeusdToken.address,
        trove_manager       : contracts.troveManager.address,
        borrower_operations : contracts.borrowerOperations.address,
        active_pool         : contracts.activePool.address,
    } )

    //TODO: uncomment this after solving the problem with :
    //"CommunityIssuance: When LQTYToken deployed, it should have transferred CommunityIssuance's LQTY entitlement"
    //await LQTYContracts.communityIssuance.set_addresses( {
    //lqty_token     : LQTYContracts.lqtyToken.address,
    //stability_pool : contracts.stabilityPool.address,
    //} )

}

module.exports = {
    setupDeployment,
    connectCoreContracts,
}
