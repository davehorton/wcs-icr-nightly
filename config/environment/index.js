'use strict';

var path = require('path');
var _ = require('lodash');
var winston = require('winston') ;

function requiredProcessEnv(name) {
  if(!process.env[name]) {
    throw new Error('You must set the ' + name + ' environment variable');
  }
  return process.env[name];
}

var consoleLogger = new winston.transports.Console({
  level: 'debug',
  timestamp: function() {
    return new Date().toString();
  },
  colorize: true
});

// All configurations will extend these options
// ============================================
var all = {
  env: process.env.NODE_ENV,

  // Root path of server
  root: path.normalize(__dirname + '/../..'),

  // MongoDB connection options
  mongo: {
    options: {
      db: {
        safe: true
      }
    }
  },

  redis: {
    host: 'localhost',
    port: 6379,
    options: {
      max_attempts: 1
    }
  },

  logger: {
    transports: [ consoleLogger ]
  },

};

// Export the config object based on the NODE_ENV
// ==============================================
module.exports = _.merge(
  all,
  require('./' + process.env.NODE_ENV + '.js') || {});