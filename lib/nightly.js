'use strict' ;

var logger = require('../app').logger ;
var debug = require('../app').debug ;
var async = require('async') ;
var _ = require('lodash') ;
var Trunk = require('wcs-icr-models').Trunk ;
var Cdr = require('wcs-icr-models').Cdr ;

module.exports = runIt ;


function queryTrunks( client, callback ) {
  Trunk.find()
  .select({_id: 1, customer: 1, dtg: 1, capacity: 1})
  .sort('customer')
  .populate('customer')
  .exec(function(err, trunks) {
    if( err ) { return callback(err) ; }
    return callback( null, client, trunks ) ;
  }) ;
}

function retrieveCurrentUtilization( client, trunks, callback ) {
  var trunkStats = {} ;
  async.eachSeries( trunks, function( trunk, callback ) {

    let key = `trunk:${trunk.id}:current` ;

    trunkStats[key] = {
      cust: trunk.customer.abbrev,
      trunk: trunk.dtg,
      id: trunk.id,
      keys: []
    } ;

    client.smembers(key, function(err, members) {
      if( err ) {
        logger.error(`nightly: Error calling scard for key ${key}: ${err}`) ;
      }
      else {
        trunkStats[key].keys = members ;
        logger.info(`${trunk.customer.abbrev}: trunk ${trunk.dtg}:${trunk.id} \t${members.length}`) ;
      }
      callback(null) ;
      //pubsubClient.publish('trunk.callsinprogress', cdr.trunk + ' ' + count) ;
    }); 

  }, function(err) {
    callback( err, client, trunkStats) ;
  }) ;
}

function processResults( purgeDeadCalls, client, trunkStats, callback ) {
  var missing = [] ;
  var i = 0 ;

  // iterate each set (trunk)....
  async.eachSeries( _.keys( trunkStats ), function(setKey, callback) {

    var ts = trunkStats[setKey] ;

    // iterate each value (supposed active call on this trunk) in the set
    async.eachSeries( ts.keys, function(key, callback) {

      // try to get the hash associated with this value
      client.hgetall( key, function(err, obj) {
        if( err ) {
          logger.error(`error retrieving key ${key}: ${err}`) ;
          return callback(err) ;
        }

        if( _.size(obj) > 0  ) {
          return callback(null) ;   //valid call -- a hash exists with call data
        }

        logger.info(`this one is missing ${key}`) ;

        // invalid call -- no hash exists; purge key if we are doing that
        missing.push( key ) ;

        if( !purgeDeadCalls ) {
          return callback(null) ;
        }

        client.srem( setKey, key, function(err, reply) {
          if( err ) { return callback(err); }
          logger.info(`client.srem returns ${reply}`) ;
          callback(null) ;
        }) ;
      }) ;
    }, function(err) {
      callback(err) ;
    }) ;
  }, function(err) {
    logger.info(`there are ${_.size(missing)} items in the set without corresponding hash values`) ;
    callback(err, client, trunkStats, missing) ;
  }) ;
}

function reportOnMissingKeys( cdrReport, client, trunkStats, missing, callback ) {


  if( !cdrReport ) {
    return callback(null, client, trunkStats, missing ) ;
  }

  async.eachSeries( missing, function(key, callback) {

    let arr = /callid:(.*):current/.exec( key ) ;
    if( arr ) {
      let callid = arr[1] ;

      Cdr.findOne({callId: key})
      .populate(['trunk', 'customer'])
      .exec( function( err, cdr ) {
        if( err ) { 
          logger.error(`error retrieving cdr for call-id ${key}: ${err}`) ;
          return callback(err) ;
        }
        logger.info(`cdr for missing call call-id ${key}: ${cdr}`) ;
        callback(null) ;
      }) ;
    }
    else {
      logger.error(`hey the key was not in expected format: ${key}`) ;
      callback(null) ;
    }

    }, function(err) {
      callback(null, client, trunkStats, missing) ;
    }
  ) ;
}

function takeFinalAction( purgeDeadCalls, client, missingKeys, foundKeys, callback ) {

    if( purgeDeadCalls ) { 
      logger.info('we will be purging dead calls') ;
      let test = missingKeys.slice(0, 1) ;
      async.eachSeries( test, function(key, callback) {
        client.srem( key, function(err, reply) {
          if( err) { 
            return callback(err); 
          }
          logger.info(`reply from removal of key ${key} from set: ${reply}`) ;
          callback(null) ;
        }) ;
      }, function(err) {
        callback(null) ;
      }) ;
    }
    else {
      callback(null) ;
    }

}

function runIt( client, purgeDeadCalls, cdrReport, callback ) {

  async.waterfall([
    queryTrunks.bind( null, client ), 
    retrieveCurrentUtilization, 
    processResults.bind(null, purgeDeadCalls),
    reportOnMissingKeys.bind(null, cdrReport)
    ], function(err) {
      callback(err) ;
    }) ;

}
