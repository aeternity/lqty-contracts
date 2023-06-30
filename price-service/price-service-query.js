
const { createSdkInstance, getFilesystem, getContractContent, deployContract } = require( '../utils/contract-utils' );
const { MoneyValues } = require('../test/shared/testHelper');

const PriceFeedOracle = require('ae-oracle-pricefeed/src/operator/priceFeedOracle');
const Decimal = require( "decimal.js" );
const { NETWORKS } = require( '../config/network.js' );
const wallets = require( '../config/wallets.json' );

const DEFAULT_NETWORK_NAME = process.env.DEFAULT_NETWORK_NAME || 'local';
const AWAIT_TIMEOUT_SECONDS = process.env.AWAIT_TIMEOUT_SECONDS  || 10;

var priceFeedContract;
var priceFeedOracle;

// deploys oracle, get PriceFeedTestnet already running instance
async function setup( ) {
    const sdk = await createSdkInstance();

    priceFeedOracle = new PriceFeedOracle();
    process.env.NODE_URL = NETWORKS[DEFAULT_NETWORK_NAME]['nodeUrl'];

    await priceFeedOracle.init(wallets.defaultWallets[0]);
    await priceFeedOracle.register();
    await priceFeedOracle.startPolling();

    console.log("Oracle id", priceFeedOracle.oracle.id);

    priceFeedContract = await deployContract(sdk,false,true)('./test/contracts/PriceFeedOracleTestnet.aes', [priceFeedOracle.oracle.id]);
}

async function setPrice( query ) {
    await priceFeedContract.methods.set_price_oracle( query );
    console.log( 'Done' );
}

async function getPrice( ) {
    const price = await priceFeedContract.methods.get_price(  );
    console.log("Current price USD/AE :", MoneyValues.get(price.decodedResult).toString());    
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
        await setPrice( query.id );
    } catch ( error ) {
        console.error( 'Error updating price:', error );
    }
}

async function main() {
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
        await getPrice();        
    }
}

main();

