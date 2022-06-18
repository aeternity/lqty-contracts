module.exports = {
    NETWORKS: {
        "testnet": {
            "nodeUrl"       : "https://testnet.aeternity.io",
            "compilerUrl"   : "https://latest.compiler.aepps.com",
            "middlewareUrl" : "https://testnet.aeternity.io/mdw"
        },
        "mainnet": {
            "nodeUrl"       : "https://mainnet.aeternity.io",
            "compilerUrl"   : "https://latest.compiler.aepps.com",
            "middlewareUrl" : "https://mainnet.aeternity.io/mdw"
        },
        "local": {
            "nodeUrl"       : process.env.LOCAL_NODE_URL || "http://localhost:3002",
            "compilerUrl"   : process.env.LOCAL_COMPILE_URL || "http://localhost:3081",
            "middlewareUrl" : null
        }
    }
}
