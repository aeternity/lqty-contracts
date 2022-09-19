/*
 * ISC License (ISC)
 * Copyright (c) 2018 aeternity developers
 *
 *  Permission to use, copy, modify, and/or distribute this software for any
 *  purpose with or without fee is hereby granted, provided that the above
 *  copyright notice and this permission notice appear in all copies.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 *  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 *  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 *  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 *  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 *  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 *  PERFORMANCE OF THIS SOFTWARE.
 */
require( 'dotenv-flow' ).config()
const { getAddressFromPriv  } = require( '@aeternity/aepp-sdk' )
const contractUtils = require( '../utils/contract-utils' )

const deploy = async ( secretKey, network, compiler ) => {
    if ( !secretKey ) {
        throw new Error( `Required option missing: secretKey` )
    }
    const wallet = {
        secretKey : secretKey,
        publicKey : getAddressFromPriv( secretKey )
    }
    const deployContract = contractUtils.deployContract(
        await contractUtils.createSdkInstance( {
            wallet, network, compiler
        } ),
        true,
        true //WARNING: this should be set to false when deploy to PRODUCTION
    )

    const fakeAddressCt = 'ct_A8WVnCuJ7t1DjAJf4y8hJrAEVpt1T9ypG3nNBdbpKmpthGvUm'
    const fakeAddress   = 'ak_A8WVnCuJ7t1DjAJf4y8hJrAEVpt1T9ypG3nNBdbpKmpthGvUm'    

    const deployContract = async ( file, params, interfaceName ) =>
        deployContract_( { file }, params, interfaceName )

    const deployments =
        [
            /* 00 */ () => deployContract( './contracts/BuildAll.aes',
                [],
            ),
            /* 01 */ () => deployContract( './contracts/BorrowerOperations.aes',
                [],
            ),
            /* 02 */ () => deployContract( './contracts/ActivePool.aes',
                [],
            ),
            /* 03 */ () => deployContract( './contracts/SortedTroves.aes',
                [],
            ),
            /* 04 */ () => deployContract( './contracts/TroveManager.aes',
                [],
	    ),
            /* 05 */ () => deployContract( './contracts/lqty/CommunityIssuance.aes',
                [],
            ),
            /* 06 */ () => deployContract( './contracts/lqty/LQTYToken.aes',
                [fakeAddressCt, fakeAddressCt, fakeAddressCt, fakeAddress, fakeAddress, fakeAddress],
	    ),
            /* 07 */ () => deployContract( './contracts/lqty/LQTYStaking.aes',
                [],
            ),
            /* 08 */ () => deployContract( './contracts/lqty/LockupContractFactory.aes',
                [],
	    ),
            /* 09 */ () => deployContract( './contracts/lqty/LockupContract.aes',
  	        [0, fakeAddressCt, fakeAddress],
            ),
            /* 10 */ () => deployContract( './test/contracts/PriceFeedTestnet.aes',
                [],
            ),
            /* 11 */ () => deployContract( './test/contracts/LiquityMathTester.aes',
                [],
            ),
            /* 12 */ () => deployContract( './test/contracts/TimeOffsetForDebug.aes',
                [],
            ),
            /* 13 */ () => deployContract( './contracts/CollSurplusPool.aes',
                [],
            ),
            /* 14 */ () => deployContract( './contracts/AEUSDToken.aes',
                [ fakeAddress, fakeAddress, fakeAddress ],
            ),
            /* 15 */ () => deployContract( './contracts/DefaultPool.aes',
                [],
            ),
            /* 16 */ () => deployContract( './contracts/AEUSDToken.aes',
                [ fakeAddress, fakeAddress, fakeAddress ],
            )
        ]
    //for ( const dep of deployments ) { await dep() }
    await deployments[6]()
}

module.exports = {
    deploy,
}
