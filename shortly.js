var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var crypto = require('crypto');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();
var passport = require('passport');
var FacebookStrategy = require('passport-facebook').Strategy;

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
// look at express docs to understand our options for passing to session
// saveUnitialized saves a new session to the store (choose false for login)
// resave forces session to be saved--what are session stores and why do they
// matter and should resave be false to avoid race conditions? 


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

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  console.log(user,'55');
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  console.log(user,done,'60');
  done(null, user);
});



var restrict = function(req, res, next) {
  // does this point to the user?
  if (req.url === '/login' || req.url === '/signup' || req.url === '/logout' || req.url.indexOf('facebook') !== -1) {
    console.log('important authorizing happening');
    next();
  } else if (req.session.userid) {
    console.log('user found');
    next();
  } else {
    console.log(req.method, req.url, 'redirected to login');
    // req.session.error = 'Access denied!';
    res.redirect('/auth/facebook');
  }
};
app.use(restrict);

app.get('/auth/facebook', passport.authenticate('facebook'));
// after authentication above, facebook moves to callback 
app.get('/auth/facebook/callback', passport.authenticate('facebook', {failureRedirect: '/login' }), 
  function(req, res) {
    console.log('we have succeeded', req.user);
    req.session.userid = req.user.id;
    // console.log('account', req.account);
    new User({ username: req.user.id }).fetch()
    .then(function(found) {
      if (found) {
        console.log('found old user');

        // give them a session then call doen
        // req.session.username = profile.id;
        // done(null, profile);
      } else {
        // if user not found in system,  
        console.log('making new user');
        Users.create({
          // write the username and hash to db
          username: req.user.id,
        })
        .then(function(newUser) {
            // redirect to links and store cookie
          // req.session.username = profile.id;
        });
      }
      res.redirect('/');
    });
  });


app.get('/login', 
function(req, res) {
  console.log('before render');
  res.render('login');
  // console.log('after render');
});
app.get('/logout', 
function(req, res) {
  req.logout();
  req.session.destroy();
  res.redirect('/login');
});

app.get('/',
function(req, res) {
  console.log('main page');
  // restrict(req, res);
  // this gives us an error that we can't set headers after doing someting
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
// Write your authentication routes here
/************************************************************/

app.post('/signup', function(req, res) {

  var username = req.body.username; 
  var password = req.body.password;
    // hash the password
  var shasum = crypto.createHash('sha1');
  shasum.update(password);
  // check that unqiue username and password in db
  new User({ username: username }).fetch()
  .then(function(found) {
    if (found) {
      // if user found in system, tell them to try a new username
      res.status(200).send('you done messed up');
    } else {
      // if user not found in system,  
      Users.create({
        // write the username and hash to db
        username: username,
        password: shasum.digest('base64'),
      })
      .then(function(newUser) {
          // redirect to links and store cookie
        req.session.username = username;
        // guessing we dont send password as not secure
        // req.session.password = shasum.digest('base64');
        res.status(200).redirect('/');

      });
    }
  });
});

app.post('/login', function(req, res) {
  //check if username and password combo is in db
  res.redirect('/auth/facebook');
  // var shasum = crypto.createHash('sha1');
  // shasum.update(req.body.password);
  // var username = req.body.username; 
  // var password = shasum.digest('base64');
  // new User({ username: username, password: password}).fetch()
  // .then(function(found) {
  //   if (found) {
  //     //create session and redirect
  //     req.session.username = username;
  //     res.status(200).redirect('/');
  //   } else {
  //     // if user not found in system,
  //     res.redirect('/login');  
  //   }
  // });
});



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
