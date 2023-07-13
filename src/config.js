const TESTNET = 'testnet'
const MAINNET = 'mainnet'

const NETWORK = MAINNET

const WALLET_NAME = 'ord'

const CMD_PREFIX = ''

const VAULT_ADDRESS =
	NETWORK === MAINNET ?
		'bc1p9f2xyc72guvj6ru9hmpgn2r03frtavl9f3682qmxsssc0au0u5cqh6fxnn' :
		'tb1psjevj4md2jc6m5kxtxetr5dnqhmywm4krtzv9tw2lnutu7l4fxnqftl77p'

const MONGODB_URI = 'mongodb://127.0.0.1:27017'
const DB_NAME = 'ordinals'
const COLLECTION_NAME = 'order'

const FRONT_SERVER = '*'

const STATIC_FEE = 546
const DYNAMIC_FEE = 500

const INSCRIPTION_PATH = 'inscription'

module.exports = {
	MAINNET,
	TESTNET,
	NETWORK,
	WALLET_NAME,
	CMD_PREFIX,
	VAULT_ADDRESS,
	MONGODB_URI,
	DB_NAME,
	COLLECTION_NAME,
	FRONT_SERVER,
	STATIC_FEE,
	DYNAMIC_FEE,
	INSCRIPTION_PATH,
}