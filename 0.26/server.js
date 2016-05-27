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
