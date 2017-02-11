var webdriverio = require('webdriverio');
var _ = require('underscore');
var options = {
    desiredCapabilities: {
        browserName: 'chrome',
    }
};

var browser = webdriverio.remote(options).init();

var browserReady = false;

var tick = _.now();
browser.url('localhost:3000/html/tetris.html').then(function(){
    browserReady = true;
})

var initTime = _.now();
var lastAction = initTime;
var actions = 0;

var takeAction = function(){
    if(!!browserReady){
        var now = _.now();
        if(now - lastAction > 1000){
            if(actions < 8){
                lastAction = now;
                browser.keys("ArrowUp");
                actions++;
            } else{
                browser.quit();
                process.exit(1);
            }
        }
    }
}

setInterval(takeAction, 500);