const { AeSdk, Node, MemoryAccount } = require( '@aeternity/aepp-sdk' )
const fs = require( 'fs' )
const path = require( 'path' )
const { NETWORKS } = require( '../config/network.js' )
const DEFAULT_NETWORK_NAME = 'local'
const  wallets = require( '../config/wallets.json' )
const WALLETS = wallets.defaultWallets
const http = require( 'http' )

const injectCode = ( contractPath, rgx, contractContent, injectDebugCode ) => {
    const match = rgx.exec( contractContent )
    if ( !match ) {
        return contractContent
    }
    return contractContent.replace( rgx, ( _, relativePath, ) => {
        const includePath = path.resolve( `${contractPath[0]}/${relativePath}` )
        return getContractContent( includePath, injectDebugCode )
    } )
}
const getContractContent = ( contractSource, injectDebugCode ) => {
    const contractContent = fs.readFileSync( contractSource, 'utf8' )
    const rgxMainPath = /.*\//g
    const contractPath = rgxMainPath.exec( contractSource )

    const rgx = /^\s*\/\/\s*#inject\s+"([\d\w/.\-_]+)"/gmi
    const injectedContent = injectCode( contractPath, rgx, contractContent, injectDebugCode )
    if ( injectDebugCode ) {
        const debugRgx = /^\s*\/\/\s*#inject-debug\s+"([\d\w/.\-_]+)"/gmi
        return injectCode( contractPath, debugRgx, injectedContent, injectDebugCode )
    }

    return injectedContent
}

const getFilesystemEx = ( contractSource, injectDebugCode ) => {
    console.log( `Creating filesystem by checking includes for: ${contractSource}` )
    const defaultIncludes = [
        'List.aes', 'Option.aes', 'String.aes',
        'Func.aes', 'Pair.aes', 'Triple.aes',
        'BLS12_381.aes', 'Frac.aes', "Set.aes"
    ]
    const rgx = /^include\s+"([\d\w/.\-_]+)"/gmi
    const rgxIncludePath = /"([\d\w/.\-_]+)"/gmi
    const rgxMainPath = /.*\//g

    const contractContent = getContractContent( contractSource, injectDebugCode )
    const filesystem = {}

    const match = rgx.exec( contractContent )
    if ( !match ) {
        return { filesystem, contractContent }
    }
    const rootIncludes = contractContent.match( rgx )
    for ( let i = 0; i < rootIncludes.length; i++ ) {
        const contractPath = rgxMainPath.exec( contractSource )
        rgxMainPath.lastIndex = 0
        const includeRelativePath = rgxIncludePath.exec( rootIncludes[i] )
        rgxIncludePath.lastIndex = 0
        if ( defaultIncludes.includes( includeRelativePath[1] ) ) {
            console.log( `=> Skipping default include: ${includeRelativePath[1]}` )
            continue
        }
        console.log( `=> Adding include: ${includeRelativePath[1]}` )
        const includePath = path.resolve( `${contractPath[0]}/${includeRelativePath[1]}` )
        try {
            const ret = getFilesystemEx( includePath )
            filesystem[includeRelativePath[1]] = ret.contractContent
            Object.assign( filesystem, ret.filesystem )
        } catch ( error ) {
            throw Error( `File to include '${includeRelativePath[1]}' not found.` )
        }
        console.log( `` )
    }
    console.log( `` )
    return { filesystem, contractContent }
}
const getFilesystem = ( contractSource ) => getFilesystemEx( contractSource ).filesystem

const createSdkInstance = async ( {
    wallet,
    network,
    compiler
} = {} ) => {
    const NETWORK_NAME = network ? network : DEFAULT_NETWORK_NAME

    const instance = new Node( NETWORKS[NETWORK_NAME].nodeUrl, { ignoreVersion: true } )

    const accounts = wallet ? [ new MemoryAccount( { keypair: wallet } )  ] : WALLETS.map( x => new MemoryAccount( { keypair: x } ) )
    const client = new AeSdk( {
        nodes       : [ { name: NETWORK_NAME, instance } ],
        compilerUrl : compiler ? compiler : NETWORKS[NETWORK_NAME].compilerUrl,
        interval    : 50,
        //TODO:  do we really need this in the new sdk?
        address     : wallet ? wallet.publicKey : WALLETS[0].publicKey,
    },  )
    await Promise.all(
        accounts.map( ( account, index ) => client.addAccount(
            account,
            { select: index === 0 },
        ) ),
    )
    return client
}

