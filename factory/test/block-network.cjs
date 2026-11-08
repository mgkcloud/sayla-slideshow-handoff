'use strict';
const net = require('node:net');
const blocked = () => { throw new Error('NETWORK_BLOCKED_BY_TEST'); };
net.createConnection = blocked;
net.connect = blocked;
net.Socket.prototype.connect = blocked;
