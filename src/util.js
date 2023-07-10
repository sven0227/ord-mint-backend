const EventEmitter = require('events')

const waitForEvent = async (eventEmitter, eventName) => {
	return new Promise(resolve => {
		eventEmitter.on(eventName, resolve)
	})
}

const waitForSeconds = async (seconds) => {
	try {
		const eventEmitter = new EventEmitter()

		setTimeout(() => {
			eventEmitter.emit('TimeEvent')
		}, seconds * 1000)

		await waitForEvent(eventEmitter, 'TimeEvent')
		eventEmitter.removeAllListeners()
	} catch (error) {
		console.error(error)
	}
}

module.exports = {
	waitForEvent,
	waitForSeconds,
}
