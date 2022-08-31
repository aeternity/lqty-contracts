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
        } ), true, true
    )

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
            /* 05 */ () => deployContract( './test/contracts/PriceFeedTestnet.aes',
                [],
            ),
            /* 06 */ () => deployContract( './test/contracts/LiquityMathTester.aes',
                [],
            ),
        ]
    //for ( const dep of deployments ) { await dep() }
    await deployments[4]()
}

module.exports = {
    deploy,
}
