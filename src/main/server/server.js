var express = require('express');
var app = express();
var bodyParser = require('body-parser');

/*
var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/ego');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log("connected");
});


var fieldSchema = mongoose.Schema({
    points: [{
        temperature: Number,
        food: Number,
        rock: Number
    }]
});

var Field = mongoose.model("Field", fieldSchema);
*/

app.use(express.static('../'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var router = express.Router();

router.get('/', function(req, res) {
    res.json({ message: 'hooray! welcome to our api!' });
});

app.use("/api", router);

app.listen(3000, function () {
  console.log('Tetris listening on port 3000');
});