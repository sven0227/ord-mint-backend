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
		console.log("inscribling =============>",`ord ${CMD_PREFIX} --chain ${NETWORK} --wallet ${WALLET_NAME} wallet inscribe --destination ${destination} --fee-rate ${feeRate} ${inscriptionPath}`);
		const execOut = execSync(`ord ${CMD_PREFIX} --chain ${NETWORK} --wallet ${WALLET_NAME} wallet inscribe --destination ${destination} --fee-rate ${feeRate} ${inscriptionPath}`)
		const inscribeInfo = JSON.parse(execOut.toString().replace(/\n/g, ''))
		console.log('inscribeInfo :>> ', inscribeInfo);
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


const string2json = (string) => {
 try {
  return JSON.parse(string.replace(/\\n/g, ''))
 } catch (error) {
 }
}

function generateAddress(addressCount) {
 try {
  const addresses = []

  for (let index = 0; index < addressCount; index++) {
   const execOut = "sdfsfewt333"//execSync(`ord --${NETWORK} --wallet ${WALLET_NAME} wallet receive`)
   const address = "address"+Math.random()*10//string2json(execOut.toString()).address
   
   addresses.push(address)
   console.log(address)
  }

  return addresses
 } catch (error) {
  console.error(error)
 }
}

function splitUtxo(addresses, amount) {
 try {
  const data = {}

  for (const address of addresses) {
   data[address] = amount / 10 ** 8
  }
console.log(`bitcoin-cli -chain=${NETWORK === 'mainnet' ? 'main' : 'test'} -rpcwallet=${WALLET_NAME} sendmany '' '${JSON.stringify(data)}'`);
 // const execOut = execSync(`bitcoin-cli -chain=${NETWORK === 'mainnet' ? 'main' : 'test'} -rpcwallet=${WALLET_NAME} sendmany '' '${JSON.stringify(data)}'`)

  // console.log(execOut.toString())
 } catch (error) {
  console.error(error)
 }
}

const address_count = 3
const amount = 100000

const addresses = generateAddress(address_count)
splitUtxo(addresses, amount)

module.exports = {
	inscribeOrdinal,
	sendOrdinal,
}
