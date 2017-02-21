var webdriverio = require('webdriverio');
var _ = require('underscore');
var options = {
    desiredCapabilities: {
        browserName: 'chrome',
    }
};

var TETRIMINOS = { // TODO: Must add stochasticity to work when two shapes of the tetrimino are indistinguishible.
    i: [[[false, false, false, false], [true, true, true, true], [false, false, false, false], [false, false, false, false]],
       [[false, false, true, false], [false, false, true, false], [false, false, true, false], [false, false, true, false]],
       [[false, false, false, false], [false, false, false, false], [true, true, true, true], [false, false, false, false]],
       [[false, true, false, false], [false, true, false, false], [false, true, false, false], [false, true, false, false]]],
    j: [[[true, false, false],[true, true, true],[false, false, false]],
        [[false, true, true],[false, true, false],[false, true, false]],
        [[false, false, false],[true, true, true],[false, false, true]],
        [[false, true, false],[false, true, false],[true, true, false]]],
    l: [[[false, false, true],[true, true, true],[false, false, false]],
        [[false, true, false],[false, true, false],[false, true, true]],
        [[false, false, false],[true, true, true],[true, false, false]],
        [[true, true, false],[false, true, false],[false, true, false]]],
    o: [[[false, true, true, false],[false, true, true, false],[false, false, false, false]]],
    s: [[[false, true, true],[true, true, false],[false, false, false]],
        [[false, true, false],[false, true, true],[false, false, true]],
        [[false, false, false],[false, true, true],[true, true, false]],
        [[true, false, false],[true, true, false],[false, true, false]]],
    t: [[[false, true, false],[true, true, true],[false, false, false]],
        [[false, true, false],[false, true, true],[false, true, false]],
        [[false, false, false],[true, true, true],[false, true, false]],
        [[false, true, false],[true, true, false],[false, true, false]]],
    z: [[[true, true, false],[false, true, true],[false, false, false]],
        [[false, false, true],[false, true, true],[false, true, false]],
        [[false, false, false],[true, true, false],[false, true, true]],
        [[false, true, false],[true, true, false],[true, false, false]]]
}

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
    spinCW: function(){
        browser.keys(" ");
    },
    spinCCW: function(){
        browser.keys("Backspace");
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
    {name: "Complete Lines", alpha: 1, func: function(elements){
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
        //console.log(h.name+": "+calc);
        return total + calc;
    }, 0);
}

var Node = function(stage, parent, action, tetriminoLocation){
    this.stage = stage;
    this.parent = parent;
    this.action = action;
    this.tetriminoLocation = tetriminoLocation;
    this.plan = function(){
        var result = [];
        if(!_.isUndefined(this.action)){
            result.push(this.action);
        }
        var par = parent;
        while(!_.isUndefined(par)){
            if(!_.isUndefined(par.action)){
                result.unshift(par.action);
            }
            par = par.parent;
        }
        return result;
    };
}

var isLocked = function(node){
    return _.some(_.groupBy(node.stage, "x"), function(c){
        var size = _.size(c);
        var willCollide = _.some(c, function(cell, i, list){
            var condition = cell.type == 'tetrimino' && ((i < (size - 1) && list[i+1].type == 'solid') || (i == size - 1));
            if(condition){
                //console.log(i+ " "+list[i+1]);
            }
            return condition;
        });
        return willCollide;
    })
}

var knownMoves = ["down", "left", "right", "spinCW", "spinCCW"];
//var knownMoves = ["spinCW"];

var checkStage = function(stage, x, y){
    return _.findWhere(stage, {x: x, y: y});
}

var Cache = function(stage){
    this.stage = stage;
    this.cache = {};
    this.get = function(x, y){
        if(!_.has(this.cache, [x, y])){
            this.cache[[x, y]] = checkStage(this.stage, x, y);
        }
        return this.cache[[x,y]];
    }
}

