const express = require('express')
const parser = require('body-parser')
const cors = require('cors')
const https = require('https')

const {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} = require('fs')

const {
	execSync
} = require('child_process')

const MempoolJS = require('@mempool/mempool.js')

const {
	MongoClient
} = require('mongodb')

const {
	MAINNET,
	TESTNET,
	NETWORK,
	CMD_PREFIX,
	VAULT_ADDRESS,
	MONGODB_URI,
	DB_NAME,
	COLLECTION_NAME,
	FRONT_SERVER,
	STATIC_FEE,
	DYNAMIC_FEE,
	INSCRIPTION_PATH,
} = require('./config.js')

const {
	waitForSeconds,
} = require('./util.js')

const {
	inscribeOrdinal,
} = require('./ord-wallet.js')

////////////////////////////////////////////////////////////////

const ORDINAL_TYPE_TEXT = 0
const ORDINAL_TYPE_BRC20_DEPLOY = 1
const ORDINAL_TYPE_BRC20_MINT = 2
const ORDINAL_TYPE_BRC20_TRANSFER = 3

const ORDER_STATUS_ORDERED = 1
const ORDER_STATUS_TRANSACTION_CONFIRMED = 2
const ORDER_STATUS_ORDINAL_INSCRIBED = 3
const ORDER_STATUS_FAILED = 4
const ORDER_STATUS_CONFIRMED = 5

const ERROR_UNKNOWN = 'Unknown error'
const ERROR_INVALID_PARAMTER = 'Invalid parameter'
const ERROR_INVALID_TXID = 'Invalid txid'
const ERROR_DUPLICATED_TXID = 'Duplicated txid'

const BRC20_PROTOCOL = 'brc-20'

const app = express()

app.use(parser.urlencoded({ extended: false }))
app.use(parser.json())

app.use(cors())

// const privateKey = readFileSync('key.pem', 'utf8')
// const certificate = readFileSync('cert.pem', 'utf8')
// const credentials = {
// 	key: privateKey,
// 	cert: certificate,
// }

// const server = https.createServer(credentials, app)

const mempool = MempoolJS({
	hostname: 'mempool.space',
	network: NETWORK,
	timeout: 60000,
})

const bitcoin = mempool.bitcoin

const mongoClient = new MongoClient(MONGODB_URI)

const mongodb = mongoClient.db(DB_NAME)
const orderCollection = mongodb.collection(COLLECTION_NAME)

let lastBlockHeight = 0

const WAIT_TIME = 60

const DIR_PATH = `${INSCRIPTION_PATH}`

if (!existsSync(DIR_PATH)) {
	mkdirSync(DIR_PATH)
}

////////////////////////////////////////////////////////////////

const inscribeTextOrdinal = async (text, destination, feeRate) => {
	try {
		const inscriptionPath = `${DIR_PATH}/inscription.txt`
		writeFileSync(inscriptionPath, text)

		return await inscribeOrdinal(inscriptionPath, destination, feeRate)
	} catch (error) {
		console.error(error)
	}
}

const getInscriptionSats = async (inscription) => {
	try {
		const parts = inscription.split('i')
		const txid = parts[0]
		const vout = parts[1]

		const tx = await bitcoin.transactions.getTx({ txid })

		if (tx && tx.status.confirmed) {
			return tx.vout[vout].value
		}
	} catch (error) {
		console.error
	}
}

const getTransaction = async (txid) => {
	try {
		let tx = null
		let waitTime = 0

		while (!tx && waitTime < WAIT_TIME) {
			try {
				waitTime++
				await waitForSeconds(1)
				tx = await bitcoin.transactions.getTx({ txid })
			} catch (error) {
			}
		}

		return tx
	} catch (error) {
		console.error(error)
	}
}

