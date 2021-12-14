// Files and modules

import axios from "axios"
import querystring from "querystring"

// Resolve 1inch API endpoint

function getEndpoint(chainId) {
    if (chainId === "0x1") {
        return "https://api.1inch.exchange/v3.0/1"
    } else if (chainId === "0x89") {
        return "https://api.1inch.exchange/v3.0/137"
    } else if (chainId === "0x38") {
        return "https://api.1inch.exchange/v3.0/56"
    }
}

// Quote swap

async function quote(chain, BN) {
    const endpoint = getEndpoint(chain.id)
    if (!endpoint) return BN(0)
    const swap = chain.swap
    try {
        const result = await axios(`${endpoint}/quote?${querystring.encode({
            fromTokenAddress: swap.tokenIn.address,
            toTokenAddress: swap.tokenOut.address,
            amount: swap.tokenInAmount.toString()
        })}`)
        return BN(result.data.toTokenAmount)
    } catch(error) {
        console.error(error)
        return BN(0)
    }
}

// Get swap

async function getSwap(chain, account, BN) {
    const endpoint = getEndpoint(chain.id)
    if (!endpoint) return
    const swap = chain.swap
    try {
        const result = await axios(`${endpoint}/swap?${querystring.encode({
            fromTokenAddress: swap.tokenIn.address,
            toTokenAddress: swap.tokenOut.address,
            amount: swap.tokenInAmount.toString(),
            fromAddress: account,
            slippage: chain.swapSettings.slippage
        })}`)
        return {
            out: BN(result.data.toTokenAmount),
            tx: {
                from: account,
                to: result.data.tx.to,
                data: result.data.tx.data
            }
        }
    } catch(error) {
        console.error(error)
    }
}

// Exports

export { quote, getSwap }