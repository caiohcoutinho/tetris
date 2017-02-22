var webdriverio = require('webdriverio');
var hash = require('object-hash');
var _ = require('underscore');
var options = {
    desiredCapabilities: {
        browserName: 'chrome',
    }
};

var PERF_TAKE_ACTION = false;
var PERF_BFS = false;
var DEBUG_BFS = false;
var DEBUG_EQUALS = false;
var DEBUG_FIND_PIECE = false;

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
            if(condition && cell.type == 'tetrimino'){
                //console.log("isLocked Condition: "+condition+" "+i);
            }
            return condition;
        });
        return willCollide;
    })
}

var knownMoves = ["down", "left", "right", "spinCW", "spinCCW"];
//var knownMoves = ["down"];

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
        if(DEBUG_FIND_PIECE) console.log('reuse');
        var foundPosition = lastLocation.foundPosition;
        var found = _.some(TETRIMINOS, function(shapes, tetrimino){
            if(DEBUG_FIND_PIECE) console.log("trying "+tetrimino);
            return _.some(shapes, function(shape, k){
                if(DEBUG_FIND_PIECE) console.log("trying shape "+k);
                return _.some(_.range(foundPosition[0]-offLimits-1, foundPosition[0]+offLimits+1), function(x){
                    return _.some(_.range(foundPosition[1]-offLimits-1, foundPosition[1]+offLimits+1), function(y){
                        if(DEBUG_FIND_PIECE) console.log("trying "+x+" "+y+" ");
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
                                    notAllOutOfGrid = true;
                                }

                                return !tetriminoOutOfScreen && (matchTetrimino || outOfGrid || matchEmpty);
                            });
                        });
                        if(found && notAllOutOfGrid){
                            currentTetrimino = tetrimino;
                            foundPosition = [x, y];
                            foundShape = k;
                            if(DEBUG_FIND_PIECE) console.log("Found! "+JSON.stringify(found));
                        }
                        return found && notAllOutOfGrid;
                    });
                });
            });
        });
    }
    if(!found){
        var found = _.some(TETRIMINOS, function(shapes, tetrimino){
            if(DEBUG_FIND_PIECE) console.log("trying "+tetrimino);
            return _.some(shapes, function(shape, k){
                if(DEBUG_FIND_PIECE) console.log("trying shape "+k);
                return _.some(_.range(-offLimits, numberOfColumns+offLimits), function(x){
                    return _.some(_.range(-offLimits, numberOfRows+offLimits), function(y){
                        if(DEBUG_FIND_PIECE) console.log("trying "+x+" "+y+" ");
                        if(DEBUG_FIND_PIECE) console.log(shape);
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
                                    notAllOutOfGrid = true;
                                }

                                return !tetriminoOutOfScreen && (matchTetrimino || outOfGrid || matchEmpty);
                            });
                        });
                        if(found && notAllOutOfGrid){
                            currentTetrimino = tetrimino;
                            foundPosition = [x, y];
                            foundShape = k;
                            if(DEBUG_FIND_PIECE) console.log("Found! "+JSON.stringify(found));
                        }
                        return found && notAllOutOfGrid;
                    });
                });
            });
        });
    }
    var diff = (_.now()-tick);
    var obj = {
        currentTetrimino: currentTetrimino,
        foundPosition: foundPosition,
        foundShape: foundShape,
    }
    if(DEBUG_FIND_PIECE) console.log(obj);
    return obj;
}

