var webdriverio = require('webdriverio');
var _ = require('underscore');
var options = {
    desiredCapabilities: {
        browserName: 'chrome',
    }
};

console.log("Abaddon is running");

var browser = webdriverio.remote(options).init();

var browserReady = false;

var tick = _.now();

console.log("Opening browser")
browser = browser.url('localhost:3000/html/tetris.html');

var initTime = _.now();
var lastAction = initTime;
var actions = 0;

var id;

var driver = {
    up: function(){
        browser.keys("ArrowUp");
    },
    down: function(){
        browser.keys("ArrowDown");
    },
    left: function(){
        browser.keys("ArrowLeft");
    },
    right: function(){
        browser.keys("ArrowRight");
    },
    spin: function(){
        browser.keys(" ");
    },
    swap: function(){
        browser.keys("Enter");
    }
}

var keyOptions = _.keys(driver);

var takeAction = function(){
    try{
        var now = _.now();
        if(now - lastAction > 100){
            if(actions < 50){
                lastAction = now;
                var randomAction = _.random(0, keyOptions.length-1);
                console.log(keyOptions[randomAction]);
                driver[keyOptions[randomAction]]();
                actions++;
            } else{
                clearInterval(id);
                console.log("Closing browser");
                browser.end();
                setTimeout(function(){
                    process.exit();
                }, 1000);
            }
        }
    } catch(e){
        console.log(e);
    }
}

id = setInterval(takeAction, 100);