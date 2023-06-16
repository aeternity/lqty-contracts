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

Calculation are verified in [sheet](https://github.com/aeternity/lqty-contracts/blob/main/docs/demos/demo 1_ calculations.xlsx)

How to run it: `make demo1`

### Demo 2

Check LQTY token handling, LQTY token holder invest in LQTY pool and get rewards from open and withrdaw AEUSD operations

Calculation are verified in [sheet](https://github.com/aeternity/lqty-contracts/blob/main/docs/demos/demo 2_ LQTY Tokens demo.xlsx)

How to run it: `make demo2`

### Demo 3

Check stability pool, user invest AEUSD in stability pool and get rewards from liquidations.


Calculation are verified in [sheet](https://github.com/aeternity/lqty-contracts/blob/main/docs/demos/demo 3_ Stability Pool demo.xlsx)


How to run it: `make demo3`
