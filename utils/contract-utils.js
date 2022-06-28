const fs = require( 'fs' )
const path = require( 'path' )

const getContractContent = ( contractSource ) => {
    const contractContent = fs.readFileSync( contractSource, 'utf8' )
    const rgx = /^\s*\/\/\s*#inject\s+"([\d\w/.\-_]+)"/gmi
    const rgxMainPath = /.*\//g
    const match = rgx.exec( contractContent )
    if ( !match ) {
        return contractContent
    }
    const contractPath = rgxMainPath.exec( contractSource )
    const ret = contractContent.replace( rgx, ( _, relativePath, ) => {
        const includePath = path.resolve( `${contractPath[0]}/${relativePath}` )
        return getContractContent( includePath )
    } )
    //console.log( ret )
    return ret

}

const getFilesystemEx = ( contractSource ) => {
    console.log( `Creating filesystem by checking includes for: ${contractSource}` )
    const defaultIncludes = [
        'List.aes', 'Option.aes', 'String.aes',
        'Func.aes', 'Pair.aes', 'Triple.aes',
        'BLS12_381.aes', 'Frac.aes', "Set.aes"
    ]
    const rgx = /^include\s+"([\d\w/.\-_]+)"/gmi
    const rgxIncludePath = /"([\d\w/.\-_]+)"/gmi
    const rgxMainPath = /.*\//g

    const contractContent = getContractContent( contractSource )
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

module.exports = {
    getContractContent,
    getFilesystem
}
