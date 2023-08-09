
const { createSdkInstance,  deployContract } = require( '../utils/contract-utils' );

async function deployPriceFeedTestnet() {
    const sdk = await createSdkInstance();
    const priceFeed = await deployContract(sdk,false,true)('./test/contracts/PriceFeedTestnet.aes');

    console.log('price feed address:', priceFeed.deployInfo.address);    
    process.env.CONTRACT_ADDRESS = priceFeed.deployInfo.address;
}

deployPriceFeedTestnet();
