'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

var config = require('./config/environment');
var mongoose = require('mongoose');
var redis = require('redis') ;
var fs = require('fs') ;
var argv = require('minimist')(process.argv.slice(2));
var winston = require('winston') ;
var RSVP = require('rsvp') ;
var all_promises = [];
var app = {} ;
var purgeDeadCalls = argv.purgeCalls === true ;
var cdrReport = argv.detail === true ;
var debug = app.debug = require('debug')('wcs-icr-nightly') ;

debug('argv: ', argv) ;

var logger = app.logger = new winston.Logger({
    levels: {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    },
    transports: config.logger.transports
});

// connect to mongo
mongoose.connect(config.mongo.uri, config.mongo.options, function(err) {
  if( err ) throw err ;
});

all_promises.push(new RSVP.Promise(function(resolve, reject) {
    mongoose.connection.on('connected', function() {
      logger.info('connected to mongo at %s', config.mongo.uri) ;      
      resolve();
    });
    mongoose.connection.on('error', function(err) {
      logger.error('mongoose connection error: ', err) ;
      reject() ;
    }) ;
  })
);

// Connect to redis
var redisClient = app.client = redis.createClient(config.redis.port, config.redis.host, config.redis.options) ;
all_promises.push(new RSVP.Promise(function(resolve, reject){
    redisClient.on('ready', function() {
      logger.info('connected to redis at %s:%d', config.redis.host, config.redis.port) ;
      resolve();
    });
    redisClient.on('error', function(err) {
      logger.info('error connecting to redis at %s:%d', config.redis.host, config.redis.port, err) ;
      reject() ;
    }) ;
  })
);

// Expose app
exports = module.exports = app ;

var runNightly = require('./lib/nightly') ;

RSVP.all(all_promises)
.then(function() {
  runNightly( redisClient, purgeDeadCalls, cdrReport, function(err) {
    mongoose.disconnect(function() {
      logger.info('mongoose closed') ;
      process.exit() ;
    }) ;
    redisClient.quit();
  }) ;
})
.catch( function(err) {
    mongoose.disconnect() ;
    redisClient.quit();
}); 


