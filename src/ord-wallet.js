const {
	execSync
} = require('child_process')

const {
	NETWORK,
	WALLET_NAME,
	CMD_PREFIX,
} = require('./config.js')

////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////

async function inscribeOrdinal(inscriptionPath, destination, feeRate) {
	try {
		const execOut = execSync(`ord ${CMD_PREFIX} --chain ${NETWORK} --wallet ${WALLET_NAME} wallet inscribe --destination ${destination} --fee-rate ${feeRate} ${inscriptionPath}`)
		const inscribeInfo = JSON.parse(execOut.toString().replace(/\n/g, ''))
	
		return inscribeInfo	
	} catch (error) {
		console.error(error)
	}
}

async function sendOrdinal(inscriptionId, address, feeRate) {
	try {
		const execOut = execSync(`ord ${CMD_PREFIX} --chain ${NETWORK} --wallet ${WALLET_NAME} wallet send  --fee-rate ${feeRate} ${address} ${inscriptionId}`)
		const txid = execOut.toString().replace(/\n/g, '')

		return txid
	} catch (error) {
		console.error(error)
	}
}

module.exports = {
	inscribeOrdinal,
	sendOrdinal,
}