async function orderThread() {
	while (true) {
		try {
			const blockHeight = await bitcoin.blocks.getBlocksTipHeight()

			if (blockHeight > lastBlockHeight) {
				try {
					if (true) {
						execSync(`ord ${CMD_PREFIX} --chain ${NETWORK} index run`) // It's for ord version above 6.0
					} else {
						execSync(`ord ${CMD_PREFIX} --chain ${NETWORK} index`) // It's for ord version below 6.0
					}
					
					console.log('Wallet was indexed')
				} catch (error) {
					console.error(error)

					await waitForSeconds(WAIT_TIME)
					continue
				}

				const orders = await orderCollection.find({ order_status: { $lt: ORDER_STATUS_FAILED } }).toArray()

				for (const order of orders) {
					try {
						switch (order.order_status) {
							case ORDER_STATUS_ORDERED:
								let tx = await getTransaction(order.txid)

								if (!tx) {
									order.order_status = ORDER_STATUS_FAILED
									order.description = 'Transaction not exist'
									break
								} else if (!tx.status.confirmed) {
									break
								}

								let validSenderAddress = true

								for (const vin of tx.vin) {
									if (vin.prevout.scriptpubkey_address !== order.btc_sender_address) {
										validSenderAddress = false
										break
									}
								}

								if (!validSenderAddress) {
									order.order_status = ORDER_STATUS_FAILED
									order.description = 'Invalid sender address'
									break
								}

								let btcBalance = 0
								let validReceiverAddress = false

								for (const vout of tx.vout) {
									if (vout.scriptpubkey_address === VAULT_ADDRESS) {
										btcBalance += vout.value
										validReceiverAddress = true
									}
								}

								if (!validReceiverAddress) {
									order.order_status = ORDER_STATUS_FAILED
									order.description = 'Invalid receiver address'
									break
								}

								order.btc_balance = btcBalance
								order.spent_fee = 0

								if (order.btc_balance < STATIC_FEE + DYNAMIC_FEE * order.fee_rate) {
									order.order_status = ORDER_STATUS_FAILED
									order.description = 'Insufficient BTC balance'
									break
								}

								order.order_status = ORDER_STATUS_TRANSACTION_CONFIRMED
								order.description = 'Transaction confirmed'
							case ORDER_STATUS_TRANSACTION_CONFIRMED:
								const ordinal = await inscribeTextOrdinal(
									order.inscription_text,
									order.inscription_receiver_address,
									order.fee_rate
								)

								if (!ordinal) {
									order.order_status = ORDER_STATUS_FAILED
									order.description = 'Inscribe ordinal failed'
									break
								}

								order.ordinal = ordinal

								order.order_status = ORDER_STATUS_ORDINAL_INSCRIBED
								order.description = 'Ordinal inscribed'
							case ORDER_STATUS_ORDINAL_INSCRIBED:
								const ordinalTx = await getTransaction(order.ordinal.reveal)

								if (!ordinalTx) {
									order.order_status = ORDER_STATUS_FAILED
									order.description = 'Inscribe ordinal transaction not exist'
									break
								} else if (!ordinalTx.status.confirmed) {
									break
								}

								order.spent_fee += order.ordinal.fees//token_transfer is not defined!!
								order.spent_fee += await getInscriptionSats(order.ordinal.inscription)

								order.order_status = ORDER_STATUS_CONFIRMED
								order.description = 'Confirmed'
								break
						}

						order.remain_btc_balance = order.btc_balance - order.spent_fee
						await orderCollection.updateOne({ _id: order._id }, { $set: order })
					} catch (error) {
						order.status = ORDER_STATUS_FAILED
						order.description = error.toString()
						await orderCollection.updateOne({ _id: order._id }, { $set: order })
						console.error(error)
					}
				}

				lastBlockHeight = blockHeight
			}

			await waitForSeconds(WAIT_TIME)
		} catch (error) {
			console.error(error)
		}
	}
}

async function checkOrder(order) {
	if (!order.txid
		|| !order.fee_rate
		|| !order.btc_sender_address
		|| !order.inscription_receiver_address) {
		order.description = ERROR_INVALID_PARAMTER
		return
	}

	if (!/^[a-fA-F0-9]{64}$/.test(order.txid)) {
		order.description = ERROR_INVALID_TXID
		return
	}

	const txs = await orderCollection.find({ txid: order.txid }).toArray()

	if (txs.length) {
		order.description = ERROR_DUPLICATED_TXID
		return
	}

	return true
}

async function insertOrder(order) {
	try {
		order.timestamp = Date.now()
		const result = await orderCollection.insertOne(order)
		order._id = result.insertedId

		order.order_status = ORDER_STATUS_ORDERED
		order.description = 'Ordered'
		await orderCollection.updateOne({ _id: order._id }, { $set: order })

		return true
	} catch (error) {
		console.error(error)
	}
}

app.get('/getvaultaddress', async function (req, res) {
	try {
		res.setHeader('Access-Control-Allow-Origin', FRONT_SERVER)
		res.setHeader('Access-Control-Allow-Methods', 'GET')

		res.send(JSON.stringify({ status: 'success', data: VAULT_ADDRESS }))
	} catch (error) {
		console.error(error)
		res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
	}
})

app.get('/getfeeconstant', async (req, res) => {
	try {
		res.setHeader('Access-Control-Allow-Origin', FRONT_SERVER)
		res.setHeader('Access-Control-Allow-Methods', 'GET')

		res.send(JSON.stringify({
			status: 'success',
			data: {
				static_fee: STATIC_FEE,
				dynamic_fee: DYNAMIC_FEE,
			},
		}))
	} catch (error) {
		console.error(error)
		res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
	}
})

app.post('/getorder', async function (req, res) {
	try {
		res.setHeader('Access-Control-Allow-Origin', FRONT_SERVER)
		res.setHeader('Access-Control-Allow-Methods', 'POST')

		const orders = await orderCollection.find(req.body).toArray()

		res.send(JSON.stringify({ status: 'success', data: orders }))
	} catch (error) {
		console.error(error)
		res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
	}
})

