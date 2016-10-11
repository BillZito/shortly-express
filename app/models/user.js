var db = require('../config');
var bcrypt = require('bcrypt-nodejs');
var Promise = require('bluebird');
//requiring link model, how do we map a collection of links? 
var Link = require('./Link');



var User = db.Model.extend({
  tableName: 'users',
  hasTimestamps: true,

  links: function() {
    return this.hasMany(Link);
  },
  initialize: function() {
    this.on('creating', function(model, attrs, options) {
      console.log('creating users:');
    });
  }
});

module.exports = User;