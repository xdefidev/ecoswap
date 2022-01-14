// Files and modules

import routerList from "../../data/routers.json"
import axios from "axios"
import querystring from "querystring"

const routerData = routerList.find(router => router.id === "1inch")

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
    // No quote

    const none = {
        ...routerData,
        out: false
    }

    // Check swap parameters

    if (!chain.swapSettings.routers[routerData.id].enabled) return none
    const endpoint = getEndpoint(chain.id)
    if (!endpoint) return none
    const swap = chain.swap

    try {
        // Request swap quote

        const result = await axios(`${endpoint}/quote?${querystring.encode({
            fromTokenAddress: swap.tokenIn.address,
            toTokenAddress: swap.tokenOut.address,
            amount: swap.tokenInAmount.toString()
        })}`)

        return {
            ...routerData,
            out: BN(result.data.toTokenAmount)
        }
    } catch(error) {
        console.error(error)
        return none
    }
}

// Get swap

async function getSwap(chain, account, BN) {
    // No swap

    const none = {
        router: routerData,
        out: false
    }

    // Check swap parameters
    
    if (!chain.swapSettings.routers[routerData.id].enabled) return none
    const endpoint = getEndpoint(chain.id)
    if (!endpoint) return none
    const swap = chain.swap
    
    try {
        // Swap data

        const data = {
            fromTokenAddress: swap.tokenIn.address,
            toTokenAddress: swap.tokenOut.address,
            amount: swap.tokenInAmount.toString(),
            fromAddress: account,
            slippage: chain.swapSettings.slippage,
            referrerAddress: chain.swapSettings.referral
        }

        // Get swap with and without estimate checking

        const [ withEstimate, withoutEstimate ] = await Promise.all([
            axios(`${endpoint}/swap?${querystring.encode(data)}`)
                .catch(error => ({ error: true, error })),
            axios(`${endpoint}/swap?${querystring.encode({
                ...data,
                disableEstimate: true
            })}`)
        ])
        
        if (!withEstimate.error) {
            return {
                router: routerData,
                in: BN(withEstimate.data.fromTokenAmount),
                out: BN(withEstimate.data.toTokenAmount),
                tx: {
                    from: account,
                    to: withEstimate.data.tx.to,
                    data: withEstimate.data.tx.data
                }
            }
        }

        // Return swap without estimate check on insufficient gas or allowance error

        if (
            withEstimate.error.response &&
            withEstimate.error.response.data &&
            withEstimate.error.response.data.description &&
            (withEstimate.error.response.data.description.startsWith("insufficient funds for gas * price + value") ||
            withEstimate.error.response.data.description.startsWith("Not enough allowance"))
        ) {
            return {
                router: routerData,
                in: BN(withoutEstimate.data.fromTokenAmount),
                out: BN(withoutEstimate.data.toTokenAmount),
                tx: {
                    from: account,
                    to: withoutEstimate.data.tx.to,
                    data: withoutEstimate.data.tx.data
                }
            }
        }
    } catch(error) {
        console.error(error)
        return none
    }
}

// Exports

export { quote, getSwap }