var findPiece = function(stage, lastLocation){

    var cache = new Cache(stage);

    var offLimits = 4;

    var currentTetrimino;
    var foundPosition;
    var foundShape;
    var columns = _.groupBy(stage, "x");
    var numberOfColumns = _.size(columns);
    var rows = _.groupBy(stage, "y");
    var numberOfRows = _.size(rows);

    var tries = 0;
    var tick = _.now();
    if(!_.isUndefined(lastLocation) && !_.isUndefined(lastLocation.foundPosition)){
        //console.log('reuse');
        var foundPosition = lastLocation.foundPosition;
        var found = _.some(TETRIMINOS, function(shapes, tetrimino){
            //console.log("trying "+tetrimino);
            return _.some(shapes, function(shape, k){
                //console.log("trying shape "+k);
                return _.some(_.range(foundPosition[0]-offLimits-1, foundPosition[0]+offLimits+1), function(x){
                    return _.some(_.range(foundPosition[1]-offLimits-1, foundPosition[1]+offLimits+1), function(y){
                        //console.log("trying "+x+" "+y+" ");
                        //console.log(shape);
                        tries++;
                        var notAllOutOfGrid = false;
                        var found = _.every(shape, function(tx, j){
                            return _.every(tx, function(cell, i){
                                var gridCell = cache.get(x+i, y+j);
                                var outOfGrid = _.isUndefined(gridCell);
                                var type = !outOfGrid ? gridCell.type : undefined;
                                var matchTetrimino = (cell && type == 'tetrimino');
                                var matchEmpty = (!cell && type == 'empty');
                                var tetriminoOutOfScreen = cell && outOfGrid;

                                if(matchTetrimino){
                                    //process.stdout.write("change to true");
                                    notAllOutOfGrid = true;
                                }

                                return !tetriminoOutOfScreen && (matchTetrimino || outOfGrid || matchEmpty);
                            });
                        });
                        //process.stdout.write(" and the value is = "+notAllOutOfGrid);
                        //console.log("");
                        if(found && notAllOutOfGrid){
                            currentTetrimino = tetrimino;
                            foundPosition = [x, y];
                            foundShape = k;
                            //console.log(found);
                        }
                        return found && notAllOutOfGrid;
                    });
                });
            });
        });
    }
    if(!found){
        var found = _.some(TETRIMINOS, function(shapes, tetrimino){
            //console.log("trying "+tetrimino);
            return _.some(shapes, function(shape, k){
                //console.log("trying shape "+k);
                return _.some(_.range(-offLimits, numberOfColumns+offLimits), function(x){
                    return _.some(_.range(-offLimits, numberOfRows+offLimits), function(y){
                        //console.log("trying "+x+" "+y+" ");
                        //console.log(shape);
                        tries++;
                        var notAllOutOfGrid = false;
                        var found = _.every(shape, function(tx, j){
                            return _.every(tx, function(cell, i){
                                var gridCell = cache.get(x+i, y+j);
                                var outOfGrid = _.isUndefined(gridCell);
                                var type = !outOfGrid ? gridCell.type : undefined;
                                var matchTetrimino = (cell && type == 'tetrimino');
                                var matchEmpty = (!cell && type == 'empty');
                                var tetriminoOutOfScreen = cell && outOfGrid;

                                if(matchTetrimino){
                                    //process.stdout.write("change to true");
                                    notAllOutOfGrid = true;
                                }

                                return !tetriminoOutOfScreen && (matchTetrimino || outOfGrid || matchEmpty);
                            });
                        });
                        //process.stdout.write(" and the value is = "+notAllOutOfGrid);
                        //console.log("");
                        if(found && notAllOutOfGrid){
                            currentTetrimino = tetrimino;
                            foundPosition = [x, y];
                            foundShape = k;
                            //console.log(found);
                        }
                        return found && notAllOutOfGrid;
                    });
                });
            });
        });
    }
    var diff = (_.now()-tick);
    //console.log("Tries "+tries+" "+diff);
    return {
        currentTetrimino: currentTetrimino,
        foundPosition: foundPosition,
        foundShape: foundShape,
    }
}

