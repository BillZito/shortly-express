var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var crypto = require('crypto');
var passport = require('passport');
var FacebookStrategy = require('passport-facebook').Strategy;

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

passport.use(new FacebookStrategy({
  clientID: '85702217037',
  clientSecret: '499e10bcf722972449e56b858d17b11e',
  callbackURL: 'http://localhost:4568/auth/facebook/callback'
},
  function(accesstoken, refreshToken, profile, done) {
    done(null, profile);
  }
));

app.use(session({
  secret: 'button-haranguer',
  cookie: {},
  resave: true,
  saveUninitialized: false
}));
//how does this work with session?
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});



var restrict = function(req, res, next) {
  // check for authentication
  if (req.url === '/login' || req.url === '/logout' || req.url.indexOf('facebook') !== -1) {
    next();

  } else if (req.user) {
    next();
  } else {
    res.redirect('/auth/facebook');
  }
};

app.use(restrict);

app.get('/auth/facebook', passport.authenticate('facebook'));
// after authentication above, facebook moves to callback 
app.get('/auth/facebook/callback', passport.authenticate('facebook', {failureRedirect: '/login' }), 
  function(req, res) {
    new User({ username: req.user.id }).fetch()
    .then(function(found) {
      if (found) {
        console.log('found old user');
      } else {
        // if user not found in system,  
        console.log('making new user');
        Users.create({
          // write the username and hash to db
          username: req.user.id,
        });
      }
      res.redirect('/');
    });
  });

//======================================routing =========================================================/
app.get('/login', 
function(req, res) {
  console.log('before render');
  res.render('login');
  // console.log('after render');
});
app.get('/logout', 
function(req, res) {
  req.logout();
  console.log(req.user, 'req.user after logout');
  req.session.destroy();
  res.redirect('/');
});

app.get('/',
function(req, res) {
  console.log('main page');
  res.render('index');
});

app.get('/create',
function(req, res) {
  res.render('index');
});


app.get('/signup', 
function(req, res) {
  res.render('signup');
});

app.get('/links',  
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links', 
function(req, res) {
  console.log('post to links!');
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
//authentication routes here
/************************************************************/


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
