var webdriverio = require('webdriverio');
var _ = require('underscore');
var sleep = require('sleep').sleep;
var options = {
    desiredCapabilities: {
        browserName: 'chrome',
    }
};

console.log("Barathrum is running");

var browser = webdriverio.remote(options).init();

var browserReady = false;

var tick = _.now();

console.log("Opening browser")
browser = browser.url('localhost:3000/html/tetris.html');

var initTime = _.now();
var lastAction = initTime;
var actions = 0;

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

var scheduleNextMove = function(){
    setTimeout(takeAction, 10);
}

var keyOptions = _.keys(driver);

var time = 0;

var takeAction = function(){
    try{
        var now = _.now();
        if(now - lastAction > 1){
            if(actions < 10){
                lastAction = now;
                var query = ".tetristable.main td";

                var result;

                var tick = _.now();
                browser.getAttribute(query, "data").then(function(elements){
                    var diff = _.now() - tick;
                    time += diff;
                    console.log("Browser call took: "+(diff));
                    var randomAction = _.random(0, keyOptions.length-1);
                    driver[keyOptions[randomAction]]();
                    actions++;
                    scheduleNextMove();
                });

            } else{
                console.log("Average: "+(time/actions));
                console.log("Closing browser");
                browser.end();
                setTimeout(function(){
                    process.exit();
                }, 4000);
            }
        } else{
            scheduleNextMove();
        }
    } catch(e){
        console.log(e);
    }
}

scheduleNextMove();