var canMove = function(stage, move, found){
    var columns = _.groupBy(stage, "x");
    var numberOfColumns = _.size(columns);
    var rows = _.groupBy(stage, "y");
    var numberOfRows = _.size(rows);
    if(move == 'down'){
        return _.every(columns, function(column, i, thisColumns){
            return _.every(column, function(cell, j, thisColumn){
                return cell.type != "tetrimino" ||
                    (j < numberOfRows - 1 && thisColumn[j+1].type != "solid");
            });
        });
    } else if(move == 'left'){
       return _.every(rows, function(row, i, thisRows){
           return _.every(row, function(cell, j, thisRow){
               return cell.type != "tetrimino" ||
                   (j > 0 && thisRow[j-1].type != "solid");
           });
       });
    } else if(move == 'right'){
       return _.every(rows, function(row, i, thisRows){
           return _.every(row, function(cell, j, thisRow){
               return cell.type != "tetrimino" ||
                   (j < numberOfColumns - 1 && thisRow[j+1].type != "solid");
           });
       });
    }

    if(!!found){

        var currentTetrimino = found.currentTetrimino;
        var foundShape = found.foundShape;
        var foundPosition = found.foundPosition;

        if(_.isUndefined(currentTetrimino)){
            return false;
        }

        if(currentTetrimino == 'o'){
            return false;
        }

        if(move == 'spinCW'){
            var shapeQuantity = _.size(TETRIMINOS[currentTetrimino]);
            var nextShapeIndex = (foundShape==shapeQuantity-1) ? 0 : foundShape+1;
            var shape = TETRIMINOS[currentTetrimino][nextShapeIndex];
            return _.every(shape, function(tx, j){
                return _.every(tx, function(cell, i){
                    var gridCell = checkStage(stage, foundPosition[0]+i, foundPosition[1]+j);
                    var can = !cell || (!_.isUndefined(gridCell) && gridCell.type != 'solid');
                    return can;
                });
            });
        }

        if(move == 'spinCCW'){
            var shapeQuantity = _.size(TETRIMINOS[currentTetrimino]);
            var nextShapeIndex = (foundShape==0) ? shapeQuantity-1 : foundShape-1;
            var shape = TETRIMINOS[currentTetrimino][nextShapeIndex];
            return _.every(shape, function(tx, j){
                return _.every(tx, function(cell, i){
                    var gridCell = checkStage(stage, foundPosition[0]+i, foundPosition[1]+j);
                    return !cell || (!_.isUndefined(gridCell) && gridCell.type != 'solid');
                });
            });
        }
    }


    return false;
}