// a filesystem object must be passed to the compiler if the contract uses custom includes
const deployContract_ = ( client, logMe, injectDebugCode ) => async ( { source, file }, params, interfaceName ) => {
    try {
        logMe && console.log( '----------------------------------------------------------------------------------------------------' )
        logMe && console.log( `%cdeploying '${source}...'`, `color:green` )

        var fileSystem, contract_content
        if ( file ) {
            fileSystem       = getFilesystem( file )
            contract_content = getContractContent( file, injectDebugCode )
        } else {
            contract_content = source
        }

        const contract          = await client.getContractInstance( {
            source      : contract_content, fileSystem,
            omitUnknown : true,
        } )
        const deployment_result = await contract.deploy( params )
        logMe && console.log( deployment_result )
        logMe && console.log( '-------------------------------------  END  ---------------------------------------------------------' )

        if ( interfaceName ) {
            const parent = "./contracts/interfaces/for-export"
            if ( !fs.existsSync( parent ) ) {
                fs.mkdirSync( parent )
            }
            fs.writeFileSync( parent + '/' + interfaceName, contract.interface, 'utf-8' )
            logMe && console.log( 'Inteface generated at: ' + parent + "/" + interfaceName )
        }
        return contract
    } catch ( ex ) {
        //console.log( ex )
        if ( ex.response && ex.response.text ) {
            console.log( JSON.parse( ex.response.text ) )
        }
        throw ex
    }
}
const deployContract = ( client, logMe, injectDebugCode ) => ( file, params, interfaceName ) =>
    deployContract_( client, logMe, injectDebugCode )( { file }, params, interfaceName )

const awaitOneKeyBlock = async ( client ) => {
    const height = await client.height()
    await get( `${getNodeUrl( client )}/emit_kb?n=1` )
    await client.awaitHeight( height + 1 )
}

async function get( url ) {
    return new Promise( ( resolve, reject ) => {
    // eslint-disable-next-line consistent-return
        const req = http.request( url, { method: 'GET' }, ( res ) => {
            if ( res.statusCode < 200 || res.statusCode > 299 ) {
                return reject( new Error( `HTTP status code ${res.statusCode}` ) )
            }

            const body = []
            res.on( 'data', ( chunk ) => body.push( chunk ) )
            res.on( 'end', () => resolve( Buffer.concat( body ).toString() ) )
        } )

        req.on( 'error', ( err ) => reject( err ) )

        req.on( 'timeout', () => {
            req.destroy()
            reject( new Error( 'Request time out' ) )
        } )

        req.end()
    } )
}
const getNodeUrl = ( client ) => client.pool.get( client.selectedNodeName ).url
const delay = ( n = 1000 ) =>  new Promise( ( resolve ) => setTimeout( () => resolve( null ), n ) )

//this will not make snapshots if the node is testnet or mainnet
const beforeEachWithSnapshot = ( str, work, options = {} ) => {
    let snapshotHeight = -1
    let client = client
    before( "initial snapshot: " + str, async () => {
        if ( !client ) {
            client = await createSdkInstance( options.wallet, options.network, options.compiler )
        }
        console.debug( "running initial work for snapshot... " )
        await work()
        console.debug( "initial work ... DONE " )
        // get the snapshot height
        if ( client.selectedNodeName === 'local' ) {
            snapshotHeight = await client.height()
            console.debug( `snapshot block height: ${snapshotHeight}` )
            await awaitOneKeyBlock( client )
        }
    } )

    afterEach( "reset to snapshot", async () => {
        if ( client.selectedNodeName !== 'local' ) {
            return
        }
        const currentBlockHeight = await client.height()
        if ( currentBlockHeight > snapshotHeight ) {
            await get( `${getNodeUrl( client )}/rollback?height=${snapshotHeight}` )
            console.debug( `rolled back to ${snapshotHeight}` )
            await awaitOneKeyBlock( client )
        }
    } )
}

const beforeAfterEachWithSnapshot = ( str, work, workAfter, options = {} ) => {
    let snapshotHeight = -1
    let client = client
    before( "initial snapshot: " + str, async () => {
        if ( !client ) {
            client = await createSdkInstance( options.wallet, options.network, options.compiler )
        }
        console.debug( "running initial work for snapshot... " )
        await work()
        console.debug( "initial work ... DONE " )
        // get the snapshot height
        if ( client.selectedNodeName === 'local' ) {
            snapshotHeight = await client.height()
            console.debug( `snapshot block height: ${snapshotHeight}` )
            await awaitOneKeyBlock( client )
        }
    } )

    afterEach( "reset to snapshot", async () => {
        await workAfter()
        if ( client.selectedNodeName !== 'local' ) {
            return
        }
        const currentBlockHeight = await client.height()
        if ( currentBlockHeight > snapshotHeight ) {
            await get( `${getNodeUrl( client )}/rollback?height=${snapshotHeight}` )
            console.debug( `rolled back to ${snapshotHeight}` )
            await awaitOneKeyBlock( client )
        }
    } )
}


module.exports = {
    beforeEachWithSnapshot,
    beforeAfterEachWithSnapshot,
    deployContract,
    createSdkInstance,
    getContractContent,
    getFilesystem
}
