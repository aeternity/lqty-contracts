# lqty-contracts

## install required packages

`make install`

## start services

`make start-node`

## run tests (with services up)

`make test`

## to run the price-feed update service
`DEFAULT_NETWORK_NAME=<<mainnet|testnet|local>> CONTRACT_ADDRESS=<<price_feed_contract_address>> npm run price-service`

eg:
`DEFAULT_NETWORK_NAME=local CONTRACT_ADDRESS=ct_ooBRyPXsrjSr3mEABM6hABE5LCtd2qdpzw7sS4LAXrUmqNvEH npm run price-service`

or DEFAULT_NETWORK_NAME and CONTRACT_ADDRESS could be set .env file