var takeMove = function(stage, move, found){
    var columns = _.groupBy(stage, "x");
    var numberOfColumns = _.size(columns);
    var rows = _.groupBy(stage, "y");
    var numberOfRows = _.size(rows);
    if(move == 'down'){
        var copy = _.map(stage, function(s){
            return {x: s.x, y: s.y, type: s.type == 'solid' ? 'solid' : 'empty'};
        });
        _.each(columns, function(column, i, thisColumns){
            _.each(column, function(cell, j, thisColumn){
                if(cell.type == 'tetrimino'){
                    var newCell = _.findWhere(copy, {x: parseInt(i), y:parseInt(j+1)});
                    newCell.type = 'tetrimino';
                }
            });
        });
        return copy;
    } else if(move == 'left'){
        var copy = _.map(stage, function(s){
            return {x: s.x, y: s.y, type: s.type == 'solid' ? 'solid' : 'empty'};
        });
        _.each(columns, function(column, i, thisColumns){
            _.each(column, function(cell, j, thisColumn){
                if(cell.type == 'tetrimino'){
                    var newCell = _.findWhere(copy, {x: parseInt(i)-1, y:parseInt(j)});
                    newCell.type = 'tetrimino';
                }
            });
        });
        return copy;
    } else if(move == 'right'){
        var copy = _.map(stage, function(s){
            return {x: s.x, y: s.y, type: s.type == 'solid' ? 'solid' : 'empty'};
        });
        _.each(columns, function(column, i, thisColumns){
            _.each(column, function(cell, j, thisColumn){
                if(cell.type == 'tetrimino'){
                    var newCell = _.findWhere(copy, {x: parseInt(i)+1, y:parseInt(j)});
                    newCell.type = 'tetrimino';
                }
            });
        });
        return copy;
    }

    if(!!found){

        var currentTetrimino = found.currentTetrimino;
        var foundShape = found.foundShape;
        var foundPosition = found.foundPosition;

        if(currentTetrimino == 'o'){
            var copy = _.map(stage, function(s){
                return {x: s.x, y: s.y, type: s.type == 'solid' ? 'solid' : 'empty'};
            });
            return copy;
        }

        if(move == 'spinCW'){
            var shapeQuantity = _.size(TETRIMINOS[currentTetrimino]);
            var nextShapeIndex = (foundShape==shapeQuantity-1) ? 0 : foundShape+1;
            var shape = TETRIMINOS[currentTetrimino][nextShapeIndex];
            var copy = _.map(stage, function(s){
                return {x: s.x, y: s.y, type: s.type == 'solid' ? 'solid' : 'empty'};
            });
            //console.log(move+" "+JSON.stringify(foundPosition));
            _.each(shape, function(tx, j){
                _.each(tx, function(cell, i){
                    var gridCell = checkStage(copy, foundPosition[0]+i, foundPosition[1]+j);
                    if(cell){
                        gridCell.type = 'tetrimino';
                        //process.stdout.write("["+(foundPosition[0]+i)+", "+(foundPosition[1]+j)+"] ");
                    }
                });
            });
            //console.log("");
            return copy;
        }

        if(move == 'spinCCW'){
            var shapeQuantity = _.size(TETRIMINOS[currentTetrimino]);
            var nextShapeIndex = (foundShape==0) ? shapeQuantity-1 : foundShape-1;
            var shape = TETRIMINOS[currentTetrimino][nextShapeIndex];
            var copy = _.map(stage, function(s){
                return {x: s.x, y: s.y, type: s.type == 'solid' ? 'solid' : 'empty'};
            });
            //console.log(move+" "+JSON.stringify(foundPosition));
            _.each(shape, function(tx, j){
                _.each(tx, function(cell, i){
                    var gridCell = checkStage(copy, foundPosition[0]+i, foundPosition[1]+j);
                    if(cell){
                        gridCell.type = 'tetrimino';
                        //process.stdout.write("["+(foundPosition[0]+i)+", "+(foundPosition[1]+j)+"] ");
                    }
                });
            });
            //console.log("");
            return copy;
        }
    }


    return [];
}

