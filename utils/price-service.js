require( 'dotenv-flow' ).config()
const { createSdkInstance, getFilesystem, getContractContent } = require( '../utils/contract-utils' )
const Decimal = require( "decimal.js" )
const { NETWORKS } = require( '../config/network.js' )
const axios = require( 'axios' )

async function getPrice() {
    try {
        const url = 'https://api.coingecko.com/api/v3/simple/price?ids=aeternity&vs_currencies=usd'
        console.log( 'Fetching AE/USD price from:', url, "..." )
        const response = await axios.get( url )
        const aePrice = response.data.aeternity.usd
        return aePrice
    } catch ( error ) {
        console.error( 'Error fetching AE/USD price:', error )
        throw error
    }
}

const DEFAULT_NETWORK_NAME = process.env.DEFAULT_NETWORK_NAME || 'local'
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS
const AWAIT_TIMEOUT_SECONDS = process.env.AWAIT_TIMEOUT_SECONDS  || 10
var contract
async function setup( ) {
    const sdk = await createSdkInstance()
    const file = './test/contracts/PriceFeedTestnet.aes'
    const fileSystem = getFilesystem( file )
    const contract_content = getContractContent( file )
    contract          = await sdk.getContractInstance( {
        source          : contract_content, fileSystem,
        contractAddress : CONTRACT_ADDRESS,
        omitUnknown     : true,
    } )
    const { decodedResult: initialPrice } = await contract.methods.get_price()

    const initialPriceAe = new Decimal( initialPrice.toString() ).div( '1000000000000000000' )

    console.log( "Initial USD/AE price is:", initialPriceAe )
}

async function setPriceContract( price ) {
    const priceAettos = BigInt( new Decimal( 1 ).div( price.toString() ).mul( '1000000000000000000' ).toFixed( 0 ) )
    console.log( `Setting price USD/AE to ${CONTRACT_ADDRESS} (aettos):`, priceAettos, "..." )
    await contract.methods.set_price( priceAettos )
    console.log( 'Done' )
}

async function updatePrice() {
    try {
        const aePrice = await getPrice()
        console.log( 'Current AE/USD price:', aePrice )

        await setPriceContract( aePrice )
    } catch ( error ) {
        console.error( 'Error updating price:', error )
    }
}
async function main() {
    if ( CONTRACT_ADDRESS === undefined ) {
        throw new Error( 'CONTRACT_ADDRESS is not defined' )
    }
    console.log( 'CONTRACT_ADDRESS:', CONTRACT_ADDRESS )
    console.log( 'DEFAULT_NETWORK_NAME:', DEFAULT_NETWORK_NAME )
    console.log( 'AWAIT_TIMEOUT_SECONDS:', AWAIT_TIMEOUT_SECONDS )

    if ( !NETWORKS[DEFAULT_NETWORK_NAME] ) {
        throw new Error( `${DEFAULT_NETWORK_NAME} is not defined in network.js` )
    }

    await setup()
    // eslint-disable-next-line no-constant-condition
    while ( true ) {
        await updatePrice()
        // wait 10 seconds
        console.log( `Waiting ${AWAIT_TIMEOUT_SECONDS} seconds...` )
        await new Promise( ( resolve ) => setTimeout( resolve, AWAIT_TIMEOUT_SECONDS * 1000 ) )
    }
}

main()

