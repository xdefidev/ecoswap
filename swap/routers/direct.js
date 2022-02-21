// Files and modules

import routerList from "../../data/routers.json"
import swapRouters from "../../data/swap-routers.json"
import { web3, BN } from "../../state/EthereumContext.js"

const routerData = routerList.find(router => router.id === "direct")

// Quote swap

async function quote(chain) {
    // No quote

    const none = {
        ...routerData,
        out: false
    }

    // Check swap parameters

    if (!chain.swapSettings.routers[routerData.id].enabled) return none
    const routers = swapRouters[chain.id]
    if (!Object.keys(routers).length) return none

    try {
        // Find best router quote

        const best = await getBestRouterQuote(chain, routers)
        if (best.out.isZero()) return none
        
        return {
            id: routerData.id,
            routerId: best.router,
            name: routers[best.router].name,
            out: best.out,
            priority: true
        }
    } catch(error) {
        console.error(error)
        return none
    }
}

// Get swap

async function getSwap(chain, account) {
    // No swap

    const none = {
        router: routerData,
        out: false
    }

    // Check swap parameters

    if (!chain.swapSettings.routers[routerData.id].enabled) return none
    const routers = swapRouters[chain.id]
    if (!Object.keys(routers).length) return none
    const swap = chain.swap

    try {
        // Find best router quote

        const best = await getBestRouterQuote(chain, routers)
        if (best.out.isZero()) return none
        const swapData = encodeSwapData(chain, account, routers[best.router], swap.tokenIn.address, swap.tokenOut.address, swap.tokenInAmount, best.out)
        const gas = await chain.web3.eth.estimateGas({
            from: account,
            to: routers[best.router].address,
            value: swap.tokenIn.address === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ? swap.tokenInAmount : 0,
            data: swapData
        }).catch(() => {})

        // Calculate swap parameters

        return {
            router: {
                id: routerData.id,
                routerId: best.router,
                name: routers[best.router].name
            },
            in: swap.tokenInAmount,
            out: best.out,
            tx: {
                from: account,
                to: routers[best.router].address,
                data: swapData,
                ...(gas) && { gas: web3.utils.numberToHex(Math.floor(gas * 1.25)) }
            }
        }
    } catch(error) {
        console.error(error)
    }

    return none
}

// Get best router quote

async function getBestRouterQuote(chain, routers) {
    // Run batch request

    const batch = new chain.web3.BatchRequest()
    const requests = []
    const quotes = []
    const signature = web3.eth.abi.encodeFunctionSignature("getAmountsOut(uint256,address[])")
    const calldata = web3.eth.abi.encodeParameters(["uint256", "address[]"], [
        chain.swap.tokenInAmount,
        [
            chain.swap.tokenIn.address === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ? chain.WETH : chain.swap.tokenIn.address,
            chain.swap.tokenOut.address === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ? chain.WETH : chain.swap.tokenOut.address
        ]
    ])

    for (const router in routers) {
        requests.push(new Promise(resolve => {
            batch.add(chain.web3.eth.call.request({
                to: routers[router].address,
                data: `${signature}${calldata.slice(2)}`
            }, (error, result) => {
                if (error) {
                    console.error(error)
                    quotes.push({
                        router,
                        out: BN(0)
                    })
                } else {
                    quotes.push({
                        router,
                        out: BN(web3.eth.abi.decodeParameter("uint256[]", result)[1])
                    })
                }
                resolve()
            }))
        }))
    }

    batch.execute()
    await Promise.all(requests)

    // Find best router quote

    let best = quotes[0]
    for (let q = 1; q < quotes.length; q ++) {
        if (quotes[q].out.gt(best.out)) {
            best = quotes[q]
        }
    }
    return best
}

// Encode swap data on router

function encodeSwapData(chain, account, router, tokenIn, tokenOut, amountIn, amountOut) {
    // Calculate swap data

    const amountOutMin = amountOut.mul(BN(10 ** 4 - chain.swapSettings.slippage * 100)).div(BN(10).pow(BN(4)))
    const path = [
        tokenIn === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ? chain.WETH : tokenIn,
        tokenOut === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ? chain.WETH : tokenOut
    ]
    const deadline = BN(2).pow(BN(256)).sub(BN(1))

    if (tokenIn === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
        // Swap exact ETH for tokens

        const signature = web3.eth.abi.encodeFunctionSignature(`swapExact${router.ETH}ForTokens(uint256,address[],address,uint256)`)
        const calldata = web3.eth.abi.encodeParameters(["uint256", "address[]", "address", "uint256"], [
            amountOutMin,
            path,
            account,
            deadline
        ])
        return `${signature}${calldata.slice(2)}`
    } else if (tokenOut === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
        // Swap exact tokens for ETH

        const signature = web3.eth.abi.encodeFunctionSignature(`swapExactTokensFor${router.ETH}(uint256,uint256,address[],address,uint256)`)
        const calldata = web3.eth.abi.encodeParameters(["uint256", "uint256", "address[]", "address", "uint256"], [
            amountIn,
            amountOutMin,
            path,
            account,
            deadline
        ])
        return `${signature}${calldata.slice(2)}`
    } else {
        // Swap exact tokens for tokens

        const signature = web3.eth.abi.encodeFunctionSignature(`swapExactTokensForTokens(uint256,uint256,address[],address,uint256)`)
        const calldata = web3.eth.abi.encodeParameters(["uint256", "uint256", "address[]", "address", "uint256"], [
            amountIn,
            amountOutMin,
            path,
            account,
            deadline
        ])
        return `${signature}${calldata.slice(2)}`
    }
}

// Exports

export { quote, getSwap }