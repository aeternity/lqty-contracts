const Decimal = require( "decimal.js" )
const { expect, assert } = require( 'chai' )

const MoneyValues = {
  // negative_5e17: "-" + web3.utils.toWei('500', 'finney'),
  // negative_1e18: "-" + web3.utils.toWei('1', 'ether'),
  // negative_10e18: "-" + web3.utils.toWei('10', 'ether'),
  // negative_50e18: "-" + web3.utils.toWei('50', 'ether'),
  // negative_100e18: "-" + web3.utils.toWei('100', 'ether'),
  // negative_101e18: "-" + web3.utils.toWei('101', 'ether'),
  // negative_eth: (amount) => "-" + web3.utils.toWei(amount, 'ether'),

  _zeroBN:   BigInt('0'),
  _1e18BN:   BigInt(  '1000000000000000000'),
  _10e18BN:  BigInt( '10000000000000000000'),
  _100e18BN: BigInt('100000000000000000000'),
  _100BN: BigInt('100'),
  _110BN: BigInt('110'),
  _150BN: BigInt('150'),

  _MCR:    BigInt('1100000000000000000'),
  _ICR100: BigInt('1000000000000000000'),
  _CCR:    BigInt('1500000000000000000'),
}

const testHelper =  {

    dec: ( val, scale ) => {
        //TODO: don't think we need finney this
        const zerosCount = scale == 'ae' ? 18 : scale == 'finney'  ? 15 : scale
        const strVal = val.toString()
        const strZeros = ( '0' ).repeat( zerosCount )

        return BigInt( strVal.concat( strZeros ) )
    },
    
    getDifference: ( x, y ) => {
        const x_BN = BigInt( x.toString() )
        const y_BN = BigInt( y.toString() )

        const ret =  x_BN - y_BN
        //absolute
        return Number( ret < 0n ? -ret : ret )
    },

    _100pct: '1000000000000000000', // 18 zeros

    ZERO_ADDRESS: 'ak_A8WVnCuJ7t1DjAJf4y8hJrAEVpt1T9ypG3nNBdbpKmpthGvUm', // TODO: better option to a random contract address that should not match any other

    // Subtracts the borrowing fee
    getNetBorrowingAmount: async function (contracts, debtWithFee) {
	const borrowingRate = await contracts.troveManager.get_borrowing_rate_with_decay()
	return BigInt(debtWithFee) * MoneyValues._1e18BN / (MoneyValues._1e18BN + borrowingRate)
    },

    getCompositeDebt:  async function(contracts, debt) {
	const compositeDebt = contracts.borrowerOperations.get_composite_debt(debt)
	return compositeDebt
    },
    
    getOpenTroveTotalDebt: async function(contracts, lusdAmount) {
	const fee = await contracts.troveManager.get_borrowing_fee(lusdAmount)
	const compositeDebt = await this.getCompositeDebt(contracts, lusdAmount)
	// console.log('fee: ' + fee )
	return compositeDebt + fee
    },

    checkRecoveryMode: async function (contracts) {
	const price = await contracts.priceFeedTestnet.get_price()
	return contracts.troveManager.check_recovery_mode(price)
    },	

    // Given a composite debt, returns the actual debt  - i.e. subtracts the virtual debt.
    // Virtual debt = 50 LUSD.
    getActualDebtFromComposite: async function(compositeDebt, contracts) {
	const issuedDebt = await contracts.troveManager.get_actual_debt_from_composite(compositeDebt)
	return issuedDebt
    },

    assertIsApproximatelyEqual: function (x, y, error = 1000) {
	assert.isAtMost(this.getDifference(x, y), error)
    },

    getEventArgByIndex: function(tx, eventName, argIndex) {
	for (let i = 0; i < tx.decodedEvents.length; i++) {
	    if (tx.decodedEvents[i].name === eventName) {
		return tx.decodedEvents[i].args[argIndex]
	    }
	}
	throw (`The transaction logs do not contain event ${eventName}`)
    },

    getAEUSDFeeFromAEUSDBorrowingEvent: function(tx) {
	for (let i = 0; i < tx.decodedEvents.length; i++) {
	    if (tx.decodedEvents[i].name === "AEUSDBorrowingFeePaid") {
		return (tx.decodedEvents[i].args[1]).toString()
	    }
	}
	throw ("The transaction logs do not contain an LUSDBorrowingFeePaid event")
    },    

    // getLatestBlockTimestamp: function(sdk) {
    // 	// const blockNumber = await web3Instance.eth.getBlockNumber()
    // 	// const block = await web3Instance.eth.getBlock(blockNumber)

    // 	const height = await sdk.getHeight()
    // 	return height //block.timestamp
    // },

    // to decode Utils.xsToPayload' in events
    getPayloadByIndex: function(args, argIndex) {
	return args.split('|')[argIndex]
    },
    
    openTrove: async function(contracts, {
	maxFeePercentage,
	extraLUSDAmount,
	upperHint,
	lowerHint,
	ICR,
	extraParams
    }) {
	if (!maxFeePercentage) maxFeePercentage = this._100pct
	if (!extraLUSDAmount) extraLUSDAmount = BigInt(0)
	else if (typeof extraLUSDAmount == 'string') extraLUSDAmount = BigInt( extraLUSDAmount )
	if (!upperHint) upperHint = this.ZERO_ADDRESS
	if (!lowerHint) lowerHint = this.ZERO_ADDRESS
	
	const MIN_DEBT = 
	      (
		  await this.getNetBorrowingAmount(contracts, await contracts.borrowerOperations.min_net_debt())
	      ) + BigInt(1) // add 1 to avoid rounding issues
	const lusdAmount = MIN_DEBT + extraLUSDAmount

	//console.log( MIN_DEBT )
	
	if (!ICR && !extraParams.amount) ICR = BigInt(this.dec(15, 17)) // 150%
	else if (typeof ICR == 'string') ICR = BigInt(ICR)

	const totalDebt = await this.getOpenTroveTotalDebt(contracts, lusdAmount)
	const netDebt = await this.getActualDebtFromComposite(totalDebt, contracts)

	const price = await contracts.priceFeedTestnet.get_price()

	if (ICR) {
	    extraParams.amount = ICR * totalDebt / price
	}

        // let aeusd_fee = await contracts.troveManager.get_borrowing_fee(lusdAmount)
	// let icr = await contracts.borrowerOperations.get_Icr(extraParams.amount, lusdAmount + aeusd_fee , price)
	// const mcr = await contracts.borrowerOperations.mcr()

	// console.log('icr         ' + icr.toString() )
	// console.log('icr >= mcr  ' + (icr.toString() >= mcr.toString()) )
	// console.log('icr < mcr  ' + (icr.toString() < mcr.toString()) )	

	// console.log('mcr:        ' + mcr )
	// console.log('min_debt:   ' + MIN_DEBT )
	// console.log('totaldebt:  ' + totalDebt )
	// console.log('lsudAmount: ' + lusdAmount )
	// console.log('ICR:        ' + ICR)
	// console.log('price:      ' + price)		
	// console.log('value:      ' + extraParams.amount)

	// console.log( maxFeePercentage )
	// console.log(lusdAmount)
	// console.log(extraParams)
	
	const tx = await contracts.borrowerOperations.original.methods.open_trove(maxFeePercentage, lusdAmount, upperHint, lowerHint, extraParams)

	//console.log(tx.decodedEvents)
	//Object.keys(tx).forEach((prop)=> console.log(prop + ':' + tx[prop]));
	
	return {
	    lusdAmount,
	    netDebt,
	    totalDebt,
	    ICR,
	    collateral: extraParams.amount,
	    tx
	}
    },

    getOpenTroveLUSDAmount: async function(contracts, totalDebt) {
	const actualDebt = await this.getActualDebtFromComposite(totalDebt, contracts)
	return this.getNetBorrowingAmount(contracts, actualDebt)
    },

    getTroveEntireColl: async function(contracts, trove) {
	return BigInt((await contracts.troveManager.get_entire_debt_and_coll(trove))[1])
    },

    getTroveEntireDebt: async function(contracts, trove) {
	return BigInt((await contracts.troveManager.get_entire_debt_and_coll(trove))[0])
    },

    getTroveStake: async function(contracts, trove) {
	return (contracts.troveManager.get_trove_stake(trove))
    },

    convertContractAddress: function(address) {
	return address.replace("ct_", "ak_")
    },

    // --- Assert functions ---

    assertRevert : async function (txPromise, message = undefined) {
	try {
	    const tx = await txPromise
	    assert.notEqual(tx.result.returnType, 'ok');
	} catch (err) {
	    // console.log("tx failed")
	    assert.include(err.message, message)
	}
    },

    assertRevertOpenTrove : async function (txPromise, message = undefined) {
	try {
	    const tx = await txPromise
	    assert.notEqual(tx.tx.result.returnType, 'ok');
	} catch (err) {
	    // console.log("tx failed")
	    assert.include(err.message, message)
	}
    },        

}
const makeBN = ( num, precision ) => {
    const strNum = num.toString()

    checkOnlyNumericChars( strNum )

    const intPart = strNum.split( "." )[0]
    const fractionPart = strNum.includes( "." ) ? strNum.split( "." )[1] : ""

    if ( fractionPart.length > precision ) {
        throw new Error( `MakeBN: argument must have <= ${precision} decimal places` )
    }

    const trailingZeros = "0".repeat( precision - fractionPart.length )
    const bigNumArg = intPart + fractionPart + trailingZeros
    return BigNumber( bigNumArg, 10 )
}
const checkOnlyNumericChars = ( input ) => {
    try {
        const num = new Decimal( input )
    } catch ( err ) {
        throw new Error( `MakeBN: input must be number or string-ified number, no non-numeric characters` )
    }
}

