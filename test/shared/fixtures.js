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
import { assert } from 'chai'
import crypto from 'crypto'
import axios from 'axios'

import {
    exec,
} from './utilities'

import { Universal, MemoryAccount, Node } from '@aeternity/aepp-sdk'

const { NETWORKS } = require( '../../config/network' )

import { defaultWallets as WALLETS } from '../../config/wallets.json'
import contractUtils from '../../utils/contract-utils'

const NETWORK_NAME = "local"

const hash = ( content ) =>
    crypto.createHash( 'md5' ).update( content ).digest( 'hex' )

const contents = {}

const getContent = ( { source, file } ) => {
    if ( file ) {
        if ( contents[file] ) {
            return contents[file]
        } else {
            const filesystem       = contractUtils.getFilesystem( file )
            const contract_content = contractUtils.getContractContent( file, true )
            const contentHash = hash( contract_content )

            const ret = {
                filesystem,
                contract_content,
                contentHash,
            }
            contents[file] = ret
            return ret
        }
    } else {
        return {
            filesystem       : undefined,
            contract_content : source,
        }
    }
}

const createClient = async ( wallet = WALLETS[0] ) => {
    const node = await Node( { url: NETWORKS[NETWORK_NAME].nodeUrl, ignoreVersion: true } )

    return await Universal.compose( {
        deepProps: { Ae: { defaults: { interval: 10 } } }
    } )( {
        nodes: [
            { name: NETWORK_NAME, instance: node },
        ],
        compilerUrl : NETWORKS[NETWORK_NAME].compilerUrl,
        accounts    : [ MemoryAccount( { keypair: wallet } ), MemoryAccount( { keypair: WALLETS[1] } )  ],
        address     : wallet.publicKey
    } )
}

const getContract = ( file, params, contractAddress, wallet = WALLETS[0] ) =>
    getContractEx( { file }, params, contractAddress, wallet )

const getContractEx = async ( { source, file, title }, params, contractAddress, wallet = WALLETS[0] ) => {

    const client = await createClient( wallet )
    try {
        const {
            filesystem,
            contract_content,
        } = getContent( { source, file } )

        const contract           = await client.getContractInstance(
            {
                source          : contract_content,
                filesystem,
                contractAddress : contractAddress || undefined,
                opt             : {
                    gas: 4500000
                }
            }
        )

        return {
            contract, deploy: async ( extra ) => {
                const deployment_result = await contract.deploy( params, extra )
                console.debug( `%c----> Contract deployed: '${file || title}...'`, `color:green` )

                return deployment_result
            },
            ...createWrappedMethods( contract ),
            expectEvents: ( { result:{ log } }, tests ) => {
                const events = contract.decodeEvents( log )
                const filtered = ( events || [] ).filter(
                    x =>  x.address == contract.deployInfo.address
                ).reverse()
                if ( tests ) {
                    tests.events( {
                        tail : filtered,
                        head : null,
                    } )
                }
            },

        }
    } catch ( ex ) {
        console.debug( ex )
        if ( ex.response && ex.response.text ) {
            console.debug( JSON.parse( ex.response.text ) )
        }
        assert.fail( 'Could not initialize contract instance' )
    }
}

const formatMethodName = ( str ) => {
    const reservedWords = [ 'expectEvents', 'contract', 'deploy' ]
    return reservedWords.some( x => str === x )
        ? str + '2'
        : str
}
//move
const createWrappedMethods =  ( contract, extractor ) => {
    const methods = contract.methods
    const keys = Object.keys( methods )
    const wrappedMethods = keys.reduce( ( acc, key ) => {
        const method = methods[key]
        const wrappedMethod = async ( ...args ) => {
            const ret = await method.apply( contract, args )
            return extractor ? extractor( ret ) : ret.decodedResult
        }
        const cloned = { ...acc }
        cloned[formatMethodName( key )] = wrappedMethod
        return cloned
    }, {} )
    return wrappedMethods
}

const getA = x => x.contract.deployInfo.address

const getAK = contract => cttoak( getA( contract ) )
const cttoak = ( value ) => value.replace( "ct_", "ak_" )

var pairModel
const pairModelFixture = async () => {

    const fakeAddress = 'ct_A8WVnCuJ7t1DjAJf4y8hJrAEVpt1T9ypG3nNBdbpKmpthGvUm'
    pairModel = await getContract(
        './contracts/AedexV2Pair.aes',
        [
            fakeAddress,
            fakeAddress,
            fakeAddress,
            1000,
            undefined,
        ],
    )
    await pairModel.deploy()
}

const sampleFixture = async ( ) => {
    const token = await getContract(
        './contracts/Sample.aes',
        [ ],
    )
    await token.deploy()
    return token
}

const awaitOneKeyBlock = async ( client ) => {
    const height = await client.height()
    await axios.get( 'http://localhost:3001/emit_kb?n=1' )
    await client.awaitHeight( height + 1 )
}
const beforeEachWithSnapshot = ( str, work ) => {
    let snapshotHeight = -1
    let client
    before( "initial snapshot: " + str, async () => {
        client = await createClient()
        console.debug( "running initial work for snapshot... " )
        await work()
        console.debug( "initial work ... DONE " )
        // get the snapshot height
        //snapshotHeight = await getBlockHeight()
        snapshotHeight = await client.height()
        console.debug( `snapshot block height: ${snapshotHeight}` )
        await awaitOneKeyBlock( client )
    } )

    afterEach( "reset to snapshot", async () => {
        //const currentBlockHeight = await getBlockHeight()
        const currentBlockHeight = await client.height()
        if ( currentBlockHeight > snapshotHeight ) {
            const cmd = `docker exec aedex_node_1 bin/aeternity db_rollback --height ${snapshotHeight}`
            await exec( cmd )
            await awaitOneKeyBlock( client )
        }  
    } )
}

module.exports = {
    beforeEachWithSnapshot,
    createClient,
    getContract,
    getA,
    getAK,
    cttoak,
    sampleFixture,
    swapPayload: ( amount0In, amount1In, amount0Out, amount1Out, ) =>
        `${amount0In}|${amount1In}|${amount0Out}|${amount1Out}`
}