var produceAdjacents = function(node, knownMoves, maxX, maxY){
    var a = _.now();
    var originalTetriminoLocation = node.tetriminoLocation;
    if(_.isUndefined(originalTetriminoLocation) ||
        _.isUndefined(originalTetriminoLocation.foundPosition) ||
        _.isUndefined(originalTetriminoLocation.foundShape) ||
        _.isUndefined(originalTetriminoLocation.currentTetrimino)){
        originalTetriminoLocation = findPiece(node.stage);
    }
    //process.stdout.write("ProduceAdjacents = ");
    var adjacents = _.reduce(knownMoves, function(list, move){
        if(!_.isUndefined(originalTetriminoLocation) &&
            !_.isUndefined(originalTetriminoLocation.foundPosition) &&
            !_.isUndefined(originalTetriminoLocation.foundShape) &&
            !_.isUndefined(originalTetriminoLocation.currentTetrimino)){
            var tetriminoLocation = {
                currentTetrimino: originalTetriminoLocation.currentTetrimino,
                foundShape: originalTetriminoLocation.foundShape,
                foundPosition: [
                    originalTetriminoLocation.foundPosition[0],
                    originalTetriminoLocation.foundPosition[1]
                ],
            }

            //console.log(move+" "+JSON.stringify(tetriminoLocation));

            var tick = _.now();
            var lastAction = node.action;
            if(!_.isUndefined(originalTetriminoLocation.foundPosition)){
                if(lastAction == 'down'){
                    tetriminoLocation.foundPosition[1] += 1;
                    if(tetriminoLocation.foundPosition[1] > maxY -1 ){
                        tetriminoLocation.foundPosition[1] = maxY - 1;
                    }
                } else if(lastAction == 'left'){
                    tetriminoLocation.foundPosition[0] -= 1;
                    if(tetriminoLocation.foundPosition[0] < 0){
                        tetriminoLocation.foundPosition[0] = 0;
                    }
                } else if(lastAction == 'right'){
                    tetriminoLocation.foundPosition[0] += 1;
                    if(tetriminoLocation.foundPosition[0] > maxX -1){
                        tetriminoLocation.foundPosition[0] = maxX - 1;
                    }
                }
            }
            if(!_.isUndefined(tetriminoLocation.foundShape)){
                if(lastAction == 'spinCW'){
                    var size = _.size(TETRIMINOS[tetriminoLocation.currentTetrimino]);
                    if(tetriminoLocation.foundShape == size -1){
                        tetriminoLocation.foundShape = 0;
                    } else{
                        tetriminoLocation.foundShape++;
                    }
                } else if(lastAction == 'spinCCW'){
                    var size = _.size(TETRIMINOS[tetriminoLocation.currentTetrimino]);
                    if(tetriminoLocation.foundShape == 0){
                        tetriminoLocation.foundShape = size-1;
                    } else{
                        tetriminoLocation.foundShape--;
                    }
                }
                //process.stdout.write("FixLocation "+move+" "+(_.now()-tick)+" ");
            }
        }
        var tick = _.now();
        var condition = canMove(node.stage, move, tetriminoLocation);
        //process.stdout.write("CanMove "+move+" "+(_.now()-tick)+" ");
        if(condition){
            var tick = _.now();
            var newStage = takeMove(node.stage, move, tetriminoLocation);
            //process.stdout.write("takeMove "+move+" "+(_.now()-tick)+" ");
            list.push(new Node(newStage, node, move, tetriminoLocation));
        }
        return list;
    }, []);

    /*
    console.log("");
    console.log("Size: "+_.size(adjacents));
    console.log("");
    console.log("Original");
    printStage(node.stage);
    console.log("");
    console.log("Adjacents: ");
    _.each(adjacents, function(adj){
        process.stdout.write(adj.action);
        _.each(_.range(13-_.size(adj.action)), function(){
            process.stdout.write(" ");
        })
    })
    console.log("");
    _.each(_.groupBy(node.stage, "y"), function(row, y){
        _.each(adjacents, function(adj){
            _.each(_.groupBy(adj.stage, "y")[y], function(cell){
                process.stdout.write(typeMap[cell.type]);
            });
            process.stdout.write("   ");
        })
        console.log("");
    })
    //process.stdout.write("total = "+(_.now()-a));
    //console.log("");
    */
    return adjacents;
}

var printStage = function(a){
    var rowsA = _.groupBy(a, "y");

    _.each(rowsA, function(rowA){
        _.each(rowA, function(cell){
            process.stdout.write(typeMap[cell.type]);
        });
        console.log("");
    })
}

var printStages = function(a, b){
    var rowsA = _.groupBy(a, "y");
    var rowsB = _.groupBy(b, "y");

    _.each(rowsA, function(rowA, i){
        _.each(rowA, function(cell){
            process.stdout.write(typeMap[cell.type]);
        });
        process.stdout.write("      ");
        _.each(rowsB[i], function(cell){
            process.stdout.write(typeMap[cell.type]);
        });
        console.log("");
    })
}

var equals = function(a, b){
    var rowsA = _.groupBy(a, "y");
    var rowsB = _.groupBy(b, "y");

    var result = _.every(rowsA, function(rowA, i){
         return _.every(rowA, function(cell, j){
             return cell.type == rowsB[i][j].type;
         });
     })

    if(false && Math.random() >= 0.005){
        console.log("Equals = "+result);
        printStages(a, b);
    }

    return result;
}

var contains = function(stages, b){
    return _.some(stages, function(a){
        return equals(a, b);
    })
}

