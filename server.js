var fs = require('fs');
var https = require('https');
var express = require('express');
var app = express();
/*
//HTTPS
var options = {
   key  : fs.readFileSync('klin-key.pem'),
   cert : fs.readFileSync('klin-cert.pem')
};
app.use(express.static(__dirname ));
https.createServer(options,app).listen(3000);

return;

*/

var 
	options = {
		secret: "a secret key",
		saveUninitialized: false
	}

	express = require('express'),
    app = express(),
    port = 3000,
    

	app.use(express.static(__dirname ));
	
var server = app.listen(port, function () {
  var host = server.address().address;
  var port = server.address().port;
 
  console.log('Example app listening at http://%s:%s', host, port);
});
