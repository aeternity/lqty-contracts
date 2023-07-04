
const { createSdkInstance, getFilesystem, getContractContent, deployContract } = require( '../utils/contract-utils' );

const PriceFeedOracle = require('ae-oracle-pricefeed/src/operator/priceFeedOracle');
const Decimal = require( "decimal.js" );
const { NETWORKS } = require( '../config/network.js' );

const DEFAULT_NETWORK_NAME = process.env.DEFAULT_NETWORK_NAME || 'local';
var CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const AWAIT_TIMEOUT_SECONDS = process.env.AWAIT_TIMEOUT_SECONDS  || 10;
const WALLET_FILE = process.env.WALLET  || '../config/wallet-price-feed.json';

const wallet = require(WALLET_FILE);

var priceFeedContract;
var priceFeedOracle;

async function deployPriceFeedTestnet() {
    const sdk = await createSdkInstance();
    const priceFeed = await deployContract(sdk,false,true)('./test/contracts/PriceFeedTestnet.aes');

    console.log('price feed address:', priceFeed.deployInfo.address);    
    process.env.CONTRACT_ADDRESS = priceFeed.deployInfo.address;
}

// deploys oracle, get PriceFeedTestnet already running instance
async function setup() {
    const sdk = await createSdkInstance();
    const file = './test/contracts/PriceFeedTestnet.aes';

    const fileSystem = getFilesystem( file );
    const contract_content = getContractContent( file );
    
    priceFeedContract   = await sdk.getContractInstance( {
        source          : contract_content,
        fileSystem      : fileSystem,
        contractAddress : CONTRACT_ADDRESS,
        omitUnknown     : true
    } );

    priceFeedOracle = new PriceFeedOracle();
    process.env.NODE_URL = NETWORKS[DEFAULT_NETWORK_NAME]['nodeUrl'];

    await priceFeedOracle.init(wallet);
    await priceFeedOracle.register();
    await priceFeedOracle.startPolling();

    console.log("Oracle id", priceFeedOracle.oracle.id);
}

async function setPrice( price ) {
    console.log( `Setting price USD/AE:`, price );
    const priceAettos = BigInt( new Decimal( price ).mul( '1000000000000000000' ).toFixed( 0 ) );
    console.log( `Setting price USD/AE to ${CONTRACT_ADDRESS} (aettos):`, priceAettos, "..." );
    await priceFeedContract.methods.set_price( priceAettos );
    await getPrice();
}

async function getPrice( ) {
    const price = await priceFeedContract.methods.get_price(  );
    console.log( `Current price price feed contract USD/AE to ${CONTRACT_ADDRESS} (aettos):`, price.decodedResult , "..." );    
}

async function updatePrice() {
    try {
        // query price to oracle
        const query = await priceFeedOracle.oracle.postQuery('usd', {
            queryFee: priceFeedOracle.oracle.queryFee,
            // optionally specify ttl
            // queryTtl: {type: 'delta', value: 20},
            // responseTtl: {type: 'delta', value: 20},
        });

        const response = await query.pollForResponse();
        
        console.log( 'Current AE/USD price:', String(response.decode()) );

        // set price in price feed contract
        await setPrice( String(response.decode()) );
    } catch ( error ) {
        console.error( 'Error updating price:', error );
    }
}

async function initPriceService( ) {
    // await deployPriceFeedTestnet();
    var price;
    
    if ( CONTRACT_ADDRESS === undefined ) {
        throw new Error( 'CONTRACT_ADDRESS is not defined' );
    }
    console.log( 'CONTRACT_ADDRESS:', CONTRACT_ADDRESS );
    console.log( 'DEFAULT_NETWORK_NAME:', DEFAULT_NETWORK_NAME );
    console.log( 'AWAIT_TIMEOUT_SECONDS:', AWAIT_TIMEOUT_SECONDS );

    if ( !NETWORKS[DEFAULT_NETWORK_NAME] ) {
        throw new Error( `${DEFAULT_NETWORK_NAME} is not defined in network.js` );
    }

    await setup();

    while ( true ) {
        await updatePrice();
        // wait 10 seconds
        console.log( `Waiting ${AWAIT_TIMEOUT_SECONDS} seconds...` );
        await new Promise( ( resolve ) => setTimeout( resolve, AWAIT_TIMEOUT_SECONDS * 1000 ) );
    }
}

initPriceService();