export const reduceDecimals = ( val, decimals ) => BigNumber( val ).shiftedBy( -decimals )
const randDecayFactor = ( min, max ) => {
    const amount = Math.random() * ( max - min ) + min
    return  expandDecimals( amount.toFixed( 18 ), 18 )
}
const expandDecimals = ( val, decimals ) => BigInt(
    BigNumber( val ).shiftedBy( decimals ).toFixed( 0 ),
)

const timeValues = {
    SECONDS_IN_ONE_MINUTE : 60,
    SECONDS_IN_ONE_HOUR   : 60 * 60,
    SECONDS_IN_ONE_DAY    : 60 * 60 * 24,
    SECONDS_IN_ONE_WEEK   : 60 * 60 * 24 * 7,
    SECONDS_IN_SIX_WEEKS  : 60 * 60 * 24 * 7 * 6,
    SECONDS_IN_ONE_MONTH  : 60 * 60 * 24 * 30,
    SECONDS_IN_ONE_YEAR   : 60 * 60 * 24 * 365,
    MINUTES_IN_ONE_WEEK   : 60 * 24 * 7,
    MINUTES_IN_ONE_MONTH  : 60 * 24 * 30,
    MINUTES_IN_ONE_YEAR   : 60 * 24 * 365
}
module.exports = {
    randDecayFactor,
    expandDecimals,
    reduceDecimals,
    testHelper,
    timeValues,
    makeBN,
}
