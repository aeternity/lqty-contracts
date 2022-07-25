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
const { Universal, MemoryAccount, Node, Crypto } = require( '@aeternity/aepp-sdk' )
const contractUtils = require( '../utils/contract-utils' )
const fs = require( 'fs' )
require( 'dotenv' ).config()

const { NETWORKS } = require( '../config/network.js' )
const DEFAULT_NETWORK_NAME = 'local'

const deploy = async ( secretKey, network, compiler ) => {
    if ( !secretKey ) {
        throw new Error( `Required option missing: secretKey` )
    }
    const KEYPAIR = {
        secretKey : secretKey,
        publicKey : Crypto.getAddressFromPriv( secretKey )
    }
    const NETWORK_NAME = network ? network : DEFAULT_NETWORK_NAME

    const client = await Universal.compose( {
        deepProps: { Ae: { defaults: { interval: 10 } } }
    } )( {
        nodes: [
            {
                name     : NETWORK_NAME, instance : await Node( {
                    url           : NETWORKS[NETWORK_NAME].nodeUrl,
                    ignoreVersion : true
                } )
            },
        ],
        compilerUrl : compiler ? compiler : NETWORKS[NETWORK_NAME].compilerUrl,
        accounts    : [ MemoryAccount( { keypair: KEYPAIR } ) ],
        address     : KEYPAIR.publicKey
    } )
    // a filesystem object must be passed to the compiler if the contract uses custom includes

    const deployContract_ = async ( { source, file }, params, interfaceName ) => {
        try {
            console.log( '----------------------------------------------------------------------------------------------------' )
            console.log( `%cdeploying '${file}...'`, `color:green` )

            var filesystem, contract_content
            if ( file ) {
                filesystem       = contractUtils.getFilesystem( file )
                contract_content = contractUtils.getContractContent( file )
            } else {
                contract_content = source
            }

            const contract          = await client.getContractInstance( { source: contract_content, filesystem } )
            const deployment_result = await contract.deploy( params )
            console.log( deployment_result )
            console.log( '-------------------------------------  END  ---------------------------------------------------------' )

            if ( interfaceName ) {
                const parent = "./contracts/interfaces/for-export"
                if ( !fs.existsSync( parent ) ) {
                    fs.mkdirSync( parent )
                }
                fs.writeFileSync( parent + '/' + interfaceName, contract.interface, 'utf-8' )
                console.log( 'Interface generated at: ' + parent + "/" + interfaceName )
            }
            return { deployment_result, contract }
        } catch ( ex ) {
            console.log( ex )
            if ( ex.response && ex.response.text ) {
                console.log( JSON.parse( ex.response.text ) )
            }
            throw ex
        }
    }
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
        ]
    try {
        //for ( const dep of deployments ) { await dep() }
        await deployments[4]()
    } catch ( ex ) {
        //empty
    }
}

module.exports = {
    deploy,
}
