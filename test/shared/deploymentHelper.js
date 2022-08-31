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
    return {
        deployLiquityCore: async () => {
            return withLoggingAddresses( {
                sdk,
                priceFeedTestnet   : await deploy( './test/contracts/PriceFeedTestnet.aes' ),
                sortedTroves       : await deploy( './contracts/SortedTroves.aes' ),
                troveManager       : await deploy( './contracts/TroveManager.aes' ),
                collSurplusPool    : await deploy( './contracts/CollSurplusPool.aes' ),
                borrowerOperations : await deploy( './contracts/BorrowerOperations.aes' ),

                //TODO: dummy contracts , have to be replaced with the right ones
                activePool    : await deploy( './test/contracts/PlaceholderContract.aes' ),
                defaultPool   : await deploy( './test/contracts/PlaceholderContract.aes' ),
                stabilityPool : await deploy( './test/contracts/PlaceholderContract.aes' ),
                gasPool       : await deploy( './test/contracts/PlaceholderContract.aes' ),
                aeusdToken    : await deploy( './test/contracts/PlaceholderContract.aes' ),

                //const functionCaller = await FunctionCaller.new()
                //const hintHelpers = await HintHelpers.new()
                //const aeusdToken = await LUSDToken.new(
                //troveManager.address,
                //stabilityPool.address,
                //borrowerOperations.address
                //)
            } )
        },

        deployLQTYContracts: async ( bountyAddress, lpRewardsAddress, multisigAddress ) => {
            const sdk = await utils.createSdkInstance()
            const deploy = deployContract( sdk )
            return withLoggingAddresses( {
                lqtyStaking           : await deploy( './test/contracts/PlaceholderContract.aes' ),
                lockupContractFactory : await deploy( './test/contracts/PlaceholderContract.aes' ),
                communityIssuance     : await deploy( './test/contracts/PlaceholderContract.aes' ),
                lqtyToken             : await deploy( './test/contracts/PlaceholderContract.aes' ),
            } )
        }
    }
}
const connectCoreContracts = async ( contracts, LQTYContracts ) => {

    // set TroveManager addr in SortedTroves
    await contracts.sortedTroves.set_params(
        maxBytes32,
        contracts.troveManager.address,
        contracts.borrowerOperations.address
    )
    // set contracts in the Trove Manager
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
    // set contracts in BorrowerOperations
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
}

module.exports = {
    setupDeployment,
    connectCoreContracts,
}
