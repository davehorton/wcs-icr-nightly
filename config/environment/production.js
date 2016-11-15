'use strict';


// Production specific configuration
// =================================
module.exports = {

  // MongoDB connection options
  mongo: {
    uri: 'mongodb://wcs-icr-db-001,wcs-icr-db-002,wcs-icr-db-003/wcsroutes?replicaSet=wcs-rs0'
  },

  redis: {
    host: 'wcs-icr-db-002',
    port: 6379,
    options: {
      max_attempts: 1
    }
  },

};