const { assert, expect } = require( 'chai' )

import utils from '../utils/contract-utils'
import { deployContract  } from './shared/deploymentHelper'

import wallets from '../config/wallets.json'
const accounts = wallets.defaultWallets.map( x => x.publicKey )

describe( 'Demo reentrant calls', () => {

    describe( 'Demo use case ...', () => {
        let a;
        let b;
        
        utils.beforeEachWithSnapshot( 'deploy contract', async () => {
            const sdk = await utils.createSdkInstance();
            const deploy = deployContract( sdk );
            
            a = await deploy('./test/contracts/A.aes');
            b = await deploy('./test/contracts/B.aes');

            await b.set_addresses(a.address);
            await a.set_addresses(b.address);
        } )

        it( "reentrant call", async () => {
            console.log( "before counter: " + await a.counter() );
            await a.test_call_me();
            console.log( "after counter: " + await a.counter() );            
        } )

    } )
} )