var bfs = function(stage){

    var countDeques = 0;
    var numberOfColumns = _.size(_.groupBy(stage, 'x'));
    var numberOfRows = _.size(_.groupBy(stage, 'y'));
    //process.stdout.write("Begin bfs: ");
    var queue = [new Node(stage)];
    var leafs = [];
    var clearedStages = [stage];

    while(!_.isEmpty(queue)){
        //process.stdout.write("NotEmpty ");
        var s = queue.shift();
        countDeques++;
        //process.stdout.write("Shift ");
        if(isLocked(s)){ // Does not know how to slide.
            //process.stdout.write("IsLocked ");
            leafs.push(s);
            //process.stdout.write("PushLeaf ");
        } else{
            //process.stdout.write("IsNotLocked ");
            var adjacents = produceAdjacents(s, knownMoves, numberOfColumns, numberOfRows);

            /*
            var numberOfRows = _.size(_.groupBy(s.stage, "y"));

            console.log("Size: "+_.size(adjacents));
            _.each(_.range(numberOfRows), function(y){
                _.each(adjacents, function(adj){
                    _.each(_.groupBy(adj.stage, "y")[y], function(cell){
                        process.stdout.write(typeMap[cell.type]);
                    });
                    process.stdout.write("   ");
                });
                console.log("");
            });
            console.log("");
            */

            //process.stdout.write("AdjacentsSize"+_.size(adjacents)+" ");
            _.each(adjacents, function(adj){
                var contained = contains(clearedStages, adj.stage);
                //process.stdout.write("AdjacentContained"+contained+" ");
                if(!contained){ // Also need to check if new price is better =/
                    /*)
                    _.each(clearedStages, function(one, i){
                        console.log("")
                        console.log(i)
                        printStages(one, adj.stage);
                    });
                    console.log("");
                    */
                    //process.stdout.write("Push ");
                    queue.push(adj);
                    clearedStages.push(adj.stage);
                }
            })
        }
    }
    //console.log("");
    //console.log("Result: "+leafs);
    //console.log("count = "+countDeques);
    _.each(leafs, function(leaf, t){
        var tetriminoLocation = leaf.tetriminoLocation;
        var shape = TETRIMINOS[tetriminoLocation.currentTetrimino][tetriminoLocation.foundShape];
        var position = tetriminoLocation.foundPosition;
        _.each(shape, function(fx, j){
            _.each(fx, function(cell, i){
                var cellGrid = _.findWhere(leaf.stage, {x: position[0] + i, y: position[1] + j});
                if(!_.isUndefined(cellGrid) && cell){
                    cellGrid.type = 'solid';
                }
            });
        });
    });
    return leafs;
}

var takeAction = function(){
    try{
        var now = _.now();
        if(now - lastAction > 1){
            if(actions < 1000){
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

                        if(false){
                            console.log("Evaluation value: "+evaluate(cells));
                            _.each(rows, function(row){
                                console.log(_.reduce(row, function(memo, cell){
                                    return memo + typeMap[cell.type];
                                }, ""));
                            });
                            console.log("");
                        }

                        var tick = _.now();
                        //process.stdout.write("Calling bfs... ");
                        var leafNodes = bfs(cells);
                        //console.log("returned in: "+(_.now() - tick));
                        //console.log("Leafs: "+_.size(leafNodes));

                        var goal = _.sortBy(leafNodes, function(leaf){
                            return - evaluate(leaf.stage);
                        })[0];

                        if(!_.isUndefined(goal)){
                            var plan = goal.plan();

                            //printStage(goal.stage);

                            //console.log(goal.tetriminoLocation);

                            if(!_.isEmpty(plan)){
                                process.stdout.write("Plan = ");
                            }
                            _.each(plan, function(action){
                                process.stdout.write(action+" ");
                                driver[action]();
                            });
                            if(!_.isEmpty(plan)){
                                console.log("");
                            }
                        }

                        actions++;
                        scheduleNextMove();
                    } catch(e){
                        console.log(e.stack);
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
        console.log(e.stack);
    }
}

var run = function(){
    console.log("Crixalis is running");

    browser = webdriverio.remote(options).init();

    browserReady = false;

    tick = _.now();

    console.log("Opening browser")
    browser = browser.url('localhost:3000/html/tetris.html');

    initTime = _.now();
    lastAction = initTime;
    actions = 0;
    scheduleNextMove();
}

exports.run = run;
exports.produceAdjacents = produceAdjacents;
exports.exports = exports;
exports.knownMoves = knownMoves;
exports.Node = Node;
exports.bfs = bfs;
exports.evaluate = evaluate;
exports.TETRIMINOS = TETRIMINOS;
exports.printStage = printStage;