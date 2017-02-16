var webdriverio = require('webdriverio');
var _ = require('underscore');
var sleep = require('sleep').sleep;
var options = {
    desiredCapabilities: {
        browserName: 'chrome',
    }
};

console.log("Crixalis is running");

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
var typeMap = {
    ghost: ".",
    solid: "o",
    tetrimino: "x",
    empty: ".",
}

var heuristics = [
    {name: "Aggregate Height", alpha: -1, func: function(elements){
        var columns = _.groupBy(elements, "x");
        var value = _.reduce(columns, function(total, c){
            var cell = _.findWhere(c, {type: 'solid'});
            var columnValue = 0;
            if(!_.isUndefined(cell)){
                columnValue = 22 - parseInt(cell.y);
            }
            //console.log("Single column value: "+columnValue);
            return total + columnValue;
        }, 0);
        //console.log("Aggregate Height value: "+value);
        return value;
    }},
    {name: "Complete Lines", alpha: 8, func: function(elements){
        var rows = _.groupBy(elements, "y");
        return _.countBy(rows, function(r){
            return _.every(r, function(cell){
                var type = cell.type;
                return type == 'solid' || type == 'tetrimino';
            });
        })[true] || 0;
    }},
    {name: "Holes", alpha: -1, func: function(elements){
        var columns = _.groupBy(elements, "x");
        var total = _.reduce(columns, function(total, c){
            var holes = 0;
            var hasSolid = false;
            _.each(c, function(cell){
                if(hasSolid && cell.type == 'empty'){
                    holes++;
                } else if(cell.type == 'solid' || cell.type == 'tetrimino'){
                    hasSolid = true;
                }
            });
            return total+holes;
        }, 0);
        return total;
    }},
    {name: "Bumpiness", alpha: -1, func: function(elements){
        var calculateHeight = function(c){
            var cell = _.findWhere(c, {type: 'solid'});
            var columnValue = 0;
            if(!_.isUndefined(cell)){
                columnValue = 22 - parseInt(cell.y);
            }
            return columnValue;
        }
        var columns = _.groupBy(elements, "x");
        var size = _.size(columns);
        var total = 0;
        _.each(columns, function(c, i, list){
            if(i < size -1){
                var c1 = calculateHeight(c);
                var c2 = calculateHeight(list[parseInt(i)+1]);
                total += Math.abs(c1 - c2);
            }
        });
        return total;
    }},
]

var evaluate = function(elements){
    return _.reduce(heuristics, function(total, h){
        var calc = h.alpha*h.func(elements);
        console.log(h.name+": "+calc);
        return total + calc;
    }, 0);
}

var takeAction = function(){
    try{
        var now = _.now();
        if(now - lastAction > 1){
            if(actions < 11130){
                lastAction = now;
                var query = ".tetristable.main td";

                var result;

                var tick = _.now();
                browser.getAttribute(query, "data").then(function(elements){
                    try{
                        var diff = _.now() - tick;
                        time += diff;

                        var cells = _.map(elements, function(el){
                            return JSON.parse(el);
                        });

                        var rows = _.groupBy(cells, "y");

                        if(true || actions%2 == 0){
                            console.log("Evaluation value: "+evaluate(cells));
                            _.each(rows, function(row){
                                console.log(_.reduce(row, function(memo, cell){
                                    return memo + typeMap[cell.type];
                                }, ""));
                            });
                            console.log("");
                        }

                        var randomAction = _.random(0, keyOptions.length-1);
                        //driver[keyOptions[randomAction]]();

                        actions++;
                        scheduleNextMove();
                    } catch(e){
                        console.log(e);
                    }
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