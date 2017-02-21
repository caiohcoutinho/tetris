var assert = require('assert');
var Crixalis = require("./Crixalis");
var _ = require('underscore');
var colors = require('ansi-256-colors');
var Node = Crixalis.Node;
var gd = require('node-gd');
console.log("\u001b[2J\u001b[0;0H");

var flip = function(stage, x, y, type){
    var cell = _.findWhere(stage, {x: x, y: y});
    if(!_.isUndefined(cell)){
        cell.type = type;
    }
}

var clean = function(x){
    return parseInt(Math.round(x));
}

it("Draw", function(){
    this.timeout(0);

    var gd = require('node-gd');

    var img = gd.createTrueColorSync(100, 100);
    img.line(0, 0, 50, 50, gd.trueColor(255, 0, 0));
    img.saveFile('./test.jpg');
    img.destroy();
})

describe('Crixalis ', function() {
  it.only('plans correctly', function(){
    this.timeout(0);
    stage = [];
    _.each(_.range(22), function(row, y){
       _.each(_.range(10), function(cell, x){
            stage.push({
                x: x,
                y: y,
                type: 'empty',
                heat: 0,
            });
       })
    });
    flip(stage, 1, 2, 'tetrimino');
    flip(stage, 1, 3, 'tetrimino');
    flip(stage, 1, 4, 'tetrimino');
    flip(stage, 1, 5, 'tetrimino');

    var block = 15;


    var white = gd.trueColor(255, 255, 255);
    var red = gd.trueColor(255, 0, 0);
    var blue = gd.trueColor(0, 0, 255);
    var black = gd.trueColor(0, 0, 0);
    var yellow = gd.trueColor(0, 255, 255);

    _.each(_.range(10), function(i){
       _.each(_.range(4), function(j){
          if(i != 0){
            flip(stage, i, 21-j, "solid");
          }
       });
    });

    var base = gd.createTrueColorSync(10 * block, 22 * block);
    _.each(_.groupBy(stage, "y"), function(row, y){
        _.each(row, function(cell, x){
            var type = cell.type;
            if(type == 'solid'){
                var color = blue;
            }
            if(type == 'empty'){
                var color = black;
            }
            if(type == 'tetrimino'){
                var color = red;
            }
            base.filledRectangle(clean(x * block), clean(y * block), clean( (x+1) * block), clean( (y+1) * block), color);
            base.rectangle(clean(x * block), clean(y * block), clean( (x+1) * block), clean( (y+1) * block), white);
        });
    })
    base.saveFile('./base.jpg');
    base.destroy();

    console.log("");
    var goals = Crixalis.bfs(stage);
    _.each(goals, function(g){
        g.originalValue = Crixalis.evaluate(g.stage);
    });

    var getOriginalValue = function(g){
        return g.originalValue;
    }

    var getValue = function(g){
        return g.value;
    }

    var maxValue = _.max(goals, getOriginalValue).originalValue;
    var minValue = _.min(goals, getOriginalValue).originalValue;

    console.log("MinValue = "+minValue);
    console.log("MaxValue = "+maxValue);

    _.each(goals, function(g){
        g.value = clean( 1000 * (g.originalValue - minValue) / (maxValue - minValue));
    });

    var maxNValue = _.max(goals, getValue).value;
    var minNValue = _.min(goals, getValue).value;

    console.log("MinNValue = "+minNValue);
    console.log("MaxNValue = "+maxNValue);

    var maxHeat = 0;
    var minHeat = 0;

    var targets = gd.createTrueColorSync(10 * block, 22 * block);

    _.each(goals, function(g, z){
        if(true || z == 0){
            var shape = Crixalis.TETRIMINOS[g.tetriminoLocation.currentTetrimino][g.tetriminoLocation.foundShape];
            var position = g.tetriminoLocation.foundPosition;
            var ix = position[0];
            var iy = position[1];
            _.each(shape, function(fx, j){
                _.each(fx, function(cell, i){
                    var cellGrid = _.findWhere(stage, {x: ix + i, y: iy + j});
                    if(!_.isUndefined(cellGrid)){
                        if(cell){
                            var newHeat = cellGrid.heat + g.value;
                            if(newHeat > maxHeat){
                                maxHeat = newHeat;
                            }
                            if(newHeat < minHeat){
                                minHeat = newHeat;
                            }
                            cellGrid.heat = newHeat;

                            var tx = ix + i;
                            var ty = iy + j;
                            targets.filledRectangle(clean(tx * block), clean(ty * block), clean( (tx+1) * block), clean( (ty+1) * block), yellow);
                            targets.rectangle(clean(tx * block), clean(ty * block), clean( (tx+1) * block), clean( (ty+1) * block), white);
                        }
                    }
                });
            });
        }
    });
    targets.saveFile('./targets.jpg');
    targets.destroy();

    console.log("Max = "+maxHeat);
    console.log("Min = "+minHeat);

    var colorMax = 255;

    var ra = colorMax / (maxHeat - minHeat);
    var rb = - colorMax * minHeat / (maxHeat - minHeat);

    var ga1 = colorMax * 2 / (maxHeat - minHeat);
    var gb1 = - colorMax * 2 * minHeat / (maxHeat - minHeat);

    var ga2 = - colorMax * 2 / (maxHeat - minHeat);
    var gb2 = colorMax * 2 * maxHeat / (maxHeat + minHeat);

    var ba = colorMax / (minHeat - maxHeat);
    var bb = - colorMax * maxHeat / (minHeat - maxHeat);

    var average = (maxHeat + minHeat) / 2;

    var img = gd.createTrueColorSync(10 * block, 22 * block);
    _.each(_.groupBy(stage, "y"), function(row, y){
        _.each(row, function(cell, x){
            var h = cell.heat;
            var red = ra * h + rb;
            if(h <= average){
                var green = ga1 * h + gb1;
            } else{
                var green = ga2 * h + gb2;
            }
            var blue = ba * h + bb;

            var color = gd.trueColor(clean(red), clean(green), clean(blue));
            img.filledRectangle(clean(x * block), clean(y * block), clean( (x+1) * block), clean( (y+1) * block), color);
            img.rectangle(clean(x * block), clean(y * block), clean( (x+1) * block), clean( (y+1) * block), white);
        });
    });
    img.saveFile('./heat.jpg');
    img.destroy();

  });

  describe('produceAdjacents ', function() {
    beforeEach(function(){
        stage = [];
        _.each(_.range(22), function(row, y){
           _.each(_.range(10), function(cell, x){
                stage.push({
                    x: x,
                    y: y,
                    type: 'empty'
                });
           })
        });
    });
    it('spin correctly', function() {

        flip(stage, 1, 5, 'tetrimino');
        flip(stage, 1, 6, 'tetrimino');
        flip(stage, 1, 7, 'tetrimino');
        flip(stage, 1, 8, 'tetrimino');

        var node = new Node(stage);
        node.tetriminoLocation = {
            currentTetrimino: "i",
            foundShape: 1,
            foundPosition: [0,5],
        }

        _.each(_.range(5), function(){
            node = Crixalis.produceAdjacents(node, Crixalis.knownMoves, 10, 22)[0];
        });
    });
  });
});