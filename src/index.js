const {
	orderThread,
	server,
} = require('./server.js')

orderThread()
server.listen(80)

console.log('Server started ...')