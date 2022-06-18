const { expect } = require( 'chai' )

import {
    sampleFixture,
} from './shared/fixtures.js'

describe( 'WAE', () => {
    let sample
    before( 'asd', async () => {
        sample = await sampleFixture()
    } )
    it( "test 1", async () => {
        const result = await sample.owner() 
        expect( result ).to.eq( "just a sample" )
        console.log( result )
    } )

} )