app.post('/inscribe/text', async function (req, res) {
	try {
		res.setHeader('Access-Control-Allow-Origin', FRONT_SERVER)
		res.setHeader('Access-Control-Allow-Methods', 'POST')

		const order = req.body

		if (!(await checkOrder(order))
			|| !order.inscription_text) {
			res.send(JSON.stringify({ status: 'error', description: order.description }))
			return
		}

		order.ordinal_type = ORDINAL_TYPE_TEXT

		if (await insertOrder(order)) {
			res.send(JSON.stringify({ status: 'success', data: order }))
		} else {
			res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
		}
	} catch (error) {
		console.error(error)
		res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
	}
})

app.post('/textinscribe', async function (req, res) {
	try {
		res.setHeader('Access-Control-Allow-Origin', FRONT_SERVER)
		res.setHeader('Access-Control-Allow-Methods', 'POST')

    
		const {text, receiveAddress} = req.body

		if (!text || !receiveAddress) {
			res.send(JSON.stringify({ status: 'error', description: ERROR_INVALID_PARAMTER }))
			return
		}

		const feeRateURL = 'https://mempool.space/api/v1/fees/recommended'
		let feeRate = 1
		if(NETWORK === MAINNET){
			try {
				const response = await fetch(feeRateURL);
				const data = await response.json();
				feeRate = data.halfHourFee
			} catch (error) {
				res.send(JSON.stringify({ status: 'error', description: 'FeeRate fetch error' }))
				return
			}
		}

		const result = await inscribeTextOrdinal(text, receiveAddress, feeRate)
		if(result){
			res.send(JSON.stringify({ status: 'success', data: result }))
		}
		else {
			res.send(JSON.stringify({ status: 'error', description: "Inscribe Failed" }))
		}
	}
	catch{
		res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
	}
})

app.post('/inscribe/brc20/deploy', async function (req, res) {
	try {
		res.setHeader('Access-Control-Allow-Origin', FRONT_SERVER)
		res.setHeader('Access-Control-Allow-Methods', 'POST')

		const order = req.body

		if (!(await checkOrder(order))
			|| !order.token_tick
			|| !order.max_supply) {
			res.send(JSON.stringify({ status: 'error', description: order.description }))
			return
		}

		const deployInfo = {
			p: BRC20_PROTOCOL,
			op: 'deploy',
			tick: order.token_tick.toString(),
			max: order.max_supply.toString(),
		}

		order.ordinal_type = ORDINAL_TYPE_BRC20_DEPLOY
		order.inscription_text = JSON.stringify(deployInfo)

		if (await insertOrder(order)) {
			res.send(JSON.stringify({ status: 'success', data: order }))
		} else {
			res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
		}
	} catch (error) {
		console.error(error)
		res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
	}
})

app.post('/inscribe/brc20/mint', async function (req, res) {
	try {
		res.setHeader('Access-Control-Allow-Origin', FRONT_SERVER)
		res.setHeader('Access-Control-Allow-Methods', 'POST')

		const order = req.body

		if (!(await checkOrder(order))
			|| !order.token_tick
			|| !order.mint_amount) {
			res.send(JSON.stringify({ status: 'error', description: order.description }))
			return
		}

		const mintInfo = {
			p: BRC20_PROTOCOL,
			op: 'mint',
			tick: order.token_tick.toString(),
			amt: order.mint_amount.toString(),
		}

		order.ordinal_type = ORDINAL_TYPE_BRC20_MINT
		order.inscription_text = JSON.stringify(mintInfo)

		if (await insertOrder(order)) {
			res.send(JSON.stringify({ status: 'success', data: order }))
		} else {
			res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
		}
	} catch (error) {
		console.error(error)
		res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
	}
})

app.post('/inscribe/brc20/transfer', async function (req, res) {
	try {
		res.setHeader('Access-Control-Allow-Origin', FRONT_SERVER)
		res.setHeader('Access-Control-Allow-Methods', 'POST')

		const order = req.body

		if (!(await checkOrder(order))
			|| !order.token_tick
			|| !order.transfer_amount) {
			res.send(JSON.stringify({ status: 'error', description: order.description }))
			return
		}

		const transferInfo = {
			p: BRC20_PROTOCOL,
			op: 'transfer',
			tick: order.token_tick.toString(),
			amt: order.transfer_amount.toString(),
		}

		order.ordinal_type = ORDINAL_TYPE_BRC20_TRANSFER
		order.inscription_text = JSON.stringify(transferInfo)

		if (await insertOrder(order)) {
			res.send(JSON.stringify({ status: 'success', data: order }))
		} else {
			res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
		}
	} catch (error) {
		console.error(error)
		res.send(JSON.stringify({ status: 'error', description: ERROR_UNKNOWN }))
	}
})

module.exports = {
	orderThread,
	server: app,
}