var canMove = function(stage, move, found){
    var columns = _.groupBy(stage, "x");
    var numberOfColumns = _.size(columns);
    var rows = _.groupBy(stage, "y");
    var numberOfRows = _.size(rows);
    if(move == 'down'){
        return _.every(columns, function(column, i, thisColumns){
            return _.every(column, function(cell, j, thisColumn){
                var condition = cell.type != "tetrimino" ||
                                (j < (numberOfRows - 1) && thisColumn[j+1].type != "solid")

                /*
                if(cell.type == 'tetrimino' && i == 1){
                    console.log(condition+" j = "+j);
                }
                */
                return condition;
            });
        });
    } else if(move == 'left'){
        var text = "";
       var condition = _.every(rows, function(row, i, thisRows){
           return _.every(row, function(cell, j, thisRow){
               var condition = cell.type != "tetrimino" ||
                   (j > 0 && thisRow[j-1].type != "solid");
               if(cell.type == 'tetrimino' && condition){
                    text += "["+i+","+j+"] ";
               }
               return condition;
           });
       });
       return condition;
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
            //console.log("o = "+move );
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

var iterateOneStep = function(originalTetriminoLocation, action, maxX, maxY){
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
        var lastAction = action;
        if(!_.isUndefined(originalTetriminoLocation.foundPosition)){
            if(lastAction == 'down'){
                tetriminoLocation.foundPosition[1] += 1;
            } else if(lastAction == 'left'){
                tetriminoLocation.foundPosition[0] -= 1;
            } else if(lastAction == 'right'){
                tetriminoLocation.foundPosition[0] += 1;
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
    return tetriminoLocation;
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
        var tetriminoLocation = iterateOneStep(originalTetriminoLocation, node.action, maxX, maxY);
        var tick = _.now();
        var condition = canMove(node.stage, move, tetriminoLocation);
        if(condition){
            var tick = _.now();
            var newStage = takeMove(node.stage, move, tetriminoLocation);
            //process.stdout.write("takeMove "+move+" "+(_.now()-tick)+" ");
            //console.log("Tetrimino Location Position: " + tetriminoLocation.foundPosition);
            list.push(new Node(newStage, node, move, tetriminoLocation));
        }
        return list;
    }, []);

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

    var hashA = generateHash(a);
    var hashB = generateHash(b);

    return hashA == hashB;

    var groupsA = _.groupBy(a, "type");
    var groupsB = _.groupBy(b, "type");

    var result = _.every(groupsA["tetrimino"], function(cell, i){
        return cell.type == groupsB["tetrimino"][i].type;
    });

    if(!!result){
        result = _.every(groupsA["solid"], function(cell, i){
            return cell.type == groupsB["solid"][i].type;
        });
    }

    if(!!result){
        result = _.every(groupsA["empty"], function(cell, i){
            return cell.type == groupsB["empty"][i].type;
        });
    }

    if(DEBUG_EQUALS){
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

var generateHash = function(stage){
    var hash = "";
    _.each(stage, function(cell){
        hash += typeMap[cell.type];
    });
    return hash;
}

var bfs = function(stage){

    var start = _.now();

    var countDeques = 0;
    var numberOfColumns = _.size(_.groupBy(stage, 'x'));
    var numberOfRows = _.size(_.groupBy(stage, 'y'));
    if(DEBUG_BFS) process.stdout.write("Begin bfs: ");
    var queue = [new Node(stage)];
    var leafs = [];
    var clearedStages = [stage];
    var clearedStagesHashes = [hash(stage)];

    var totalIterateTime = 0;
    var totalProduceTime = 0;
    var totalContainsTime = 0;
    var totalCleanTime = 0;
    var totalLockTime = 0;
    var totalLockCount = 0;
    var totalContainsCount = 0;
    var totalGenHashTime = 0;

    while(!_.isEmpty(queue)){
        if(DEBUG_BFS) process.stdout.write("NotEmpty ");
        var s = queue.shift();
        countDeques++;
        if(DEBUG_BFS) process.stdout.write("Shift ");
        var lockTime = _.now();
        if(isLocked(s)){ // Does not know how to slide.
            totalLockCount++;
            totalLockTime += (_.now() - lockTime);
            if(DEBUG_BFS) process.stdout.write("IsLocked ");

            var iterateTime = _.now();
            s.tetriminoLocation = iterateOneStep(s.tetriminoLocation, s.action, numberOfColumns, numberOfRows);
            totalIterateTime += (_.now() - iterateTime);
            leafs.push(s);

            if(DEBUG_BFS) process.stdout.write("PushLeaf ");
        } else{
            totalLockCount++;
            totalLockTime += (_.now() - lockTime);
            if(DEBUG_BFS) process.stdout.write("IsNotLocked ");
            var produceTime = _.now();
            var adjacents = produceAdjacents(s, knownMoves, numberOfColumns, numberOfRows);
            totalProduceTime += (_.now() - produceTime);

            if(DEBUG_BFS) process.stdout.write("AdjacentsSize"+_.size(adjacents)+" ");
            _.each(adjacents, function(adj){

                var genHashTime = _.now();
                var newHash = generateHash(adj.stage);
                totalGenHashTime += _.now() - genHashTime;

                var contained = false;

                var sameHash = _.findWhere(clearedStagesHashes, {hash: newHash});

                if(!_.isUndefined(sameHash)){
                    var containsTime = _.now();
                    contained = contains(sameHash.itens, adj.stage);
                    totalContainsTime += (_.now() - containsTime);
                    totalContainsCount++;
                }
                if(DEBUG_BFS) process.stdout.write("AdjacentContained"+contained+" ");
                if(_.isUndefined(sameHash) && !contained){ // Also need to check if new price is better =/
                    queue.push(adj);
                    clearedStages.push(adj.stage);
                    clearedStagesHashes.push({hash: newHash, itens: [adj.stage]});
                } else if(!_.isUndefined(sameHash) && !contained){
                    queue.push(adj);
                    clearedStages.push(adj.stage);
                    sameHash.itens.push(adj.stage);
                }
            })
        }
    }
    if(DEBUG_BFS) console.log("");
    if(DEBUG_BFS) console.log("Result: "+leafs);
    if(DEBUG_BFS) console.log("count = "+countDeques);
    var cleanTime = _.now();
    _.each(leafs, function(leaf, t){
        if(!_.isUndefined(leaf) &&
            !_.isUndefined(leaf.foundShape) &&
            !_.isUndefined(leaf.currentTetrimino) &&
            !_.isUndefined(leaf.foundPosition)){
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
        }
    });
    totalCleanTime += (_.now() - cleanTime);
    if(_.size(leafs) > 2){
        if(PERF_BFS) console.log("totalIterateTime = "+totalIterateTime);
        if(PERF_BFS) console.log("totalProduceTime = "+totalProduceTime);
        if(PERF_BFS) console.log("totalContainsTime = "+totalContainsTime);
        if(PERF_BFS) console.log("totalContainsCount = "+totalContainsCount);
        if(PERF_BFS) console.log("time per contains = "+(totalContainsTime/totalContainsCount));
        if(PERF_BFS) console.log("totalCleanTime = "+totalCleanTime);
        if(PERF_BFS) console.log("totalLockTime = "+totalLockTime);
        if(PERF_BFS) console.log("totalGenHashTime = "+totalGenHashTime);
        if(PERF_BFS) console.log("totalTime = "+(_.now() - start));
        if(PERF_BFS) console.log("");
    }
    return leafs;
}

var takeAction = function(){
    try{
        var now = _.now();
        if(now - lastAction > 1){
            if(actions < 100000){
                lastAction = now;
                var query = ".driverInfo";

                var result;

                var before = _.now();
                browser.getAttribute(query, "data").then(function(elements){
                    try{
                        var diff = (_.now() - before);
                        time += diff;


                        var cells = [];

                        _.each(JSON.parse(elements), function(row, y){
                            _.each(row, function(cell, x){
                                cells.push({
                                    "color": cell.color,
                                    "type": cell.type,
                                    "x": x,
                                    "y": y,
                                })
                            });
                        });

                        var rows = _.groupBy(cells, "y");

                        //console.log(rows);

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
                        var size = _.size(leafNodes);
                        if(PERF_TAKE_ACTION && size > 2) console.log("Browser = "+diff);
                        if(PERF_TAKE_ACTION && size > 2) console.log("BFS = "+(_.now() - tick));
                        //console.log("Leafs: "+_.size(leafNodes));

                        var tick = _.now();
                        var goal = _.sortBy(leafNodes, function(leaf){
                            return - evaluate(leaf.stage);
                        })[0];
                        if(PERF_TAKE_ACTION && size > 2) console.log("Evaluate = "+(_.now() - tick));

                        var tick = _.now();
                        if(!_.isUndefined(goal)){
                            var plan = goal.plan();

                            if(size > 2) printStage(goal.stage);

                            _.each(plan, function(action){
                                driver[action]();
                            });
                        }
                        if(PERF_TAKE_ACTION && size > 2) console.log("Goal = "+(_.now() - tick));

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
exports.knownMoves = knownMoves;
exports.Node = Node;
exports.bfs = bfs;
exports.evaluate = evaluate;
exports.TETRIMINOS = TETRIMINOS;
exports.printStage = printStage;
exports.findPiece = findPiece;