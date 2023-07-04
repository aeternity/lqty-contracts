# lqty-contracts

Original project [documentation](https://github.com/liquity/dev#readme)

## install required packagegs

Run: `make install`

## start services

Run: `make start-node`

## run all tests (with services up)

Run: `make test`

## run demos

### Demo 1

Open 3 troves, change AE price and liquidate one in Emergency mode, debt and collateral is porportionally redistributed between rest of open troves.

Calculation are verified in [sheet](https://github.com/aeternity/lqty-contracts/blob/main/docs/demos/demo1.xlsx)

How to run it: `make demo1`

### Demo 2

Check LQTY token handling, LQTY token holder invest in LQTY pool and get rewards from open and withrdaw AEUSD operations

Calculation are verified in [sheet](https://github.com/aeternity/lqty-contracts/blob/main/docs/demos/demo2.xlsx)

How to run it: `make demo2`

### Demo 3

Check stability pool, user invest AEUSD in stability pool and get rewards from liquidations.


Calculation are verified in [sheet](https://github.com/aeternity/lqty-contracts/blob/main/docs/demos/demo3.xlsx)


How to run it: `make demo3`

### Demo oracle

Simple test using the oracle [ae-oracle-pricefeed](git://github.com/aeternity/ae-oracle-pricefeed) to get AE/USD price from [coingeko](https://www.coingecko.com/), also installs a service [price-service](./price-service/price-service.js) which periodically pools new prices from the oracle and injects it in loan app. 

Run it: `make demo-oracle`

There is also a variation [price-service-query.js](./price-service/price-service.js), where the pooling service does not inject directly the price from the oracle, instead when the query is ready it sends the `query id` to the loan app, and the loan app gets directly the price using the `query id`.


### Price feed pooling service

Service that periodically pools new prices [ae-oracle-pricefeed](git://github.com/aeternity/ae-oracle-pricefeed) oracle, depoying an instance of it, and injects it in loan app ([PriceFeedTestnet](./test/contracts/PriceFeedTestnet.aes)). 

The frequency of the price refreshing can be modified with the environment variable `AWAIT_TIMEOUT_SECONDS`, the default frequency is 10 seconds.


Run it: `DEFAULT_NETWORK_NAME=local WALLET_FILE='./config/wallet-price-feed.json' CONTRACT_ADDRESS='ct_2Eee1pWXH6HFTeuTGTFMxMwKg6ydGea4jbo1MQdG7Y9ViuS6BD' AWAIT_TIMEOUT_SECONDS=60 node price-service/price-service.js`


